import type { Finding } from '../findings/model';
import {
  fitImage,
  LINE_HEIGHT,
  type Paragraph,
  ptToIn,
  type Slide,
  type SlideElement,
  SLIDE_H,
  SLIDE_W,
  textBox,
  toParagraphs,
} from '../slides/layout';
import { LABELS, type SlideTheme } from '../slides/theme';
import { type FontSpec, type Measure, type TextRun, wrapRuns } from '../slides/wrap';
import { columns, isLinear, successors } from './graph';
import { type Scenario, scenarioRef, type ScenarioStep, stepView, type StepView } from './model';
import { scenarioSeverity, SEVERITY_COLOURS } from './rating';

/** A scenario never takes more than this many slides; beyond, export is blocked. */
export const MAX_SCENARIO_SLIDES = 2;
/** Font size of step titles before any reduction. Never below the theme minimum. */
export const STEP_FONT_PT = 12;

const MARGIN = 0.5;
const RIGHT = SLIDE_W - MARGIN;
const CONTENT_W = RIGHT - MARGIN;
const FLOW_TOP = 2.15;
const BOTTOM_H = 1.5;
const FOOTER_Y = SLIDE_H - 0.5;
const BOTTOM_TOP = FOOTER_Y - 0.15 - BOTTOM_H;
const MARKER_H = 0.3;
const MAX_COLS = 6;
const PREFERRED_COLS = 4;
const GAP_X = 0.45;
const GAP_Y = 0.35;
const PAD = 0.08;
const STRIP = 0.07;
const MIN_NODE_W = 1.6;
const MAX_NODE_W = 2.8;
const MIN_NODE_H = 0.6;

export interface Area {
  x: number;
  y: number;
  w: number;
  h: number;
}

export interface FlowFit {
  cols: number;
  rows: number;
  nodeW: number;
  nodeH: number;
  sizePt: number;
}

interface NodeText {
  tag: TextRun[];
  title: TextRun[];
  gains: TextRun[];
}

export interface ScenarioLayout {
  slides: Slide[];
  /** The flow does not fit on MAX_SCENARIO_SLIDES slides even at the minimum font size. */
  blocked: boolean;
  /** Font size used for step titles. */
  fontPt: number;
  /** Index of the first step on the second slide, when split. */
  splitAt?: number;
}

/** Linear blend of two #rrggbb colours (t = 0 → a, 1 → b). */
export function mix(a: string, b: string, t: number): string {
  const ch = (hex: string, i: number) => parseInt(hex.slice(1 + i * 2, 3 + i * 2), 16);
  return (
    '#' +
    [0, 1, 2]
      .map((i) =>
        Math.round(ch(a, i) * (1 - t) + ch(b, i) * t)
          .toString(16)
          .padStart(2, '0'),
      )
      .join('')
  );
}

const sizesFor = (sizePt: number, minPt: number) => ({
  title: Math.max(minPt, sizePt),
  small: Math.max(minPt, sizePt - 2),
});

function nodeTexts(scenario: Scenario, views: StepView[], theme: SlideTheme): NodeText[] {
  const L = LABELS[theme.language];
  return scenario.steps.map((step, i) => {
    const v = views[i];
    const parts: string[] = [`${i + 1}.`];
    if (!v || v.missing) parts.push(L.scenario.missing);
    else if (step.kind === 'finding') {
      parts.push(v.severity ? `${v.tag} · ${L.severity[v.severity]}` : v.tag);
    } else parts.push(v.tag ? `${L.scenario.technique} · ${v.tag}` : L.scenario.technique);
    const tag: TextRun[] = [{ text: parts.join(' '), bold: true }];
    if (step.chainBreaker) tag.push({ text: ` · ${L.scenario.chainBreaker}`, bold: true });
    const title = v && !v.missing ? v.title || (step.kind === 'finding' ? L.untitled : '…') : '';
    const gains = step.gains.trim();
    return {
      tag,
      title: title ? [{ text: title, bold: true }] : [],
      gains: gains ? [{ text: `→ ${gains}` }] : [],
    };
  });
}

