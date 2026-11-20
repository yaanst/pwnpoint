import { effectiveSeverity, type Finding, findingRef, findingCvss } from '../findings/model';
import { type Inline, parseMarkdownLite } from '../text/markdownLite';
import { LABELS, type SlideTheme } from './theme';
import { type FontSpec, type Line, type Measure, type TextRun, wrapRuns } from './wrap';

/** 16:9 widescreen, in inches (PowerPoint's default 13.333 × 7.5 in). */
export const SLIDE_W = 13.333;
export const SLIDE_H = 7.5;
const MARGIN = 0.5;
export const LINE_HEIGHT = 1.25;
export const ptToIn = (pt: number) => pt / 72;

/** Arrowhead triangle (inches) at the end of a line, and where the shaft should stop. */
export function arrowHead(e: LineElement) {
  const len = Math.max(0.09, (e.widthPt / 72) * 4);
  const dx = e.x2 - e.x1;
  const dy = e.y2 - e.y1;
  const d = Math.hypot(dx, dy) || 1;
  const ux = dx / d;
  const uy = dy / d;
  const baseX = e.x2 - ux * len;
  const baseY = e.y2 - uy * len;
  const half = len * 0.55;
  return {
    baseX,
    baseY,
    points: [
      [e.x2, e.y2],
      [baseX - uy * half, baseY + ux * half],
      [baseX + uy * half, baseY - ux * half],
    ] as [number, number][],
  };
}

export interface Paragraph {
  runs: TextRun[];
  bullet?: boolean;
}

type Align = 'left' | 'right' | 'center';
type VAlign = 'top' | 'middle';

export interface TextElement {
  kind: 'text';
  role: string;
  x: number;
  y: number;
  w: number;
  h: number;
  family: string;
  monoFamily: string;
  sizePt: number;
  color: string;
  bold?: boolean;
  align?: Align;
  valign?: VAlign;
  /** Source paragraphs (for PPTX, which wraps text itself). */
  paragraphs: Paragraph[];
  /** Wrapped lines that fit in the box, with their indent (for SVG/PNG). */
  lines: { line: Line; indent: number; bullet: boolean }[];
  /** Number of wrapped lines that did not fit. */
  hiddenLines: number;
}

export interface RectElement {
  kind: 'rect';
  x: number;
  y: number;
  w: number;
  h: number;
  fill: string;
  radius?: number;
  /** Optional outline. */
  stroke?: string;
  strokePt?: number;
  dashed?: boolean;
}

export interface ImageElement {
  kind: 'image';
  /** Evidence id, or 'logo'. */
  source: string;
  /** Alternative text (PPTX description, accessibility). */
  alt: string;
  x: number;
  y: number;
  w: number;
  h: number;
}

export interface LineElement {
  kind: 'line';
  x1: number;
  y1: number;
  x2: number;
  y2: number;
  color: string;
  widthPt: number;
  /** Draws an arrowhead at (x2, y2). */
  arrowEnd?: boolean;
}

export type SlideElement = TextElement | RectElement | ImageElement | LineElement;

export interface Slide {
  width: number;
  height: number;
  background: string;
  elements: SlideElement[];
  /** Human-readable problems (overflow), shown next to the preview. */
  warnings: string[];
}

export interface EvidenceRef {
  id: string;
  width: number;
  height: number;
  caption: string;
}

function inlineRuns(nodes: Inline[], bold = false): TextRun[] {
  return nodes.flatMap((n): TextRun[] =>
    n.type === 'bold'
      ? inlineRuns(n.children, true)
      : n.type === 'code'
        ? [{ text: n.text, mono: true, bold }]
        : [{ text: n.text, bold }],
  );
}

/** Markdown-lite → paragraphs (each paragraph line and each bullet is one paragraph). */
export function toParagraphs(text: string): Paragraph[] {
  return parseMarkdownLite(text).flatMap((b) =>
    b.type === 'list'
      ? b.items.map((item) => ({ runs: inlineRuns(item), bullet: true }))
      : b.lines.map((line) => ({ runs: inlineRuns(line) })),
  );
}

/** Fits a w×h image inside a box, centred, keeping its ratio. */
export function fitImage(
  iw: number,
  ih: number,
  box: { x: number; y: number; w: number; h: number },
) {
  const scale = Math.min(box.w / iw, box.h / ih);
  const w = iw * scale;
  const h = ih * scale;
  return { x: box.x + (box.w - w) / 2, y: box.y + (box.h - h) / 2, w, h };
}

