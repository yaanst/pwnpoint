import { describe, expect, it } from 'vitest';
import { type Finding, newFinding } from '../findings/model';
import {
  buildFindingSlide,
  fitImage,
  SLIDE_H,
  SLIDE_W,
  type TextElement,
  toParagraphs,
} from './layout';
import { fakeMeasure } from './testing';
import { DEFAULT_THEME } from './theme';
import { lineText } from './wrap';

const critical = { AV: 'N', AC: 'L', PR: 'N', UI: 'N', S: 'U', C: 'H', I: 'H', A: 'H' } as const;
const finding = (patch: Partial<Finding> = {}): Finding => ({
  ...newFinding('f1', 'p1', 7, 0),
  title: 'SQL injection',
  description: 'The **q** parameter is concatenated.',
  impact: '- Data theft\n- Account takeover',
  recommendation: 'Use prepared statements.',
  cvss: { ...critical },
  ...patch,
});
const texts = (s: ReturnType<typeof buildFindingSlide>, role: string) =>
  s.elements.filter((e): e is TextElement => e.kind === 'text' && e.role === role);
const textOf = (e: TextElement) => e.lines.map((l) => lineText(l.line)).join(' / ');
/** The first text element with this role; fails the test clearly if there is none. */
function first(s: ReturnType<typeof buildFindingSlide>, role: string): TextElement {
  const e = texts(s, role)[0];
  if (!e) throw new Error(`no ${role} element`);
  return e;
}

describe('toParagraphs', () => {
  it('turns Markdown-lite into paragraphs with bold, code and bullets', () => {
    expect(toParagraphs('Use **gMSA** and `klist`\n- one\n- two')).toEqual([
      {
        runs: [
          { text: 'Use ', bold: false },
          { text: 'gMSA', bold: true },
          { text: ' and ', bold: false },
          { text: 'klist', mono: true, bold: false },
        ],
      },
      { runs: [{ text: 'one', bold: false }], bullet: true },
      { runs: [{ text: 'two', bold: false }], bullet: true },
    ]);
  });
});

describe('buildFindingSlide', () => {
  it('lays out a 16:9 slide with reference, title, severity, CVSS and sections', () => {
    const s = buildFindingSlide(finding(), [], DEFAULT_THEME, fakeMeasure);
    expect(s.width / s.height).toBeCloseTo(16 / 9, 2);
    expect([s.width, s.height]).toEqual([SLIDE_W, SLIDE_H]);
    expect(textOf(first(s, 'ref'))).toBe('VLN.07');
    expect(textOf(first(s, 'title'))).toBe('SQL injection');
    expect(textOf(first(s, 'badge'))).toBe('Critical');
    expect(textOf(first(s, 'score'))).toBe('CVSS 3.1 9.8');
    expect(textOf(first(s, 'vector'))).toBe('CVSS:3.1/AV:N/AC:L/PR:N/UI:N/S:U/C:H/I:H/A:H');
    expect(texts(s, 'heading').map(textOf)).toEqual(['Description', 'Impact', 'Recommendation']);
    expect(s.elements.find((e) => e.kind === 'rect')).toMatchObject({
      fill: DEFAULT_THEME.severity.Critical.bg,
    });
    expect(s.warnings).toEqual([]);
  });

  it('uses French labels and lists affected assets', () => {
    const s = buildFindingSlide(
      finding({ assets: ['dc01.acme.local'] }),
      [],
      { ...DEFAULT_THEME, language: 'fr' },
      fakeMeasure,
    );
    expect(textOf(first(s, 'badge'))).toBe('Critique');
    expect(texts(s, 'heading').map(textOf)).toEqual([
      'Actifs concernés',
      'Description',
      'Impact',
      'Recommandation',
    ]);
  });

  it('puts up to two images in a right column and narrows the text', () => {
    const imgs = [1, 2, 3].map((n) => ({
      id: `e${n}`,
      width: 1600,
      height: 900,
      caption: `Shot ${n}`,
    }));
    const without = buildFindingSlide(finding(), [], DEFAULT_THEME, fakeMeasure);
    const withImgs = buildFindingSlide(finding(), imgs, DEFAULT_THEME, fakeMeasure);
    const images = withImgs.elements.filter((e) => e.kind === 'image');
    expect(images.map((e) => e.kind === 'image' && e.source)).toEqual(['e1', 'e2']);
    for (const img of images) {
      if (img.kind !== 'image') continue;
      expect(img.w / img.h).toBeCloseTo(16 / 9, 2); // ratio kept
      expect(img.x + img.w).toBeLessThanOrEqual(SLIDE_W - 0.5 + 1e-9);
    }
    expect(first(withImgs, 'section').w).toBeLessThan(first(without, 'section').w);
    expect(texts(withImgs, 'caption').map(textOf)).toEqual(['Shot 1', 'Shot 2']);
    // Each caption sits right under its image.
    const captions = texts(withImgs, 'caption');
    images.forEach((img, i) => {
      if (img.kind !== 'image') return;
      expect(captions[i]?.y).toBeCloseTo(img.y + img.h + 0.08, 5);
    });
  });

  it('warns about overflowing text instead of shrinking it', () => {
    const long = Array.from({ length: 80 }, (_, i) => `Line ${i} of a very long description.`).join(
      '\n',
    );
    const s = buildFindingSlide(finding({ description: long }), [], DEFAULT_THEME, fakeMeasure);
    const section = first(s, 'section');
    expect(section.sizePt).toBe(12);
    expect(section.hiddenLines).toBeGreaterThan(0);
    expect(s.warnings[0]).toMatch(/^“Description” overflows by \d+ lines\. Shorten it/);
    expect(s.warnings).toContain('“Impact” does not fit on the slide.');
  });

  it('never uses a font below the theme minimum', () => {
    const s = buildFindingSlide(
      finding(),
      [{ id: 'e', width: 10, height: 10, caption: 'c' }],
      { ...DEFAULT_THEME, minFontPt: 14 },
      fakeMeasure,
    );
    for (const e of s.elements) if (e.kind === 'text') expect(e.sizePt).toBeGreaterThanOrEqual(14);
  });

  it('uses the untitled label and the logo when present', () => {
    const logo = { bytes: new Uint8Array(1), width: 400, height: 100 };
    const s = buildFindingSlide(
      finding({ title: ' ' }),
      [],
      { ...DEFAULT_THEME, logo },
      fakeMeasure,
    );
    expect(textOf(first(s, 'title'))).toBe('Untitled finding');
    expect(s.elements.find((e) => e.kind === 'image' && e.source === 'logo')).toBeTruthy();
  });
});

describe('fitImage', () => {
  it('fits and centres keeping the ratio', () => {
    expect(fitImage(200, 100, { x: 0, y: 0, w: 4, h: 4 })).toEqual({ x: 0, y: 1, w: 4, h: 2 });
    expect(fitImage(100, 200, { x: 0, y: 0, w: 4, h: 4 })).toEqual({ x: 1, y: 0, w: 2, h: 4 });
  });
});
