import {
  effectiveSeverity,
  type Finding,
  findingCvss,
  findingRef,
  type Project,
  sortForReport,
} from '../findings/model';
import {
  QUADRANTS,
  type Quadrant,
  quadrantOf,
  type Recommendation,
  recommendationRef,
  recommendationRows,
  sortForPlan,
} from '../recommendations/model';
import { scenarioFlow } from '../scenarios/layout';
import { type Scenario, scenarioRef } from '../scenarios/model';
import { RATINGS, scenarioSeverity, SEVERITY_COLOURS } from '../scenarios/rating';
import {
  type EvidenceRef,
  fitImage,
  LINE_HEIGHT,
  ptToIn,
  type SlideElement,
  textBox,
} from '../slides/layout';
import { cellParagraphs, recommendationCells, recommendationWidths } from '../slides/table';
import { LABELS } from '../slides/theme';
import {
  type Cell,
  CONTENT_BOTTOM,
  CONTENT_TOP,
  CONTENT_W,
  type Ctx,
  MARGIN,
  para,
  table,
  type TableResult,
} from './draw';
import type { MissionDetails } from './mission';

/** Report deck section slides: attack scenarios, vulnerabilities, action plan. Pure. */

/** What a content slide needs before the header is added: title, body and warnings. */
export interface SlideBody {
  title: string;
  elements: SlideElement[];
  warnings: string[];
}

const scenarioOrder = (a: Scenario, b: Scenario) => {
  const rank = (s: Scenario) =>
    s.exploitability && s.impact
      ? ['Minor', 'Moderate', 'Major', 'Severe'].indexOf(
          scenarioSeverity(s.exploitability, s.impact),
        )
      : -1;
  return rank(b) - rank(a) || a.number - b.number;
};

const severityCell = (ctx: Ctx, s: Scenario): Cell => {
  const S = LABELS[ctx.theme.language].scenario;
  if (!s.exploitability || !s.impact) {
    return { text: S.notRated, align: 'center', color: ctx.theme.colors.muted };
  }
  const sev = scenarioSeverity(s.exploitability, s.impact);
  const c = ctx.theme.severity[SEVERITY_COLOURS[sev]];
  return { text: S.levels.severity[sev], fill: c.bg, color: c.fg, align: 'center', bold: true };
};

/** Takes as many rows as fit below `y` (after the header rows); the rest go on the next slide. */
function splitRows(
  ctx: Ctx,
  x: number,
  y: number,
  widths: number[],
  head: Cell[][],
  rows: Cell[][],
  opts: Parameters<typeof table>[5] = {},
): { first: TableResult; taken: number } {
  let taken = rows.length;
  let t = table(ctx, x, y, widths, [...head, ...rows], opts);
  while (t.overflow && taken > 1) {
    taken--;
    t = table(ctx, x, y, widths, [...head, ...rows.slice(0, taken)], opts);
  }
  return { first: t, taken };
}

// --- Attack scenarios -------------------------------------------------------------------