interface TextOpts {
  role: string;
  x: number;
  y: number;
  w: number;
  h: number;
  sizePt: number;
  color: string;
  family: string;
  monoFamily: string;
  bold?: boolean;
  align?: Align;
  valign?: VAlign;
}

/** Lays out paragraphs in a box. Lines that do not fit are counted, never shrunk. */
export function textBox(paragraphs: Paragraph[], o: TextOpts, measure: Measure): TextElement {
  const font: FontSpec = { family: o.family, monoFamily: o.monoFamily, sizePt: o.sizePt };
  const lineH = ptToIn(o.sizePt) * LINE_HEIGHT;
  const bulletIndent = measure('•  ', font, {});
  const all: TextElement['lines'] = [];
  for (const p of paragraphs) {
    const runs = o.bold ? p.runs.map((r) => ({ ...r, bold: true })) : p.runs;
    const indent = p.bullet ? bulletIndent : 0;
    wrapRuns(runs, o.w, font, measure, indent, indent).forEach((line, i) =>
      all.push({ line, indent, bullet: !!p.bullet && i === 0 }),
    );
  }
  const capacity = Math.max(0, Math.floor((o.h + 1e-6) / lineH));
  return {
    kind: 'text',
    ...o,
    paragraphs,
    lines: all.slice(0, capacity),
    hiddenLines: Math.max(0, all.length - capacity),
  };
}

/** A CVSS vector split after the base metrics: `CVSS:3.1/AV:…/A:H` then `CR:L/MAV:A…`. */
export function vectorLines(vector: string): string[] {
  const parts = vector.split('/');
  const base = parts.slice(0, 9).join('/');
  const env = parts.slice(9).join('/');
  return env ? [base, env] : [base];
}

