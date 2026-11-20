/**
 * Markdown-lite: the only formatting PwnPoint supports in free text.
 *
 *   **bold**   `inline code`   "- item" or "* item" bullet lines   blank line = new paragraph
 *   A backslash escapes a marker: \* \` \\
 *
 * The parser returns a small tree, never HTML. Renderers (screen, PPTX, PNG, Markdown export)
 * walk the tree, and the screen renderer only creates text nodes and fixed elements, so user
 * text can never inject markup.
 */

export type Inline =
  | { type: 'text'; text: string }
  | { type: 'bold'; children: Inline[] }
  | { type: 'code'; text: string };

/** One visual line: a sequence of inline runs. */
export type Line = Inline[];

export type Block = { type: 'paragraph'; lines: Line[] } | { type: 'list'; items: Line[] };

const BULLET = /^\s*[-*]\s+/;

export function parseMarkdownLite(source: string): Block[] {
  const blocks: Block[] = [];
  let current: Block | null = null;

  for (const raw of source.replace(/\r\n?/g, '\n').split('\n')) {
    if (raw.trim() === '') {
      current = null;
      continue;
    }
    const bullet = BULLET.exec(raw);
    if (bullet) {
      if (current?.type !== 'list') {
        current = { type: 'list', items: [] };
        blocks.push(current);
      }
      current.items.push(parseInline(raw.slice(bullet[0].length).trimEnd()));
    } else {
      if (current?.type !== 'paragraph') {
        current = { type: 'paragraph', lines: [] };
        blocks.push(current);
      }
      current.lines.push(parseInline(raw.trim()));
    }
  }
  return blocks;
}

/** Parses bold and code spans in one line. Unclosed markers stay literal. */
export function parseInline(line: string): Line {
  const out: Inline[] = [];
  let text = '';
  const flush = () => {
    if (text) out.push({ type: 'text', text });
    text = '';
  };

  let i = 0;
  while (i < line.length) {
    const ch = line[i];
    if (ch === '\\' && i + 1 < line.length && '*`\\'.includes(line[i + 1] ?? '')) {
      text += line[i + 1];
      i += 2;
    } else if (ch === '`') {
      const end = line.indexOf('`', i + 1);
      if (end > i + 1) {
        flush();
        out.push({ type: 'code', text: line.slice(i + 1, end) });
        i = end + 1;
      } else {
        text += ch;
        i += 1;
      }
    } else if (ch === '*' && line[i + 1] === '*') {
      const end = findClosingBold(line, i + 2);
      if (end > i + 2) {
        flush();
        out.push({ type: 'bold', children: parseInline(line.slice(i + 2, end)) });
        i = end + 2;
      } else {
        text += '**';
        i += 2;
      }
    } else {
      text += ch;
      i += 1;
    }
  }
  flush();
  return out;
}

/** Index of the "**" closing a bold span opened before `from`, skipping code spans and escapes. */
function findClosingBold(line: string, from: number): number {
  for (let i = from; i < line.length; i++) {
    const ch = line[i];
    if (ch === '\\') i += 1;
    else if (ch === '`') {
      const end = line.indexOf('`', i + 1);
      if (end > i) i = end;
    } else if (ch === '*' && line[i + 1] === '*') return i;
  }
  return -1;
}

/** Text without formatting markers, e.g. for search, plain-text export or measuring. */
export function inlineToPlain(line: Line): string {
  return line.map((n) => (n.type === 'bold' ? inlineToPlain(n.children) : n.text)).join('');
}

export function toPlainText(blocks: Block[]): string {
  return blocks
    .map((b) =>
      b.type === 'list'
        ? b.items.map((item) => `• ${inlineToPlain(item)}`).join('\n')
        : b.lines.map(inlineToPlain).join('\n'),
    )
    .join('\n\n');
}
