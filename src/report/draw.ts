import {
  LINE_HEIGHT,
  type Paragraph,
  ptToIn,
  type Slide,
  SLIDE_H,
  SLIDE_W,
  type SlideElement,
  textBox,
} from '../slides/layout';
import { DEFAULT_REPORT_STYLE, type ReportStyle, type SlideTheme } from '../slides/theme';
import type { Measure } from '../slides/wrap';
import { type ReportLabels, REPORT_LABELS } from './labels';

/** Drawing helpers shared by the report deck slides. Pure: no DOM. */

export const MARGIN = 0.5;
export const CONTENT_W = SLIDE_W - 2 * MARGIN;
export const CONTENT_TOP = 1.2;
/** Content must end above the footer. */
export const CONTENT_BOTTOM = 6.95;

export interface Ctx {
  theme: SlideTheme;
  style: ReportStyle;
  L: ReportLabels;
  measure: Measure;
  /** Never below the theme's minimum font size. */
  pt: (size: number) => number;
  heading: { family: string; monoFamily: string };
  body: { family: string; monoFamily: string };
}

export function makeCtx(theme: SlideTheme, measure: Measure): Ctx {
  return {
    theme,
    style: theme.report ?? DEFAULT_REPORT_STYLE,
    L: REPORT_LABELS[theme.language],
    measure,
    pt: (size) => Math.max(theme.minFontPt, size),
    heading: { family: theme.headingFont, monoFamily: theme.monoFont },
    body: { family: theme.bodyFont, monoFamily: theme.monoFont },
  };
}

export const para = (text: string, bold = false): Paragraph => ({ runs: [{ text, bold }] });

export function newSlide(elements: SlideElement[] = [], background = '#ffffff'): Slide {
  return { width: SLIDE_W, height: SLIDE_H, background, elements, warnings: [] };
}

/** Small running header, section name and slide title. */
export function header(ctx: Ctx, section: string, title: string, running: string): SlideElement[] {
  const { style } = ctx;
  const small = ctx.pt(9);
  return [
    textBox(
      [para(running)],
      {
        role: 'running-header',
        x: MARGIN,
        y: 0.22,
        w: CONTENT_W * 0.7,
        h: ptToIn(small) * LINE_HEIGHT,
        sizePt: small,
        color: style.primary,
        ...ctx.body,
      },
      ctx.measure,
    ),
    textBox(
      [para(section)],
      {
        role: 'section',
        x: MARGIN + CONTENT_W * 0.7,
        y: 0.22,
        w: CONTENT_W * 0.3,
        h: ptToIn(small) * LINE_HEIGHT,
        sizePt: small,
        color: style.primary,
        align: 'right',
        ...ctx.body,
      },
      ctx.measure,
    ),
    textBox(
      [para(title)],
      {
        role: 'title',
        x: MARGIN,
        y: 0.42,
        w: CONTENT_W,
        h: ptToIn(ctx.pt(24)) * LINE_HEIGHT,
        sizePt: ctx.pt(24),
        color: style.primary,
        ...ctx.heading,
      },
      ctx.measure,
    ),
  ];
}

/** Footer text in the middle, logo and page number on the right. */
export function footer(ctx: Ctx, page: number): SlideElement[] {
  const size = ctx.pt(8);
  const y = 7.12;
  const h = ptToIn(size) * LINE_HEIGHT;
  const out: SlideElement[] = [
    textBox(
      [para(ctx.theme.footerText)],
      {
        role: 'footer',
        x: SLIDE_W / 2 - 3,
        y,
        w: 6,
        h,
        sizePt: size,
        color: ctx.theme.colors.muted,
        align: 'center',
        ...ctx.body,
      },
      ctx.measure,
    ),
    textBox(
      [para(`| ${page}`)],
      {
        role: 'page-number',
        x: SLIDE_W - MARGIN - 0.6,
        y,
        w: 0.6,
        h,
        sizePt: size,
        color: ctx.style.primary,
        align: 'right',
        ...ctx.body,
      },
      ctx.measure,
    ),
  ];
  const logo = ctx.theme.logo;
  if (logo) {
    const lh = 0.18;
    const lw = Math.min(1.4, (logo.width / logo.height) * lh);
    out.push({
      kind: 'image',
      source: 'logo',
      alt: 'Logo',
      x: SLIDE_W - MARGIN - 0.65 - lw,
      y: y + (h - lh) / 2,
      w: lw,
      h: lh,
    });
  }
  return out;
}

export interface Cell {
  text: string | Paragraph[];
  fill?: string;
  color?: string;
  bold?: boolean;
  align?: 'left' | 'center' | 'right';
  sizePt?: number;
  colSpan?: number;
  rowSpan?: number;
}

export interface TableResult {
  elements: SlideElement[];
  /** Bottom edge of the table, in inches. */
  bottom: number;
  /** Rows of the table that end below `maxBottom`. */
  overflow: boolean;
}

const PAD_X = 0.08;
const PAD_Y = 0.05;

