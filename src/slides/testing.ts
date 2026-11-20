import type { Measure } from './wrap';

/** Deterministic measure for tests: 0.1 in per character at 10 pt (0.12 in bold), scaled. */
export const fakeMeasure: Measure = (text, font, run) =>
  text.length * (run.bold ? 0.12 : 0.1) * (font.sizePt / 10);
