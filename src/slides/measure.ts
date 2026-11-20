import type { Measure } from './wrap';

let ctx: CanvasRenderingContext2D | null = null;
const cache = new Map<string, number>();

/** Browser text measurement (inches) using a canvas; results are cached per font and text. */
export const canvasMeasure: Measure = (text, font, run) => {
  const family = run.mono ? font.monoFamily : font.family;
  const css = `${run.bold ? 'bold ' : ''}${font.sizePt}pt "${family}", sans-serif`;
  const key = `${css}|${text}`;
  const hit = cache.get(key);
  if (hit !== undefined) return hit;
  ctx ??= document.createElement('canvas').getContext('2d');
  if (!ctx) return text.length * font.sizePt * 0.0075; // rough fallback: ~0.54 em per character
  ctx.font = css;
  const inches = ctx.measureText(text).width / 96;
  if (cache.size > 20000) cache.clear();
  cache.set(key, inches);
  return inches;
};