/** Height of one node for a given width and font size (inches). */
function nodeHeight(
  t: NodeText,
  nodeW: number,
  sizePt: number,
  theme: SlideTheme,
  measure: Measure,
): number {
  const s = sizesFor(sizePt, theme.minFontPt);
  const innerW = nodeW - STRIP - 2 * PAD;
  const font = (pt: number): FontSpec => ({
    family: theme.bodyFont,
    monoFamily: theme.monoFont,
    sizePt: pt,
  });
  const lines = (runs: TextRun[], pt: number) =>
    runs.length ? wrapRuns(runs, innerW, font(pt), measure).length : 0;
  const lh = (pt: number) => ptToIn(pt) * LINE_HEIGHT;
  const h =
    2 * PAD +
    lines(t.tag, s.small) * lh(s.small) +
    lines(t.title, s.title) * lh(s.title) +
    lines(t.gains, s.small) * lh(s.small);
  return Math.max(MIN_NODE_H, h);
}

/**
 * Finds the grid (columns × rows) for a snake flow of `texts` in `area` at `sizePt`, or null when
 * nothing fits. Prefers few rows, at most PREFERRED_COLS columns, and few empty slots.
 */
export function fitFlow(
  texts: NodeText[],
  area: Area,
  sizePt: number,
  theme: SlideTheme,
  measure: Measure,
): FlowFit | null {
  const n = texts.length;
  if (n === 0) return { cols: 0, rows: 0, nodeW: 0, nodeH: 0, sizePt };
  const candidates = Array.from({ length: Math.min(n, MAX_COLS) }, (_, i) => i + 1)
    .map((cols) => ({ cols, rows: Math.ceil(n / cols) }))
    .sort(
      (a, b) =>
        a.rows +
          (a.cols > PREFERRED_COLS ? 10 : 0) -
          (b.rows + (b.cols > PREFERRED_COLS ? 10 : 0)) || a.rows * a.cols - b.rows * b.cols,
    );
  for (const { cols, rows } of candidates) {
    const nodeW = Math.min(MAX_NODE_W, (area.w - (cols - 1) * GAP_X) / cols);
    if (nodeW < MIN_NODE_W) continue;
    const nodeH = Math.max(...texts.map((t) => nodeHeight(t, nodeW, sizePt, theme, measure)));
    if (rows * nodeH + (rows - 1) * GAP_Y <= area.h + 1e-6) {
      return { cols, rows, nodeW, nodeH, sizePt };
    }
  }
  return null;
}

/** Position of step `i` in a snake grid: rows alternate left→right and right→left. */
export function snakeCell(i: number, cols: number): { row: number; col: number } {
  const row = Math.floor(i / cols);
  const c = i % cols;
  return { row, col: row % 2 === 0 ? c : cols - 1 - c };
}

function fontSizes(theme: SlideTheme): number[] {
  const sizes: number[] = [];
  for (let s = Math.max(STEP_FONT_PT, theme.minFontPt); s >= theme.minFontPt; s--) sizes.push(s);
  return sizes;
}

const singleArea = (): Area => ({
  x: MARGIN,
  y: FLOW_TOP,
  w: CONTENT_W,
  h: BOTTOM_TOP - 0.15 - FLOW_TOP,
});
const firstOfTwoArea = (): Area => ({
  x: MARGIN,
  y: FLOW_TOP,
  w: CONTENT_W,
  h: FOOTER_Y - 0.15 - MARKER_H - FLOW_TOP,
});
const secondOfTwoArea = (): Area => ({
  x: MARGIN,
  y: FLOW_TOP + MARKER_H,
  w: CONTENT_W,
  h: BOTTOM_TOP - 0.15 - FLOW_TOP - MARKER_H,
});

