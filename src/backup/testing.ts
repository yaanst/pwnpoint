import { base64ToBytes } from '../util/base64';
import type { Reencode } from './repository';

/** A valid 1×1 PNG. */
export const TINY_PNG = base64ToBytes(
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==',
);

/** Test stand-in for the canvas re-encode: keeps the bytes and reads the size from IHDR. */
export const fakeReencode: Reencode = (png) => {
  const view = new DataView(png.buffer, png.byteOffset, png.byteLength);
  return Promise.resolve({
    bytes: new Uint8Array(png),
    width: view.getUint32(16),
    height: view.getUint32(20),
  });
};
