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
import { type Cell, drawTable, type TableResult, type TableStyle } from '../slides/table';
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

export type { Cell, TableResult } from '../slides/table';

/** The report's table: `drawTable` with the report fonts and colours. */
export function table(
  ctx: Ctx,
  x: number,
  y: number,
  widths: number[],
  rows: Cell[][],
  opts: { sizePt?: number; minRowH?: number; maxBottom?: number; grid?: string } = {},
): TableResult {
  return drawTable(tableStyle(ctx), x, y, widths, rows, {
    ...opts,
    maxBottom: opts.maxBottom ?? CONTENT_BOTTOM,
  });
}

export const tableStyle = (ctx: Ctx): TableStyle => ({
  measure: ctx.measure,
  ...ctx.body,
  minFontPt: ctx.theme.minFontPt,
  fill: ctx.style.light,
  color: ctx.theme.colors.text,
});

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
