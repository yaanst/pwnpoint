import { describe, expect, it } from 'vitest';
import { newFinding } from '../findings/model';
import { buildCoverSlide, buildFindingSlide, type Slide } from '../slides/layout';
import { SAMPLE_FINDING } from '../slides/sample';
import { fakeMeasure } from '../slides/testing';
import { DEFAULT_THEME } from '../slides/theme';
import { base64ToBytes } from '../util/base64';
import { buildPptx, type PptxOptions } from './pptx';
import { unzipStored } from './zip';

const TINY_PNG = base64ToBytes(
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==',
);
const opts: PptxOptions = {
  title: 'Acme & Co <test>',
  lang: 'en-US',
  headingFont: 'Calibri',
  bodyFont: 'Calibri',
  created: new Date('2026-01-02T03:04:05.678Z'),
};
const theme = { ...DEFAULT_THEME, logo: { bytes: TINY_PNG, width: 4, height: 1 } };
const evidence = [{ id: 'ev1', width: 800, height: 600, caption: 'Login page' }];
const findingSlide = () => buildFindingSlide(SAMPLE_FINDING, evidence, theme, fakeMeasure);
const text = (files: Map<string, Uint8Array>, name: string) => {
  const data = files.get(name);
  if (!data) throw new Error(`missing ${name}`);
  return new TextDecoder().decode(data);
};

describe('buildPptx', () => {
  it('writes every required part, with one entry per slide in each index', () => {
    const slides = [buildCoverSlide('Acme', '2026-01-02', 1, theme, fakeMeasure), findingSlide()];
    const files = unzipStored(buildPptx(slides, { ev1: TINY_PNG, logo: TINY_PNG }, opts));
    for (const part of [
      '[Content_Types].xml',
      '_rels/.rels',
      'docProps/core.xml',
      'docProps/app.xml',
      'ppt/presentation.xml',
      'ppt/_rels/presentation.xml.rels',
      'ppt/slideMasters/slideMaster1.xml',
      'ppt/slideLayouts/slideLayout1.xml',
      'ppt/theme/theme1.xml',
      'ppt/slides/slide1.xml',
      'ppt/slides/slide2.xml',
      'ppt/slides/_rels/slide2.xml.rels',
    ]) {
      expect(files.has(part), part).toBe(true);
    }
    const types = text(files, '[Content_Types].xml');
    expect(types.match(/presentationml\.slide\+xml/g)).toHaveLength(2);
    expect(text(files, 'ppt/presentation.xml').match(/<p:sldId /g)).toHaveLength(2);
    expect(text(files, 'docProps/app.xml')).toContain('<Slides>2</Slides>');
  });

  it('stores each image once, even when several slides show it', () => {
    const slides = [findingSlide(), findingSlide()];
    const files = unzipStored(buildPptx(slides, { ev1: TINY_PNG, logo: TINY_PNG }, opts));
    expect([...files.keys()].filter((k) => k.startsWith('ppt/media/'))).toEqual([
      'ppt/media/image1.png',
      'ppt/media/image2.png',
    ]);
    const rels = text(files, 'ppt/slides/_rels/slide2.xml.rels');
    expect(rels).toContain('Target="../media/image1.png"');
    expect(rels).toContain('Target="../media/image2.png"');
    const xml = text(files, 'ppt/slides/slide2.xml');
    expect(xml).toContain('descr="Login page"');
    expect(xml).toContain('descr="Logo"');
  });

  it('uses a grey placeholder when the image bytes are missing', () => {
    const files = unzipStored(buildPptx([findingSlide()], {}, opts));
    expect([...files.keys()].some((k) => k.startsWith('ppt/media/'))).toBe(false);
    expect(text(files, 'ppt/slides/slide1.xml')).toContain('E5E7EB');
  });

  it('keeps text as native, editable runs with bold, code font and bullets', () => {
    const xml = text(unzipStored(buildPptx([findingSlide()], {}, opts)), 'ppt/slides/slide1.xml');
    expect(xml).toContain('<a:t>SQL injection in the customer portal search</a:t>');
    expect(xml).toMatch(
      /<a:rPr lang="en-US" sz="1200" b="1"[^>]*>.*?<\/a:rPr><a:t>unauthenticated<\/a:t>/,
    );
    expect(xml).toMatch(/<a:latin typeface="Consolas"\/>.*?<\/a:rPr><a:t>q<\/a:t>/);
    expect(xml).toContain('<a:buChar char="•"/>');
    expect(xml).toContain('<p:cxnSp>'); // the accent rule is a native line
    expect(xml).toContain('prst="roundRect"'); // the severity badge
  });

  it('escapes user text and drops characters XML forbids', () => {
    const f = { ...newFinding('f', 'p', 1, 0), title: 'a < b & "c" \u0001 \ud800' };
    const files = unzipStored(
      buildPptx([buildFindingSlide(f, [], DEFAULT_THEME, fakeMeasure)], {}, opts),
    );
    expect(text(files, 'ppt/slides/slide1.xml')).toContain(
      '<a:t>a &lt; b &amp; &quot;c&quot;  </a:t>',
    );
    expect(text(files, 'docProps/core.xml')).toContain(
      '<dc:title>Acme &amp; Co &lt;test&gt;</dc:title>',
    );
    expect(text(files, 'docProps/core.xml')).toContain('2026-01-02T03:04:05Z');
  });

  it('positions shapes in EMU on a 16:9 page and flips reversed lines', () => {
    const slide: Slide = {
      width: 13.333,
      height: 7.5,
      background: '#ffffff',
      warnings: [],
      elements: [{ kind: 'line', x1: 2, y1: 1, x2: 1, y2: 2, color: '#000000', widthPt: 1 }],
    };
    const files = unzipStored(buildPptx([slide], {}, opts));
    expect(text(files, 'ppt/presentation.xml')).toContain('<p:sldSz cx="12192000" cy="6858000"/>');
    const xml = text(files, 'ppt/slides/slide1.xml');
    expect(xml).toContain('<a:xfrm flipH="1"><a:off x="914400" y="914400"/>');
    expect(xml).toContain('<a:ln w="12700">');
  });

  it('refuses an empty deck', () => {
    expect(() => buildPptx([], {}, opts)).toThrow(/no slides/);
  });
});