/** Lays out a scenario on one slide, or two split at a step boundary, or reports it blocked. */
export function layoutScenario(
  scenario: Scenario,
  findings: Map<string, Finding>,
  theme: SlideTheme,
  measure: Measure,
): ScenarioLayout {
  const views = scenario.steps.map((s) => stepView(s, findings));
  const texts = nodeTexts(scenario, views, theme);
  const sizes = fontSizes(theme);
  const succ = successors(scenario.steps);
  if (!isLinear(succ)) return layoutGraph(scenario, views, texts, succ, theme, measure);

  for (const size of sizes) {
    const fit = fitFlow(texts, singleArea(), size, theme, measure);
    if (fit) {
      return {
        slides: [
          buildSlide(
            scenario,
            views,
            texts,
            fit,
            0,
            texts.length,
            singleArea(),
            theme,
            measure,
            'only',
          ),
        ],
        blocked: false,
        fontPt: size,
      };
    }
  }
  const n = texts.length;
  for (const size of sizes) {
    // Split as evenly as possible; try split points moving away from the middle.
    const order = Array.from({ length: n - 1 }, (_, i) => i + 1).sort(
      (a, b) => Math.abs(a - n / 2) - Math.abs(b - n / 2) || b - a,
    );
    for (const k of order) {
      const a = fitFlow(texts.slice(0, k), firstOfTwoArea(), size, theme, measure);
      const b = a && fitFlow(texts.slice(k), secondOfTwoArea(), size, theme, measure);
      if (a && b) {
        return {
          slides: [
            buildSlide(scenario, views, texts, a, 0, k, firstOfTwoArea(), theme, measure, 'first'),
            buildSlide(
              scenario,
              views,
              texts,
              b,
              k,
              n - k,
              secondOfTwoArea(),
              theme,
              measure,
              'second',
            ),
          ],
          blocked: false,
          fontPt: size,
          splitAt: k,
        };
      }
    }
  }
  // Too long even on two slides at the minimum size: show it overflowing, block export.
  const size = theme.minFontPt;
  const k = Math.ceil(n / 2);
  const forced = (part: NodeText[], area: Area): FlowFit => {
    const cols = Math.max(1, Math.min(MAX_COLS, part.length));
    const nodeW = (area.w - (cols - 1) * GAP_X) / cols;
    const nodeH = Math.max(...part.map((t) => nodeHeight(t, nodeW, size, theme, measure)));
    return { cols, rows: Math.ceil(part.length / cols), nodeW, nodeH, sizePt: size };
  };
  const slides = [
    buildSlide(
      scenario,
      views,
      texts,
      forced(texts.slice(0, k), firstOfTwoArea()),
      0,
      k,
      firstOfTwoArea(),
      theme,
      measure,
      'first',
    ),
    buildSlide(
      scenario,
      views,
      texts,
      forced(texts.slice(k), secondOfTwoArea()),
      k,
      n - k,
      secondOfTwoArea(),
      theme,
      measure,
      'second',
    ),
  ];
  slides[0]?.warnings.unshift(
    `The flow does not fit on ${MAX_SCENARIO_SLIDES} slides, even at ${theme.minFontPt} pt. Shorten step titles and gains, or split the scenario in two. Export is blocked.`,
  );
  return { slides, blocked: true, fontPt: size, splitAt: k };
}

type Part = 'only' | 'first' | 'second';

