import { describe, expect, it } from 'vitest';
import { base64ToBytes, bytesToBase64 } from './base64';

describe('base64', () => {
  it('round-trips binary data, including large buffers', () => {
    const big = new Uint8Array(200_000).map((_, i) => (i * 31) % 256);
    expect(base64ToBytes(bytesToBase64(big))).toEqual(big);
    expect(bytesToBase64(new TextEncoder().encode('hi'))).toBe('aGk=');
  });

  it('rejects invalid input', () => {
    expect(() => base64ToBytes('not base64!')).toThrow();
    expect(() => base64ToBytes('abc')).toThrow();
  });
});
