import { describe, expect, it } from 'vitest';
import { crc32, readPngChunks, stripPngMetadata, writePng } from './png';

const enc = (s: string) => new TextEncoder().encode(s);
const ihdr = new Uint8Array([0, 0, 0, 1, 0, 0, 0, 1, 8, 6, 0, 0, 0]); // 1×1 RGBA
const png = (...extra: [string, string][]) =>
  writePng([
    { type: 'IHDR', data: ihdr },
    ...extra.map(([type, text]) => ({ type, data: enc(text) })),
    { type: 'IDAT', data: new Uint8Array([120, 156, 99, 0, 1, 0, 0, 5, 0, 1]) },
    { type: 'IEND', data: new Uint8Array() },
  ]);

describe('crc32', () => {
  it('matches the known CRC of the IEND chunk type', () => {
    expect(crc32(enc('IEND'))).toBe(0xae426082);
  });
});

describe('stripPngMetadata', () => {
  it('removes text, EXIF, time and colour-profile chunks', () => {
    const dirty = png(
      ['tEXt', 'Author\0Jane Pentester'],
      ['iTXt', 'Comment\0\0\0\0\0client=ACME'],
      ['eXIf', 'GPS 48.8566N'],
      ['tIME', '2026'],
      ['iCCP', 'profile'],
    );
    const clean = stripPngMetadata(dirty);
    expect(readPngChunks(clean).map((c) => c.type)).toEqual(['IHDR', 'IDAT', 'IEND']);
    const text = new TextDecoder('latin1').decode(clean);
    for (const secret of ['Jane', 'ACME', 'GPS', 'profile']) expect(text).not.toContain(secret);
  });

  it('keeps an already clean image byte-for-byte', () => {
    const clean = png();
    expect(stripPngMetadata(clean)).toEqual(clean);
  });

  it('keeps palette and transparency chunks', () => {
    const types = readPngChunks(stripPngMetadata(png(['PLTE', 'rgb'], ['tRNS', 'a']))).map(
      (c) => c.type,
    );
    expect(types).toEqual(['IHDR', 'PLTE', 'tRNS', 'IDAT', 'IEND']);
  });

  it('rejects files that are not intact PNGs', () => {
    expect(() => stripPngMetadata(enc('GIF89a…'))).toThrow(/Not a PNG/);
    const corrupted = png();
    corrupted[20] = (corrupted[20] ?? 0) ^ 0xff; // inside IHDR data
    expect(() => stripPngMetadata(corrupted)).toThrow(/Corrupted/);
    expect(() => stripPngMetadata(png().subarray(0, 40))).toThrow();
  });
});