function buildSlide(
  scenario: Scenario,
  views: StepView[],
  texts: NodeText[],
  fit: FlowFit,
  offset: number,
  count: number,
  area: Area,
  theme: SlideTheme,
  measure: Measure,
  part: Part,
  /** Prebuilt flow elements (branching scenarios); otherwise the snake flow is drawn. */
  flow?: SlideElement[],
): Slide {
  const L = LABELS[theme.language];
  const c = theme.colors;
  const bodyPt = Math.max(theme.minFontPt, 12);
  const smallPt = Math.max(theme.minFontPt, 10);
  const headingPt = Math.max(theme.minFontPt, 13);
  const fonts = { family: theme.bodyFont, monoFamily: theme.monoFont };
  const heading = { family: theme.headingFont, monoFamily: theme.monoFont };
  const elements: SlideElement[] = [];
  const warnings: string[] = [];

  // Header: reference, title, impact and likelihood pills, starting position and goal.
  const pillW = 2.7;
  const pillH = 0.36;
  elements.push(
    textBox(
      [{ runs: [{ text: scenarioRef(scenario.number) }] }],
      {
        role: 'ref',
        x: MARGIN,
        y: 0.35,
        w: 3,
        h: 0.3,
        sizePt: Math.max(theme.minFontPt, 12),
        color: c.muted,
        ...heading,
      },
      measure,
    ),
  );
  const titleText = scenario.title.trim() || L.scenario.untitled;
  const titlePt = Math.max(theme.minFontPt, 24);
  const title = textBox(
    [{ runs: [{ text: titleText }] }],
    {
      role: 'title',
      x: MARGIN,
      y: 0.62,
      w: RIGHT - pillW - 0.3 - MARGIN,
      h: ptToIn(titlePt) * LINE_HEIGHT * 1.02,
      sizePt: titlePt,
      color: c.text,
      bold: true,
      ...heading,
    },
    measure,
  );
  elements.push(title);
  if (title.hiddenLines) warnings.push('The scenario title is too long for one line. Shorten it.');
  // Severity pill, then exploitability and impact underneath.
  const S = L.scenario;
  const { exploitability, impact } = scenario;
  const severity = exploitability && impact ? scenarioSeverity(exploitability, impact) : null;
  const pill = severity
    ? theme.severity[SEVERITY_COLOURS[severity]]
    : { bg: c.muted, fg: c.background };
  elements.push(
    {
      kind: 'rect',
      x: RIGHT - pillW,
      y: 0.35,
      w: pillW,
      h: pillH,
      fill: pill.bg,
      radius: pillH / 2,
    },
    textBox(
      [
        {
          runs: [
            { text: `${S.severity}: ` },
            { text: severity ? S.levels.severity[severity] : S.notRated, bold: true },
          ],
        },
      ],
      {
        role: 'pill',
        x: RIGHT - pillW,
        y: 0.35,
        w: pillW,
        h: pillH,
        sizePt: smallPt + 1,
        color: pill.fg,
        align: 'center',
        valign: 'middle',
        ...fonts,
      },
      measure,
    ),
  );
  (
    [
      [
        S.exploitability,
        scenario.exploitability && S.levels.exploitability[scenario.exploitability],
        0.79,
      ],
      [S.impact, scenario.impact && S.levels.impact[scenario.impact], 1.0],
    ] as const
  ).forEach(([label, value, y]) => {
    elements.push(
      textBox(
        [{ runs: [{ text: `${label}: ` }, { text: value || S.notRated, bold: true }] }],
        {
          role: 'rating',
          x: RIGHT - pillW - 0.6,
          y,
          w: pillW + 0.6,
          h: 0.22,
          sizePt: smallPt,
          color: c.muted,
          align: 'right',
          ...fonts,
        },
        measure,
      ),
    );
  });
  const colW = (CONTENT_W - 0.4) / 2;
  const lineH = ptToIn(bodyPt) * LINE_HEIGHT;
  (
    [
      [L.scenario.start, scenario.start, MARGIN, 'start'],
      [L.scenario.goal, scenario.goal, MARGIN + colW + 0.4, 'goal'],
    ] as const
  ).forEach(([label, text, x, role]) => {
    const box = textBox(
      [
        {
          runs: [
            { text: `${label}: `, bold: true },
            { text: text.replace(/\s+/g, ' ').trim() || '—' },
          ],
        },
      ],
      { role, x, y: 1.35, w: colW, h: lineH * 2, sizePt: bodyPt, color: c.text, ...fonts },
      measure,
    );
    elements.push(box);
    if (box.hiddenLines) warnings.push(`“${label}” is longer than two lines. Shorten it.`);
  });
  elements.push({
    kind: 'line',
    x1: MARGIN,
    y1: 1.98,
    x2: RIGHT,
    y2: 1.98,
    color: c.accent,
    widthPt: 1.5,
  });

  // Flow.
  const stepsHere = texts.slice(offset, offset + count);
  if (part === 'second') {
    elements.push(
      textBox(
        [{ runs: [{ text: L.scenario.continuedFrom }] }],
        {
          role: 'continued-from',
          x: MARGIN,
          y: FLOW_TOP,
          w: 6,
          h: MARKER_H,
          sizePt: smallPt,
          color: c.muted,
          ...fonts,
        },
        measure,
      ),
    );
  }
  if (!texts.length) {
    elements.push(
      textBox(
        [{ runs: [{ text: L.scenario.noSteps }] }],
        {
          role: 'empty',
          x: area.x,
          y: area.y + area.h / 2 - 0.2,
          w: area.w,
          h: 0.4,
          sizePt: bodyPt,
          color: c.muted,
          align: 'center',
          ...fonts,
        },
        measure,
      ),
    );
  }
  elements.push(
    ...(flow ?? flowElements(scenario, views, stepsHere, fit, offset, area, theme, measure)),
  );
  if (part === 'first') {
    elements.push(
      textBox(
        [{ runs: [{ text: L.scenario.continuedOn }] }],
        {
          role: 'continued-on',
          x: RIGHT - 6,
          y: FOOTER_Y - 0.15 - MARKER_H,
          w: 6,
          h: MARKER_H,
          sizePt: smallPt,
          color: c.muted,
          align: 'right',
          ...fonts,
        },
        measure,
      ),
    );
  }

  // Bottom: context and "Break the chain" (on the last slide only).
  if (part !== 'first') {
    const breakers = scenario.steps
      .map((s, i) => ({ s, v: views[i] }))
      .filter(({ s }) => s.chainBreaker)
      .map(({ s, v }): Paragraph => {
        const name =
          v && !v.missing ? [v.tag, v.title].filter(Boolean).join(' ') : L.scenario.missing;
        const advice = toParagraphs(s.note.trim() || v?.recommendation || '')[0]?.runs ?? [];
        return {
          bullet: true,
          runs: [{ text: name, bold: true }, ...(advice.length ? [{ text: ': ' }, ...advice] : [])],
        };
      });
    if (scenario.steps.length && !breakers.length) {
      warnings.push('No step is marked as a chain breaker: “Break the chain” is empty.');
    }
    const headingH = ptToIn(headingPt) * LINE_HEIGHT;
    (
      [
        [L.scenario.context, toParagraphs(scenario.context), MARGIN],
        [L.scenario.breakChain, breakers, MARGIN + colW + 0.4],
      ] as const
    ).forEach(([label, paragraphs, x]) => {
      if (!paragraphs.length) return;
      elements.push(
        textBox(
          [{ runs: [{ text: label }] }],
          {
            role: 'heading',
            x,
            y: BOTTOM_TOP,
            w: colW,
            h: headingH,
            sizePt: headingPt,
            color: c.accent,
            bold: true,
            ...heading,
          },
          measure,
        ),
      );
      const box = textBox(
        paragraphs,
        {
          role: 'section',
          x,
          y: BOTTOM_TOP + headingH,
          w: colW,
          h: BOTTOM_H - headingH,
          sizePt: bodyPt,
          color: c.text,
          ...fonts,
        },
        measure,
      );
      elements.push(box);
      if (box.hiddenLines) {
        warnings.push(
          `“${label}” overflows by ${box.hiddenLines} line${box.hiddenLines > 1 ? 's' : ''}. Shorten it.`,
        );
      }
    });
  }

  // Footer and logo.
  elements.push(
    textBox(
      [{ runs: [{ text: theme.footerText }] }],
      {
        role: 'footer',
        x: MARGIN,
        y: FOOTER_Y,
        w: 8,
        h: 0.3,
        sizePt: smallPt,
        color: c.muted,
        ...fonts,
      },
      measure,
    ),
  );
  if (theme.logo) {
    elements.push({
      kind: 'image',
      source: 'logo',
      alt: L.logo,
      ...fitImage(theme.logo.width, theme.logo.height, {
        x: RIGHT - 1.6,
        y: SLIDE_H - 0.62,
        w: 1.6,
        h: 0.45,
      }),
    });
  }
  views.slice(offset, offset + stepsHere.length).forEach((v, i) => {
    if (v.missing) warnings.push(`Step ${offset + i + 1} points to a deleted finding.`);
  });
  return { width: SLIDE_W, height: SLIDE_H, background: c.background, elements, warnings };
}