/**
 * A table of filled cells with white grid lines. Row heights follow the wrapped text (cells
 * spanning rows only grow the last row they cover). Cells list the slots left to right,
 * skipping slots covered by a cell spanning from above.
 */
export function table(
  ctx: Ctx,
  x: number,
  y: number,
  widths: number[],
  rows: Cell[][],
  opts: { sizePt?: number; minRowH?: number; maxBottom?: number; grid?: string } = {},
): TableResult {
  const size = ctx.pt(opts.sizePt ?? 11);
  const minRowH = opts.minRowH ?? 0.3;
  const grid = opts.grid ?? '#ffffff';
  // Place every cell in the grid.
  const taken = rows.map(() => widths.map(() => false));
  const placed: { cell: Cell; r: number; c: number; rs: number; cs: number }[] = [];
  rows.forEach((row, r) => {
    let c = 0;
    for (const cell of row) {
      while (c < widths.length && taken[r]?.[c]) c++;
      if (c >= widths.length) break;
      const cs = Math.min(cell.colSpan ?? 1, widths.length - c);
      const rs = Math.min(cell.rowSpan ?? 1, rows.length - r);
      for (let i = r; i < r + rs; i++) {
        for (let j = c; j < c + cs; j++) {
          const line = taken[i];
          if (line) line[j] = true;
        }
      }
      placed.push({ cell, r, c, rs, cs });
      c += cs;
    }
  });
  const xs = widths.reduce<number[]>((acc, w) => [...acc, (acc.at(-1) ?? x) + w], [x]);
  const width = (c: number, cs: number) => (xs[c + cs] ?? 0) - (xs[c] ?? 0);
  const paragraphs = (cell: Cell) =>
    typeof cell.text === 'string'
      ? cell.text.split('\n').map((t) => para(t, cell.bold))
      : cell.text;
  const needed = (p: (typeof placed)[number]) => {
    const s = p.cell.sizePt ? ctx.pt(p.cell.sizePt) : size;
    const box = textBox(
      paragraphs(p.cell),
      {
        role: 'measure',
        x: 0,
        y: 0,
        w: width(p.c, p.cs) - 2 * PAD_X,
        h: 100,
        sizePt: s,
        color: '#000000',
        ...ctx.body,
      },
      ctx.measure,
    );
    return Math.max(1, box.lines.length) * ptToIn(s) * LINE_HEIGHT + 2 * PAD_Y;
  };
  const heights = rows.map(() => minRowH);
  for (const p of placed.filter((q) => q.rs === 1)) {
    heights[p.r] = Math.max(heights[p.r] ?? minRowH, needed(p));
  }
  for (const p of placed.filter((q) => q.rs > 1)) {
    const have = heights.slice(p.r, p.r + p.rs).reduce((a, b) => a + b, 0);
    const want = needed(p);
    const last = p.r + p.rs - 1;
    if (want > have) heights[last] = (heights[last] ?? minRowH) + want - have;
  }
  const ys = heights.reduce<number[]>((acc, h) => [...acc, (acc.at(-1) ?? y) + h], [y]);
  const elements: SlideElement[] = [];
  for (const p of placed) {
    const cx = xs[p.c] ?? x;
    const cy = ys[p.r] ?? y;
    const w = width(p.c, p.cs);
    const h = (ys[p.r + p.rs] ?? cy) - cy;
    elements.push({
      kind: 'rect',
      x: cx,
      y: cy,
      w,
      h,
      fill: p.cell.fill ?? ctx.style.light,
      stroke: grid,
      strokePt: 1,
    });
    elements.push(
      textBox(
        paragraphs(p.cell),
        {
          role: 'cell',
          x: cx + PAD_X,
          y: cy + PAD_Y,
          w: w - 2 * PAD_X,
          h: h - 2 * PAD_Y,
          sizePt: p.cell.sizePt ? ctx.pt(p.cell.sizePt) : size,
          color: p.cell.color ?? ctx.theme.colors.text,
          bold: !!p.cell.bold,
          align: p.cell.align ?? 'left',
          valign: 'middle',
          ...ctx.body,
        },
        ctx.measure,
      ),
    );
  }
  const bottom = ys.at(-1) ?? y;
  return { elements, bottom, overflow: bottom > (opts.maxBottom ?? CONTENT_BOTTOM) + 1e-6 };
}

/** A dark title bar cell spanning the whole table. */
export const titleRow = (ctx: Ctx, text: string, cols: number): Cell[] => [
  {
    text,
    fill: ctx.style.dark,
    color: ctx.style.onPrimary,
    bold: true,
    align: 'center',
    colSpan: cols,
  },
];

/** A header row in the primary colour. */
export const headRow = (ctx: Ctx, texts: string[], align: Cell['align'] = 'center'): Cell[] =>
  texts.map((text) => ({
    text,
    fill: ctx.style.primary,
    color: ctx.style.onPrimary,
    bold: true,
    align,
  }));
