/** Text measurement and line wrapping shared by every slide renderer. */

export interface TextRun {
  text: string;
  bold?: boolean;
  mono?: boolean;
}

export interface FontSpec {
  family: string;
  monoFamily: string;
  sizePt: number;
}

/** Width of a run in inches. The browser implementation uses canvas measureText. */
export type Measure = (text: string, font: FontSpec, run: Omit<TextRun, 'text'>) => number;

/** A wrapped line: runs that fit on one line, in order. */
export type Line = TextRun[];

const merge = (line: Line, run: TextRun) => {
  const last = line.at(-1);
  if (last && !!last.bold === !!run.bold && !!last.mono === !!run.mono) last.text += run.text;
  else line.push({ ...run });
};

/**
 * Greedy word wrap of styled runs into lines no wider than `width` inches. Words longer than a
 * line are broken by characters. `firstIndent` reserves room at the start of the first line
 * (e.g. a bullet), `indent` at the start of the following lines.
 */
export function wrapRuns(
  runs: TextRun[],
  width: number,
  font: FontSpec,
  measure: Measure,
  indent = 0,
  firstIndent = indent,
): Line[] {
  const tokens: TextRun[] = [];
  for (const run of runs) {
    for (const part of run.text.split(/(\s+)/)) if (part) tokens.push({ ...run, text: part });
  }
  const lines: Line[] = [];
  let line: Line = [];
  let used = 0;
  const avail = () => width - (lines.length === 0 ? firstIndent : indent);
  const push = () => {
    // Trailing spaces do not count towards the width.
    const last = line.at(-1);
    if (last) last.text = last.text.replace(/\s+$/, '');
    if (line.some((r) => r.text)) lines.push(line.filter((r) => r.text));
    line = [];
    used = 0;
  };

  for (const token of tokens) {
    const isSpace = /^\s+$/.test(token.text);
    if (isSpace && line.length === 0) continue; // no leading spaces
    const w = measure(token.text, font, token);
    if (used + w <= avail() || isSpace) {
      merge(line, token);
      used += w;
      continue;
    }
    if (line.length) push();
    if (w <= avail()) {
      merge(line, token);
      used = w;
      continue;
    }
    // A single word wider than the line: break it by characters.
    let chunk = '';
    for (const ch of token.text) {
      const cw = measure(chunk + ch, font, token);
      if (cw > avail() && chunk) {
        merge(line, { ...token, text: chunk });
        push();
        chunk = ch;
      } else {
        chunk += ch;
      }
    }
    if (chunk) {
      merge(line, { ...token, text: chunk });
      used = measure(chunk, font, token);
    }
  }
  push();
  return lines;
}

export const lineText = (line: Line) => line.map((r) => r.text).join('');