function flowElements(
  scenario: Scenario,
  views: StepView[],
  texts: NodeText[],
  fit: FlowFit,
  offset: number,
  area: Area,
  theme: SlideTheme,
  measure: Measure,
): SlideElement[] {
  if (!texts.length) return [];
  const c = theme.colors;
  const usedW = fit.cols * fit.nodeW + (fit.cols - 1) * GAP_X;
  const usedH = fit.rows * fit.nodeH + (fit.rows - 1) * GAP_Y;
  const x0 = area.x + (area.w - usedW) / 2;
  const y0 = area.y + Math.max(0, (area.h - usedH) / 2);
  const box = (i: number) => {
    const { row, col } = snakeCell(i, fit.cols);
    return { x: x0 + col * (fit.nodeW + GAP_X), y: y0 + row * (fit.nodeH + GAP_Y), row };
  };
  const elements: SlideElement[] = [];

  // Connectors first, so nodes sit on top of them.
  for (let i = 0; i + 1 < texts.length; i++) {
    const a = box(i);
    const b = box(i + 1);
    const line =
      a.row === b.row
        ? b.x > a.x
          ? { x1: a.x + fit.nodeW, y1: a.y + fit.nodeH / 2, x2: b.x, y2: b.y + fit.nodeH / 2 }
          : { x1: a.x, y1: a.y + fit.nodeH / 2, x2: b.x + fit.nodeW, y2: b.y + fit.nodeH / 2 }
        : { x1: a.x + fit.nodeW / 2, y1: a.y + fit.nodeH, x2: b.x + fit.nodeW / 2, y2: b.y };
    elements.push({ kind: 'line', ...line, color: c.muted, widthPt: 1.5, arrowEnd: true });
  }

  texts.forEach((t, i) => {
    const step = scenario.steps[offset + i];
    const v = views[offset + i];
    if (!step || !v) return;
    const { x, y } = box(i);
    elements.push(
      ...nodeElements(step, v, t, { x, y, w: fit.nodeW, h: fit.nodeH }, fit.sizePt, theme, measure),
    );
  });
  return elements;
}