export function scenarioSummary(ctx: Ctx, scenarios: Scenario[]): SlideBody[] {
  const L = ctx.L.scenarios;
  const S = LABELS[ctx.theme.language].scenario;
  const elements: SlideElement[] = [];
  const warnings: string[] = [];
  const small = ctx.pt(10);

  // Exploitability × impact matrix, each scenario's reference in its cell.
  const cell = 0.92;
  const gx = MARGIN + 1.15;
  const gy = CONTENT_TOP + 0.35;
  elements.push(
    textBox(
      [para(L.exploitabilityAxis, true)],
      {
        role: 'axis',
        x: MARGIN,
        y: CONTENT_TOP,
        w: 3,
        h: 0.3,
        sizePt: small,
        color: ctx.style.primary,
        ...ctx.body,
      },
      ctx.measure,
    ),
  );
  [...RATINGS].reverse().forEach((e, row) => {
    const y = gy + row * cell;
    elements.push(
      textBox(
        [para(S.levels.exploitability[e])],
        {
          role: 'axis-label',
          x: MARGIN,
          y,
          w: 1.1,
          h: cell,
          sizePt: small,
          color: ctx.theme.colors.text,
          align: 'right',
          valign: 'middle',
          ...ctx.body,
        },
        ctx.measure,
      ),
    );
    RATINGS.forEach((imp, col) => {
      const sev = scenarioSeverity(e, imp);
      const c = ctx.theme.severity[SEVERITY_COLOURS[sev]];
      const x = gx + col * cell;
      elements.push({
        kind: 'rect',
        x,
        y,
        w: cell,
        h: cell,
        fill: c.bg,
        stroke: '#ffffff',
        strokePt: 1,
      });
      const here = scenarios
        .filter((s) => s.exploitability === e && s.impact === imp)
        .sort((a, b) => a.number - b.number)
        .map((s) => scenarioRef(s.number));
      if (here.length) {
        const shown = here.length > 3 ? [...here.slice(0, 2), `+${here.length - 2}`] : here;
        elements.push(
          textBox(
            shown.map((r) => para(r, true)),
            {
              role: 'matrix-ref',
              x: x + 0.03,
              y: y + 0.03,
              w: cell - 0.06,
              h: cell - 0.06,
              sizePt: small,
              color: c.fg,
              align: 'center',
              valign: 'middle',
              ...ctx.body,
            },
            ctx.measure,
          ),
        );
      }
    });
  });
  const gridBottom = gy + 5 * cell;
  RATINGS.forEach((imp, col) => {
    elements.push(
      textBox(
        [para(S.levels.impact[imp])],
        {
          role: 'axis-label',
          x: gx + col * cell,
          y: gridBottom + 0.05,
          w: cell,
          h: ptToIn(small) * LINE_HEIGHT * 2,
          sizePt: small,
          color: ctx.theme.colors.text,
          align: 'center',
          ...ctx.body,
        },
        ctx.measure,
      ),
    );
  });
  elements.push(
    textBox(
      [para(L.impactAxis, true)],
      {
        role: 'axis',
        x: gx,
        y: gridBottom + 0.5,
        w: 5 * cell,
        h: 0.3,
        sizePt: small,
        color: ctx.style.primary,
        align: 'right',
        ...ctx.body,
      },
      ctx.measure,
    ),
  );

  // The scenarios, worst first.
  const x = gx + 5 * cell + 0.5;
  const w = MARGIN + CONTENT_W - x;
  const widths = [1.3, w - 1.3 - 1.6, 1.6];
  const head: Cell[][] = [
    [L.reference, L.scenario, L.severity].map((text): Cell => ({
      text,
      fill: ctx.style.primary,
      color: ctx.style.onPrimary,
      bold: true,
      align: 'center',
    })),
  ];
  const rows = [...scenarios]
    .sort(scenarioOrder)
    .map((s): Cell[] => [
      { text: scenarioRef(s.number), align: 'center', bold: true },
      { text: s.title.trim() || S.untitled },
      severityCell(ctx, s),
    ]);
  const bodies: SlideBody[] = [];
  let rest = rows;
  let first = true;
  while (first || rest.length) {
    const { first: t, taken } = splitRows(
      ctx,
      first ? x : MARGIN,
      CONTENT_TOP,
      first ? widths : [1.6, CONTENT_W - 3.6, 2],
      head,
      rest,
    );
    bodies.push({
      title: first ? L.title : `${L.title} ${ctx.L.vulns.continued}`,
      elements: first ? [...elements, ...t.elements] : t.elements,
      warnings: first ? warnings : [],
    });
    rest = rest.slice(taken);
    first = false;
  }
  return bodies;
}