export function buildFindingSlide(
  finding: Finding,
  evidence: EvidenceRef[],
  theme: SlideTheme,
  measure: Measure,
): Slide {
  const L = LABELS[theme.language];
  const c = theme.colors;
  const sizes = {
    ref: Math.max(theme.minFontPt, 12),
    title: Math.max(theme.minFontPt, 26),
    badge: Math.max(theme.minFontPt, 14),
    heading: Math.max(theme.minFontPt, 13),
    body: Math.max(theme.minFontPt, 12),
    small: Math.max(theme.minFontPt, 10),
  };
  const fonts = { family: theme.bodyFont, monoFamily: theme.monoFont };
  const heading = { family: theme.headingFont, monoFamily: theme.monoFont };
  const severity = effectiveSeverity(finding);
  const cvss = findingCvss(finding);
  const score = cvss.score;
  const sev = theme.severity[severity];
  const elements: SlideElement[] = [];
  const warnings: string[] = [];

  // Header: reference, title, severity badge, CVSS.
  const right = SLIDE_W - MARGIN;
  const badgeW = 2.1;
  elements.push(
    textBox(
      [{ runs: [{ text: findingRef(finding.number) }] }],
      {
        role: 'ref',
        x: MARGIN,
        y: 0.35,
        w: 3,
        h: 0.3,
        sizePt: sizes.ref,
        color: c.muted,
        ...heading,
      },
      measure,
    ),
  );
  const title = textBox(
    [{ runs: [{ text: finding.title.trim() || L.untitled }] }],
    {
      role: 'title',
      x: MARGIN,
      y: 0.65,
      w: right - badgeW - 0.4 - MARGIN,
      h: 1.0,
      sizePt: sizes.title,
      color: c.text,
      bold: true,
      ...heading,
    },
    measure,
  );
  elements.push(title);
  elements.push({
    kind: 'rect',
    x: right - badgeW,
    y: 0.45,
    w: badgeW,
    h: 0.5,
    fill: sev.bg,
    radius: 0.25,
  });
  elements.push(
    textBox(
      [{ runs: [{ text: L.severity[severity] }] }],
      {
        role: 'badge',
        x: right - badgeW,
        y: 0.45,
        w: badgeW,
        h: 0.5,
        sizePt: sizes.badge,
        color: sev.fg,
        bold: true,
        align: 'center',
        valign: 'middle',
        ...heading,
      },
      measure,
    ),
  );
  elements.push(
    textBox(
      [
        {
          runs: [
            {
              text: `${cvss.kind === 'environmental' ? L.cvssEnvironmental : L.cvss} `,
              bold: false,
            },
            { text: score.toFixed(1), bold: true },
          ],
        },
      ],
      {
        role: 'score',
        x: right - 4,
        y: 1.05,
        w: 4,
        h: 0.3,
        sizePt: sizes.body,
        color: c.text,
        align: 'right',
        ...fonts,
      },
      measure,
    ),
    textBox(
      // Base metrics on the first line; environmental ones, if any, on a second line.
      vectorLines(cvss.vector).map((text) => ({ runs: [{ text, mono: true }] })),
      {
        role: 'vector',
        x: right - 5,
        y: 1.35,
        w: 5,
        h: cvss.kind === 'environmental' ? 0.36 : 0.25,
        sizePt: sizes.small,
        color: c.muted,
        align: 'right',
        ...fonts,
      },
      measure,
    ),
  );
  elements.push({
    kind: 'line',
    x1: MARGIN,
    y1: 1.75,
    x2: right,
    y2: 1.75,
    color: c.accent,
    widthPt: 1.5,
  });

  // Body: text sections on the left, up to two evidence images on the right.
  const bodyTop = 1.95;
  const bodyBottom = SLIDE_H - 0.8;
  const images = evidence.slice(0, 2);
  if (evidence.length > 2) {
    warnings.push(
      `Only the first 2 of ${evidence.length} images fit on the slide. Reorder them to choose.`,
    );
  }
  const textW = images.length ? 7.1 : right - MARGIN;
  const sections: [string, string][] = [
    [L.description, finding.description],
    [L.impact, finding.impact],
    [L.recommendation, finding.recommendation],
  ];
  if (finding.assets.length)
    sections.unshift([L.assets, finding.assets.map((a) => `- ${a}`).join('\n')]);
  let y = bodyTop;
  const headingH = ptToIn(sizes.heading) * LINE_HEIGHT;
  for (const [label, text] of sections) {
    const paragraphs = toParagraphs(text);
    if (!paragraphs.length) continue;
    if (y + headingH > bodyBottom) {
      warnings.push(`“${label}” does not fit on the slide.`);
      continue;
    }
    elements.push(
      textBox(
        [{ runs: [{ text: label }] }],
        {
          role: 'heading',
          x: MARGIN,
          y,
          w: textW,
          h: headingH,
          sizePt: sizes.heading,
          color: c.accent,
          bold: true,
          ...heading,
        },
        measure,
      ),
    );
    y += headingH;
    const box = textBox(
      paragraphs,
      {
        role: 'section',
        x: MARGIN,
        y,
        w: textW,
        h: bodyBottom - y,
        sizePt: sizes.body,
        color: c.text,
        ...fonts,
      },
      measure,
    );
    elements.push(box);
    const used = box.lines.length * ptToIn(sizes.body) * LINE_HEIGHT;
    box.h = used;
    if (box.hiddenLines) {
      warnings.push(
        `“${label}” overflows by ${box.hiddenLines} line${box.hiddenLines > 1 ? 's' : ''}. Shorten it or move details to the report.`,
      );
    }
    y += used + 0.15;
  }
  if (title.hiddenLines) warnings.push('The title is too long for the slide. Shorten it.');

  if (images.length) {
    const colX = MARGIN + textW + 0.3;
    const colW = right - colX;
    const slotH = (bodyBottom - bodyTop - (images.length - 1) * 0.2) / images.length;
    images.forEach((img, i) => {
      const top = bodyTop + i * (slotH + 0.2);
      const caption = img.caption.trim();
      const captionH = caption ? ptToIn(sizes.small) * LINE_HEIGHT * 2 : 0;
      const gap = caption ? 0.08 : 0;
      // Fit the image in the slot minus the caption, then centre image + caption together so
      // the caption sits right under its image.
      const fitted = fitImage(img.width, img.height, {
        x: colX,
        y: top,
        w: colW,
        h: slotH - captionH - gap,
      });
      const groupTop = top + (slotH - (fitted.h + gap + captionH)) / 2;
      elements.push({
        kind: 'image',
        source: img.id,
        alt: caption || `${L.figure} ${i + 1}`,
        ...fitted,
        y: groupTop,
      });
      if (caption) {
        const box = textBox(
          [{ runs: [{ text: caption }] }],
          {
            role: 'caption',
            x: colX,
            y: groupTop + fitted.h + gap,
            w: colW,
            h: captionH,
            sizePt: sizes.small,
            color: c.muted,
            align: 'center',
            ...fonts,
          },
          measure,
        );
        elements.push(box);
        if (box.hiddenLines)
          warnings.push(`The caption of image ${i + 1} is too long. Shorten it.`);
      }
    });
  }

  // Footer.
  elements.push(
    textBox(
      [{ runs: [{ text: theme.footerText }] }],
      {
        role: 'footer',
        x: MARGIN,
        y: SLIDE_H - 0.5,
        w: 8,
        h: 0.3,
        sizePt: sizes.small,
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
        x: right - 1.6,
        y: SLIDE_H - 0.62,
        w: 1.6,
        h: 0.45,
      }),
    });
  }

  return { width: SLIDE_W, height: SLIDE_H, background: c.background, elements, warnings };
}