/** One step box: outline, severity strip, tag, title and gains. */
function nodeElements(
  step: ScenarioStep,
  v: StepView,
  t: NodeText,
  r: Area,
  sizePt: number,
  theme: SlideTheme,
  measure: Measure,
): SlideElement[] {
  const c = theme.colors;
  const s = sizesFor(sizePt, theme.minFontPt);
  const fonts = { family: theme.bodyFont, monoFamily: theme.monoFont };
  const nodeFill = mix(c.background, c.text, 0.05);
  const elements: SlideElement[] = [];
  const { x, y } = r;
  const stripColor = v.missing
    ? c.muted
    : step.kind === 'finding' && v.severity
      ? theme.severity[v.severity].bg
      : c.muted;
  elements.push({
    kind: 'rect',
    x,
    y,
    w: r.w,
    h: r.h,
    fill: v.missing ? c.background : nodeFill,
    radius: 0.06,
    stroke: step.chainBreaker ? c.accent : c.muted,
    strokePt: step.chainBreaker ? 2.25 : 0.75,
    dashed: v.missing,
  });
  elements.push({ kind: 'rect', x, y, w: STRIP, h: r.h, fill: stripColor });
  const innerX = x + STRIP + PAD;
  const innerW = r.w - STRIP - 2 * PAD;
  let ty = y + PAD;
  const add = (runs: TextRun[], pt: number, color: string, role: string) => {
    if (!runs.length) return;
    const tb = textBox(
      [{ runs }],
      { role, x: innerX, y: ty, w: innerW, h: r.h, sizePt: pt, color, ...fonts },
      measure,
    );
    tb.h = tb.lines.length * ptToIn(pt) * LINE_HEIGHT;
    tb.hiddenLines = 0;
    ty += tb.h;
    elements.push(tb);
  };
  add(t.tag, s.small, step.chainBreaker ? c.accent : c.muted, 'step-tag');
  add(t.title, s.title, c.text, 'step-title');
  add(t.gains, s.small, c.accent, 'step-gains');
  return elements;
}

