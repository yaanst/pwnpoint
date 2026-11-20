import { describe, expect, it } from 'vitest';
import { fakeMeasure } from './testing';
import { type FontSpec, lineText, wrapRuns } from './wrap';
const font: FontSpec = { family: 'X', monoFamily: 'M', sizePt: 10 };

describe('wrapRuns', () => {
  it('wraps words greedily within the width', () => {
    const lines = wrapRuns([{ text: 'aaaa bbbb cccc dddd' }], 1.0, font, fakeMeasure);
    expect(lines.map(lineText)).toEqual(['aaaa bbbb', 'cccc dddd']);
  });

  it('keeps run styles and merges adjacent runs of the same style', () => {
    const lines = wrapRuns(
      [{ text: 'use ' }, { text: 'gMSA', bold: true }, { text: ' now' }],
      5,
      font,
      fakeMeasure,
    );
    expect(lines).toEqual([[{ text: 'use ' }, { text: 'gMSA', bold: true }, { text: ' now' }]]);
  });

  it('breaks words longer than a line by characters', () => {
    const lines = wrapRuns([{ text: 'x'.repeat(25) }], 1.0, font, fakeMeasure);
    expect(lines.map(lineText)).toEqual(['x'.repeat(10), 'x'.repeat(10), 'x'.repeat(5)]);
  });

  it('drops leading and trailing spaces on wrapped lines', () => {
    const lines = wrapRuns([{ text: 'aaaa     bbbb' }], 0.5, font, fakeMeasure);
    expect(lines.map(lineText)).toEqual(['aaaa', 'bbbb']);
  });

  it('respects indents (e.g. room for a bullet)', () => {
    const lines = wrapRuns([{ text: 'aaaa bbbb cccc' }], 1.0, font, fakeMeasure, 0.2, 0.2);
    expect(lines.map(lineText)).toEqual(['aaaa', 'bbbb', 'cccc']);
  });

  it('returns no lines for empty text', () => {
    expect(wrapRuns([{ text: '   ' }], 1, font, fakeMeasure)).toEqual([]);
  });
});
