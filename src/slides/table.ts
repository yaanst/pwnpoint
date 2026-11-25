import type { RecommendationRow } from '../recommendations/model';
import {
  LINE_HEIGHT,
  type Paragraph,
  ptToIn,
  type SlideElement,
  textBox,
  toParagraphs,
} from './layout';
import type { Measure } from './wrap';

/** Tables drawn with slide elements (filled rects + text boxes). Pure: no DOM. */

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

export interface TableStyle {
  measure: Measure;
  family: string;
  monoFamily: string;
  /** Text never goes below this size. */
  minFontPt: number;
  /** Default cell fill and text colour. */
  fill: string;
  color: string;
}

export interface TableOpts {
  sizePt?: number;
  minRowH?: number;
  /** Rows ending below this edge set `overflow`. */
  maxBottom: number;
  grid?: string;
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

const para = (text: string, bold = false): Paragraph => ({ runs: [{ text, bold }] });

/**
 * A table of filled cells with white grid lines. Row heights follow the wrapped text (cells
 * spanning rows only grow the last row they cover). Cells list the slots left to right,
 * skipping slots covered by a cell spanning from above.
 */
export function drawTable(
  st: TableStyle,
  x: number,
  y: number,
  widths: number[],
  rows: Cell[][],
  opts: TableOpts,
): TableResult {
  const pt = (s: number) => Math.max(st.minFontPt, s);
  const size = pt(opts.sizePt ?? 11);
  const minRowH = opts.minRowH ?? 0.3;
  const grid = opts.grid ?? '#ffffff';
  const fonts = { family: st.family, monoFamily: st.monoFamily };
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
  const sizeOf = (cell: Cell) => (cell.sizePt ? pt(cell.sizePt) : size);
  const needed = (p: (typeof placed)[number]) => {
    const s = sizeOf(p.cell);
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
        ...fonts,
      },
      st.measure,
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
      fill: p.cell.fill ?? st.fill,
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
          sizePt: sizeOf(p.cell),
          color: p.cell.color ?? st.color,
          bold: !!p.cell.bold,
          align: p.cell.align ?? 'left',
          valign: 'middle',
          ...fonts,
        },
        st.measure,
      ),
    );
  }
  const bottom = ys.at(-1) ?? y;
  return { elements, bottom, overflow: bottom > opts.maxBottom + 1e-6 };
}

/**
 * As many body rows as fit (at least one) under the header rows: the table drawn and the
 * number of body rows it holds. The rest goes on the next slide.
 */
export function fitRows(
  st: TableStyle,
  x: number,
  y: number,
  widths: number[],
  head: Cell[][],
  rows: Cell[][],
  opts: TableOpts,
): { first: TableResult; taken: number } {
  let taken = rows.length;
  let t = drawTable(st, x, y, widths, [...head, ...rows], opts);
  while (t.overflow && taken > 1) {
    taken--;
    t = drawTable(st, x, y, widths, [...head, ...rows.slice(0, taken)], opts);
  }
  return { first: t, taken };
}

/** Markdown-lite text → paragraphs, bullets written with "• " (table cells have no indent). */
export function cellParagraphs(text: string): Paragraph[] {
  const ps = toParagraphs(text);
  if (!ps.length) return [para('—')];
  return ps.map((p) => (p.bullet ? { runs: [{ text: '•  ' }, ...p.runs] } : p));
}

/** Column widths (inches) of a recommendations table `width` wide. */
export const recommendationWidths = (width: number) => [1.6, 1.8, 3.1, width - 6.5];

/** Body rows of a finding's recommendations table: reference, category, title, description. */
export const recommendationCells = (rows: RecommendationRow[]): Cell[][] =>
  rows.map((r) => [
    { text: r.ref, align: 'center' },
    { text: r.category, align: 'center' },
    { text: r.title || '—' },
    { text: cellParagraphs(r.description), sizePt: 10 },
  ]);