const GRAPH_GAP_X = 0.6;
const GRAPH_GAP_Y = 0.25;

/**
 * Branching scenario: steps in columns from left to right (a step's column is its longest path
 * from a start), arrows for every link. Always one slide: step text is reduced down to the
 * theme minimum; if it still does not fit, export is blocked.
 */
function layoutGraph(
  scenario: Scenario,
  views: StepView[],
  texts: NodeText[],
  succ: number[][],
  theme: SlideTheme,
  measure: Measure,
): ScenarioLayout {
  const area = singleArea();
  const g = graphFlow(scenario, views, texts, succ, area, theme, measure);
  const slide = buildSlide(
    scenario,
    views,
    texts,
    g.fit,
    0,
    texts.length,
    area,
    theme,
    measure,
    'only',
    g.elements,
  );
  if (g.blocked) {
    slide.warnings.unshift(
      `The branching flow does not fit on one slide, even at ${theme.minFontPt} pt. Shorten step titles and gains, or remove some paths. Export is blocked.`,
    );
  }
  return { slides: [slide], blocked: g.blocked, fontPt: g.fit.sizePt };
}

/** A branching flow laid out in `area`: columns left to right, arrows for every link. */
function graphFlow(
  scenario: Scenario,
  views: StepView[],
  texts: NodeText[],
  succ: number[][],
  area: Area,
  theme: SlideTheme,
  measure: Measure,
): { elements: SlideElement[]; fit: FlowFit; blocked: boolean } {
  const cols = columns(succ);
  const rows = Math.max(...cols.map((c) => c.length));
  const nodeW = Math.min(MAX_NODE_W, (area.w - (cols.length - 1) * GRAPH_GAP_X) / cols.length);
  const heightAt = (size: number) =>
    Math.max(...texts.map((t) => nodeHeight(t, nodeW, size, theme, measure)));
  const fits = (h: number) =>
    nodeW >= MIN_NODE_W && rows * h + (rows - 1) * GRAPH_GAP_Y <= area.h + 1e-6;
  const size = fontSizes(theme).find((pt) => fits(heightAt(pt))) ?? theme.minFontPt;
  const nodeH = heightAt(size);
  const blocked = !fits(nodeH);

  const usedW = cols.length * nodeW + (cols.length - 1) * GRAPH_GAP_X;
  const x0 = area.x + (area.w - usedW) / 2;
  const pos = new Map<number, { x: number; y: number }>();
  cols.forEach((col, k) => {
    const colH = col.length * nodeH + (col.length - 1) * GRAPH_GAP_Y;
    const top = area.y + Math.max(0, (area.h - colH) / 2);
    col.forEach((i, r) =>
      pos.set(i, { x: x0 + k * (nodeW + GRAPH_GAP_X), y: top + r * (nodeH + GRAPH_GAP_Y) }),
    );
  });

  const colOf = new Map<number, number>();
  cols.forEach((col, k) => col.forEach((i) => colOf.set(i, k)));
  const flow: SlideElement[] = [];
  const segment = (x1: number, y1: number, x2: number, y2: number, arrowEnd = false) =>
    flow.push({ kind: 'line', x1, y1, x2, y2, color: theme.colors.muted, widthPt: 1.5, arrowEnd });
  succ.forEach((next, i) => {
    const a = pos.get(i);
    next.forEach((j) => {
      const b = pos.get(j);
      const from = colOf.get(i) ?? 0;
      const to = colOf.get(j) ?? 0;
      if (!a || !b) return;
      const x1 = a.x + nodeW;
      const y1 = a.y + nodeH / 2;
      const y2 = b.y + nodeH / 2;
      if (to - from <= 1) {
        segment(x1, y1, b.x, y2, true);
        return;
      }
      // The link skips columns: go round the steps in between, above or below them, with
      // right-angle segments in the gaps, so it never seems to enter another step.
      const between = cols
        .slice(from + 1, to)
        .flat()
        .map((k) => pos.get(k));
      const top = Math.min(...between.map((p) => p?.y ?? Infinity));
      const bottom = Math.max(...between.map((p) => (p?.y ?? -Infinity) + nodeH));
      const above = top - GRAPH_GAP_Y / 2;
      const below = bottom + GRAPH_GAP_Y / 2;
      const mid = (y1 + y2) / 2;
      const lane = Math.abs(mid - above) <= Math.abs(mid - below) ? above : below;
      const gx1 = x1 + GRAPH_GAP_X / 2;
      const gx2 = b.x - GRAPH_GAP_X / 2;
      segment(x1, y1, gx1, y1);
      segment(gx1, y1, gx1, lane);
      segment(gx1, lane, gx2, lane);
      segment(gx2, lane, gx2, y2);
      segment(gx2, y2, b.x, y2, true);
    });
  });
  scenario.steps.forEach((step, i) => {
    const v = views[i];
    const t = texts[i];
    const p = pos.get(i);
    if (v && t && p)
      flow.push(...nodeElements(step, v, t, { ...p, w: nodeW, h: nodeH }, size, theme, measure));
  });

  const fit: FlowFit = { cols: cols.length, rows, nodeW, nodeH, sizePt: size };
  return { elements: flow, fit, blocked };
}

