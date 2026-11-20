import { describe, expect, it } from 'vitest';
import { unzipStored, zip } from './zip';

const enc = new TextEncoder();
const dec = new TextDecoder();

describe('zip', () => {
  it('round-trips files, with UTF-8 names and binary data', () => {
    const bin = new Uint8Array(300).map((_, i) => i % 256);
    const archive = zip([
      { name: 'a.txt', data: enc.encode('hello') },
      { name: 'dossier/é.bin', data: bin },
      { name: 'empty', data: new Uint8Array() },
    ]);
    const files = unzipStored(archive);
    expect([...files.keys()]).toEqual(['a.txt', 'dossier/é.bin', 'empty']);
    expect(dec.decode(files.get('a.txt'))).toBe('hello');
    expect(files.get('dossier/é.bin')).toEqual(bin);
    expect(files.get('empty')?.length).toBe(0);
  });

  it('writes standard signatures and a known CRC-32', () => {
    const archive = zip([
      { name: 'x', data: enc.encode('The quick brown fox jumps over the lazy dog') },
    ]);
    const view = new DataView(archive.buffer);
    expect(view.getUint32(0, true)).toBe(0x04034b50);
    expect(view.getUint32(14, true)).toBe(0x414fa339); // well-known CRC-32 of this sentence
    expect(view.getUint32(archive.length - 22, true)).toBe(0x06054b50);
  });

  it('is deterministic (fixed timestamps)', () => {
    const entries = [{ name: 'a', data: enc.encode('1') }];
    expect(zip(entries)).toEqual(zip(entries));
  });

  it('detects corruption when reading', () => {
    const archive = zip([{ name: 'a', data: enc.encode('abc') }]);
    archive[31] = 'z'.charCodeAt(0); // first data byte (header 30 + name 1)
    expect(() => unzipStored(archive)).toThrow(/CRC/);
  });
});