export function scenarioDetail(ctx: Ctx, s: Scenario, findings: Map<string, Finding>): SlideBody {
  const L = ctx.L.scenarios;
  const S = LABELS[ctx.theme.language].scenario;
  const label = (text: string): Cell => ({
    text,
    fill: ctx.style.primary,
    color: ctx.style.onPrimary,
    bold: true,
  });
  const text = (t: string): string => t.trim() || '—';
  const rows: Cell[][] = [
    [label(L.description), { text: paragraphs(s.context), colSpan: 3 }],
    [
      label(S.exploitability),
      { text: s.exploitability ? S.levels.exploitability[s.exploitability] : S.notRated },
      label(L.rationale),
      { text: text(s.exploitabilityRationale) },
    ],
    [
      label(S.impact),
      { text: s.impact ? S.levels.impact[s.impact] : S.notRated },
      label(L.rationale),
      { text: text(s.impactRationale) },
    ],
    [label(L.severity), { ...severityCell(ctx, s), align: 'left', colSpan: 3 }],
  ];
  const warnings: string[] = [];
  const t = table(ctx, MARGIN, CONTENT_TOP, [1.8, 2.4, 1.6, CONTENT_W - 5.8], rows, {
    maxBottom: 4.2,
  });
  if (t.overflow) warnings.push('The description and rationales take too much room. Shorten them.');
  const boxY = Math.max(t.bottom, 2.6) + 0.2;
  const boxH = CONTENT_BOTTOM - boxY;
  const elements: SlideElement[] = [
    ...t.elements,
    {
      kind: 'rect',
      x: MARGIN,
      y: boxY,
      w: CONTENT_W,
      h: boxH,
      fill: '#ffffff',
      stroke: ctx.style.primary,
      strokePt: 1,
    },
    textBox(
      [para(L.main, true)],
      {
        role: 'main-scenario',
        x: MARGIN + 0.12,
        y: boxY + 0.08,
        w: 4,
        h: 0.3,
        sizePt: ctx.pt(11),
        color: ctx.style.primary,
        ...ctx.body,
      },
      ctx.measure,
    ),
  ];
  const flow = scenarioFlow(
    s,
    findings,
    { x: MARGIN + 0.2, y: boxY + 0.45, w: CONTENT_W - 0.4, h: boxH - 0.6 },
    ctx.theme,
    ctx.measure,
  );
  elements.push(...flow.elements);
  if (!flow.fits) warnings.push('The attack path does not fit in the box. Shorten the steps.');
  return {
    title: `${scenarioRef(s.number)} – ${s.title.trim() || S.untitled}`,
    elements,
    warnings,
  };
}

// --- Vulnerabilities ----------------------------------------------------------------------

const MAX_EVIDENCE = 4;

/** Markdown-lite text → table-cell paragraphs. */
export const paragraphs = cellParagraphs;

/** The CVSS letters as shown: modified metrics replace base ones when the environmental score applies. */
function vectorLetters(f: Finding, environmental: boolean): { key: string; value: string }[] {
  const order = ['AV', 'AC', 'PR', 'UI', 'C', 'I', 'A', 'S'] as const;
  const env = (environmental ? f.cvssEnv : undefined) ?? {};
  const modified: Record<string, string | undefined> = {
    AV: env.MAV,
    AC: env.MAC,
    PR: env.MPR,
    UI: env.MUI,
    C: env.MC,
    I: env.MI,
    A: env.MA,
    S: env.MS,
  };
  return order.map((key) => ({ key, value: modified[key] ?? f.cvss[key] }));
}