/**
 * A scenario's flow drawn in any area of one slide (the report's "Main scenario" box): a snake
 * for a chain, columns for branching paths. Text goes down to the theme minimum; below that the
 * flow is drawn overflowing and `fits` is false.
 */
export function scenarioFlow(
  scenario: Scenario,
  findings: Map<string, Finding>,
  area: Area,
  theme: SlideTheme,
  measure: Measure,
): { elements: SlideElement[]; fits: boolean } {
  const views = scenario.steps.map((s) => stepView(s, findings));
  const texts = nodeTexts(scenario, views, theme);
  if (!texts.length) return { elements: [], fits: true };
  const succ = successors(scenario.steps);
  if (!isLinear(succ)) {
    const g = graphFlow(scenario, views, texts, succ, area, theme, measure);
    return { elements: g.elements, fits: !g.blocked };
  }
  for (const size of fontSizes(theme)) {
    const fit = fitFlow(texts, area, size, theme, measure);
    if (fit) {
      return {
        elements: flowElements(scenario, views, texts, fit, 0, area, theme, measure),
        fits: true,
      };
    }
  }
  const size = theme.minFontPt;
  const cols = Math.max(1, Math.min(MAX_COLS, texts.length));
  const nodeW = (area.w - (cols - 1) * GAP_X) / cols;
  const nodeH = Math.max(...texts.map((t) => nodeHeight(t, nodeW, size, theme, measure)));
  const fit = { cols, rows: Math.ceil(texts.length / cols), nodeW, nodeH, sizePt: size };
  return {
    elements: flowElements(scenario, views, texts, fit, 0, area, theme, measure),
    fits: false,
  };
}
