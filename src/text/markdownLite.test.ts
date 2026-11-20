import { describe, expect, it } from 'vitest';
import { inlineToPlain, parseInline, parseMarkdownLite, toPlainText } from './markdownLite';

const t = (text: string) => ({ type: 'text', text }) as const;

describe('parseInline', () => {
  it('parses bold and inline code', () => {
    expect(parseInline('Use **strong** auth and `bcrypt`.')).toEqual([
      t('Use '),
      { type: 'bold', children: [t('strong')] },
      t(' auth and '),
      { type: 'code', text: 'bcrypt' },
      t('.'),
    ]);
  });

  it('keeps markers inside code literal', () => {
    expect(parseInline('`a **b** c`')).toEqual([{ type: 'code', text: 'a **b** c' }]);
  });

  it('allows code inside bold, and a closing ** inside that code does not end the bold', () => {
    expect(parseInline('**run `x**y` now**')).toEqual([
      { type: 'bold', children: [t('run '), { type: 'code', text: 'x**y' }, t(' now')] },
    ]);
  });

  it('leaves unclosed or empty markers as literal text', () => {
    expect(parseInline('a ** b')).toEqual([t('a ** b')]);
    expect(parseInline('a `b')).toEqual([t('a `b')]);
    expect(parseInline('****')).toEqual([t('****')]);
    expect(parseInline('``')).toEqual([t('``')]);
    expect(parseInline('2 * 3 = 6')).toEqual([t('2 * 3 = 6')]);
  });

  it('honours backslash escapes', () => {
    expect(parseInline('\\*\\*not bold\\*\\* and \\`x\\` and \\\\')).toEqual([
      t('**not bold** and `x` and \\'),
    ]);
  });

  it('treats HTML as plain text', () => {
    const payload = '<img src=x onerror=alert(1)><script>alert(1)</script>';
    expect(parseInline(payload)).toEqual([t(payload)]);
  });
});

describe('parseMarkdownLite', () => {
  it('splits paragraphs on blank lines and keeps line breaks inside a paragraph', () => {
    expect(parseMarkdownLite('Line one\nLine two\n\nSecond paragraph')).toEqual([
      { type: 'paragraph', lines: [[t('Line one')], [t('Line two')]] },
      { type: 'paragraph', lines: [[t('Second paragraph')]] },
    ]);
  });

  it('groups "- " and "* " lines into a bullet list', () => {
    expect(parseMarkdownLite('Steps:\n- first\n* **second**\nAfter')).toEqual([
      { type: 'paragraph', lines: [[t('Steps:')]] },
      { type: 'list', items: [[t('first')], [{ type: 'bold', children: [t('second')] }]] },
      { type: 'paragraph', lines: [[t('After')]] },
    ]);
  });

  it('does not treat bold at the start of a line as a bullet', () => {
    expect(parseMarkdownLite('**Impact**: high')[0]?.type).toBe('paragraph');
  });

  it('normalises Windows line endings and ignores surrounding blank lines', () => {
    expect(parseMarkdownLite('\r\n\r\nA\r\nB\r\n\r\n')).toEqual([
      { type: 'paragraph', lines: [[t('A')], [t('B')]] },
    ]);
  });

  it('returns no blocks for empty text', () => {
    expect(parseMarkdownLite('   \n\n')).toEqual([]);
  });
});

describe('plain text', () => {
  it('strips markers', () => {
    expect(inlineToPlain(parseInline('**Weak** `MD5` hashing'))).toBe('Weak MD5 hashing');
    expect(toPlainText(parseMarkdownLite('Intro\n- a\n- **b**'))).toBe('Intro\n\n• a\n• b');
  });
});