export function vulnerabilitySlides(
  ctx: Ctx,
  f: Finding,
  evidence: EvidenceRef[],
  recs: Recommendation[],
  project: Project,
): SlideBody[] {
  const L = ctx.L.vulns;
  const sevLabel = ctx.L.appendix.severityNames;
  const cvss = findingCvss(f);
  const severity = effectiveSeverity(f);
  const sevColours = ctx.theme.severity[severity];
  const name = {
    None: sevLabel.info,
    Low: sevLabel.low,
    Medium: sevLabel.medium,
    High: sevLabel.high,
    Critical: sevLabel.critical,
  }[severity];
  const warnings: string[] = [];
  const title = `${findingRef(f)} – ${f.title.trim() || LABELS[ctx.theme.language].untitled}`;

  // CVSS block: the 8 metric letters, the score and the severity.
  const env = cvss.kind === 'environmental';
  const hot = ctx.theme.severity.Medium;
  const letters = vectorLetters(f, env).map(({ key, value }): Cell => {
    const strong =
      (['C', 'I', 'A'].includes(key) && value !== 'N') || (key === 'S' && value === 'C');
    return strong
      ? { text: value, fill: hot.bg, color: hot.fg, align: 'center', bold: true }
      : { text: value, align: 'center' };
  });
  const cvssTable = table(
    ctx,
    MARGIN,
    CONTENT_TOP,
    [...Array(8).fill(0.42), 1.3, 1.3] as number[],
    [
      [
        {
          text: L.vector,
          colSpan: 8,
          fill: ctx.style.primary,
          color: ctx.style.onPrimary,
          bold: true,
          sizePt: 9,
        },
        {
          text: env ? L.envScore : L.baseScore,
          fill: ctx.style.primary,
          color: ctx.style.onPrimary,
          bold: true,
          align: 'center',
          sizePt: 9,
        },
        {
          text: L.severity,
          fill: ctx.style.primary,
          color: ctx.style.onPrimary,
          bold: true,
          align: 'center',
          sizePt: 9,
        },
      ],
      [
        ...letters,
        { text: cvss.score.toFixed(1), align: 'center', bold: true },
        { text: name, fill: sevColours.bg, color: sevColours.fg, align: 'center', bold: true },
      ],
    ],
    { sizePt: 10, minRowH: 0.3 },
  );

  // Recommendations table at the bottom; rows that do not fit go on continuation slides.
  const widths = recommendationWidths(CONTENT_W);
  const head: Cell[][] = [
    [L.reference, L.category, L.recommendation, L.description].map((text): Cell => ({
      text,
      fill: ctx.style.primary,
      color: ctx.style.onPrimary,
      bold: true,
      align: 'center',
    })),
  ];
  const rows = recommendationCells(recommendationRows(f.id, recs, project));
  const MIN_TABLE_TOP = 4.3;
  let tableTop = CONTENT_BOTTOM;
  let recoElements: SlideElement[] = [];
  let rest: Cell[][] = [];
  if (rows.length) {
    const whole = table(ctx, MARGIN, 0, widths, [...head, ...rows]);
    tableTop = Math.max(MIN_TABLE_TOP, CONTENT_BOTTOM - whole.bottom);
    const { first, taken } = splitRows(ctx, MARGIN, tableTop, widths, head, rows);
    recoElements = first.elements;
    rest = rows.slice(taken);
  }
  const bodyBottom = tableTop - 0.2;

  // Description on the left, evidence on the right.
  const left = 6.0;
  const desc = textBox(
    paragraphs(f.description),
    {
      role: 'description',
      x: MARGIN,
      y: cvssTable.bottom + 0.2,
      w: left,
      h: bodyBottom - cvssTable.bottom - 0.2,
      sizePt: ctx.pt(11),
      color: ctx.theme.colors.text,
      ...ctx.body,
    },
    ctx.measure,
  );
  if (desc.hiddenLines)
    warnings.push('The description does not fit next to the evidence. Shorten it.');
  const elements: SlideElement[] = [...cvssTable.elements, desc];
  const shown = evidence.slice(0, MAX_EVIDENCE);
  if (evidence.length > MAX_EVIDENCE) {
    warnings.push(`${evidence.length - MAX_EVIDENCE} more image(s) are not shown: 4 at most.`);
  }
  const ex = MARGIN + left + 0.3;
  const ew = MARGIN + CONTENT_W - ex;
  const eh = bodyBottom - CONTENT_TOP;
  const cols = shown.length > 1 ? 2 : 1;
  const rowsN = shown.length > 2 ? 2 : 1;
  const gap = 0.15;
  shown.forEach((e, i) => {
    const box = {
      x: ex + (i % cols) * ((ew + gap) / cols),
      y: CONTENT_TOP + Math.floor(i / cols) * ((eh + gap) / rowsN),
      w: (ew - (cols - 1) * gap) / cols,
      h: (eh - (rowsN - 1) * gap) / rowsN,
    };
    elements.push({
      kind: 'image',
      source: e.id,
      alt: e.caption || `${findingRef(f)} evidence ${i + 1}`,
      ...fitImage(e.width, e.height, box),
    });
  });
  elements.push(...recoElements);

  const bodies: SlideBody[] = [{ title, elements, warnings }];
  while (rest.length) {
    const { first, taken } = splitRows(ctx, MARGIN, CONTENT_TOP, widths, head, rest);
    bodies.push({ title: `${title} ${L.continued}`, elements: first.elements, warnings: [] });
    rest = rest.slice(taken);
  }
  return bodies;
}

/** Findings shown in the report: validated ones, in report order. */
export const reportFindings = (findings: Finding[]) =>
  sortForReport(findings.filter((f) => f.status === 'validated'));

// --- Action plan --------------------------------------------------------------------------

/** Fill of each action-plan quadrant: soft tints that read well with dark text. */
const QUADRANT_FILL: Record<Quadrant, string> = {
  'quick-win': '#ccf5dc',
  'heavy-project': '#ffcfc8',
  'side-action': '#ebf8c8',
  'can-be-delayed': '#e2dcf7',
};