/** Deck cover: project name, subtitle, date and finding count. */
export function buildCoverSlide(
  projectName: string,
  date: string,
  findingCount: number,
  theme: SlideTheme,
  measure: Measure,
): Slide {
  const L = LABELS[theme.language];
  const c = theme.colors;
  const heading = { family: theme.headingFont, monoFamily: theme.monoFont };
  const fonts = { family: theme.bodyFont, monoFamily: theme.monoFont };
  const w = SLIDE_W - 2 * MARGIN;
  const titlePt = Math.max(theme.minFontPt, 40);
  const subPt = Math.max(theme.minFontPt, 20);
  const smallPt = Math.max(theme.minFontPt, 14);
  const warnings: string[] = [];
  const elements: SlideElement[] = [
    { kind: 'rect', x: 0, y: 0, w: 0.25, h: SLIDE_H, fill: c.accent },
  ];
  const title = textBox(
    [{ runs: [{ text: projectName.trim() || L.untitled }] }],
    {
      role: 'cover-title',
      x: MARGIN + 0.5,
      y: 2.2,
      w: w - 0.5,
      h: ptToIn(titlePt) * LINE_HEIGHT * 2,
      sizePt: titlePt,
      color: c.text,
      bold: true,
      ...heading,
    },
    measure,
  );
  if (title.hiddenLines) warnings.push('The project name is too long for the cover. Shorten it.');
  const titleBottom = 2.2 + Math.max(1, title.lines.length) * ptToIn(titlePt) * LINE_HEIGHT;
  elements.push(title, {
    kind: 'line',
    x1: MARGIN + 0.5,
    y1: titleBottom + 0.2,
    x2: MARGIN + 3.5,
    y2: titleBottom + 0.2,
    color: c.accent,
    widthPt: 3,
  });
  elements.push(
    textBox(
      [{ runs: [{ text: L.coverSubtitle }] }],
      {
        role: 'cover-subtitle',
        x: MARGIN + 0.5,
        y: titleBottom + 0.45,
        w: w - 0.5,
        h: ptToIn(subPt) * LINE_HEIGHT,
        sizePt: subPt,
        color: c.text,
        ...heading,
      },
      measure,
    ),
    textBox(
      [{ runs: [{ text: `${date} · ${L.findingCount(findingCount)}` }] }],
      {
        role: 'cover-meta',
        x: MARGIN + 0.5,
        y: titleBottom + 0.45 + ptToIn(subPt) * LINE_HEIGHT + 0.15,
        w: w - 0.5,
        h: ptToIn(smallPt) * LINE_HEIGHT,
        sizePt: smallPt,
        color: c.muted,
        ...fonts,
      },
      measure,
    ),
    textBox(
      [{ runs: [{ text: theme.footerText }] }],
      {
        role: 'footer',
        x: MARGIN + 0.5,
        y: SLIDE_H - 0.5,
        w: 8,
        h: 0.3,
        sizePt: Math.max(theme.minFontPt, 10),
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
        x: SLIDE_W - MARGIN - 2.5,
        y: 0.5,
        w: 2.5,
        h: 0.9,
      }),
    });
  }
  return { width: SLIDE_W, height: SLIDE_H, background: c.background, elements, warnings };
}