export function actionPlan(ctx: Ctx, recs: Recommendation[], m: MissionDetails): SlideBody[] {
  const L = ctx.L.plan;
  const ordered = sortForPlan(recs);
  const tableW = 6.0;
  const widths = [1.6, tableW - 1.6 - 2.0, 2.0];
  const head: Cell[][] = [
    [L.ref, L.name, L.priority].map((text): Cell => ({
      text,
      fill: ctx.style.primary,
      color: ctx.style.onPrimary,
      bold: true,
      align: 'center',
    })),
  ];
  const prioColour = {
    3: ctx.theme.severity.High.bg,
    2: ctx.theme.colors.text,
    1: ctx.theme.colors.text,
  };
  const rows = ordered.map((r): Cell[] => [
    { text: recommendationRef(r), align: 'center' },
    { text: r.title.trim() || '—' },
    r.priority
      ? {
          text: ctx.L.criteria.priority.levels[r.priority],
          align: 'center',
          bold: true,
          color: prioColour[r.priority],
        }
      : { text: '—', align: 'center' },
  ]);
  const footnoteY = 6.35;
  const { first, taken } = splitRows(ctx, MARGIN, CONTENT_TOP, widths, head, rows, {
    maxBottom: footnoteY - 0.15,
  });

  // Quadrants: quick win and heavy project on top (priority 3), then side action and delayed.
  const qx = MARGIN + tableW + 0.5;
  const qw = (MARGIN + CONTENT_W - qx) / 2;
  const hh = 0.35;
  const qh = (footnoteY - 0.15 - CONTENT_TOP - 2 * hh) / 2;
  const elements: SlideElement[] = [...first.elements];
  QUADRANTS.forEach((q, i) => {
    const x = qx + (i % 2) * qw;
    const y = CONTENT_TOP + Math.floor(i / 2) * (hh + qh);
    const refs = ordered.filter((r) => quadrantOf(r) === q).map(recommendationRef);
    elements.push(
      {
        kind: 'rect',
        x,
        y,
        w: qw,
        h: hh,
        fill: QUADRANT_FILL[q],
        stroke: ctx.theme.colors.text,
        strokePt: 0.75,
      },
      textBox(
        [para(ctx.L.quadrants[q], true)],
        {
          role: 'quadrant-title',
          x,
          y,
          w: qw,
          h: hh,
          sizePt: ctx.pt(11),
          color: '#000000',
          align: 'center',
          valign: 'middle',
          ...ctx.body,
        },
        ctx.measure,
      ),
      {
        kind: 'rect',
        x,
        y: y + hh,
        w: qw,
        h: qh,
        fill: QUADRANT_FILL[q],
        stroke: ctx.theme.colors.text,
        strokePt: 0.75,
      },
    );
    if (refs.length) {
      const box = textBox(
        [para(refs.join(', '))],
        {
          role: 'quadrant-refs',
          x: x + 0.15,
          y: y + hh + 0.1,
          w: qw - 0.3,
          h: qh - 0.2,
          sizePt: ctx.pt(11),
          color: '#000000',
          align: 'center',
          valign: 'middle',
          ...ctx.body,
        },
        ctx.measure,
      );
      elements.push(box);
    }
  });
  const client = m.client.trim() || '—';
  elements.push(
    textBox(
      [para(L.footnote(client))],
      {
        role: 'footnote',
        x: MARGIN,
        y: footnoteY,
        w: CONTENT_W,
        h: ptToIn(ctx.pt(8)) * LINE_HEIGHT * 3,
        sizePt: ctx.pt(8),
        color: ctx.theme.colors.muted,
        ...ctx.body,
      },
      ctx.measure,
    ),
  );
  const unrated = ordered.filter((r) => !quadrantOf(r)).length;
  const warnings = unrated
    ? [`${unrated} recommendation(s) are not rated and are left out of the quadrants.`]
    : [];
  const bodies: SlideBody[] = [{ title: L.title, elements, warnings }];
  let rest = rows.slice(taken);
  while (rest.length) {
    const next = splitRows(ctx, MARGIN, CONTENT_TOP, widths, head, rest);
    bodies.push({
      title: `${L.title} ${ctx.L.vulns.continued}`,
      elements: next.first.elements,
      warnings: [],
    });
    rest = rest.slice(next.taken);
  }
  return bodies;
}
