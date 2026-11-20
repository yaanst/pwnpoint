/**
 * PNG chunk filter: keeps only what is needed to display the image. Every ancillary chunk that
 * can carry metadata (tEXt, zTXt, iTXt, eXIf, tIME, iCCP, pHYs…) is dropped. Applied after the
 * canvas re-encode as a second, verifiable guarantee that no metadata leaves with an image.
 */

const SIGNATURE = [137, 80, 78, 71, 13, 10, 26, 10];
const KEEP = new Set(['IHDR', 'PLTE', 'tRNS', 'IDAT', 'IEND']);

let table: Uint32Array | undefined;
export function crc32(bytes: Uint8Array): number {
  if (!table) {
    table = new Uint32Array(256);
    for (let n = 0; n < 256; n++) {
      let c = n;
      for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
      table[n] = c >>> 0;
    }
  }
  let crc = 0xffffffff;
  for (const b of bytes) crc = (table[(crc ^ b) & 0xff] ?? 0) ^ (crc >>> 8);
  return (crc ^ 0xffffffff) >>> 0;
}

export interface PngChunk {
  type: string;
  data: Uint8Array;
}

export function readPngChunks(png: Uint8Array): PngChunk[] {
  if (SIGNATURE.some((b, i) => png[i] !== b)) throw new Error('Not a PNG file.');
  const view = new DataView(png.buffer, png.byteOffset, png.byteLength);
  const chunks: PngChunk[] = [];
  let at = 8;
  while (at + 12 <= png.length) {
    const length = view.getUint32(at);
    const type = String.fromCharCode(...png.subarray(at + 4, at + 8));
    const end = at + 12 + length;
    if (end > png.length) throw new Error('Truncated PNG chunk.');
    const data = png.subarray(at + 8, at + 8 + length);
    if (view.getUint32(at + 8 + length) !== crc32(png.subarray(at + 4, at + 8 + length))) {
      throw new Error(`Corrupted PNG chunk ${type}.`);
    }
    chunks.push({ type, data });
    at = end;
    if (type === 'IEND') break;
  }
  if (chunks[0]?.type !== 'IHDR' || chunks.at(-1)?.type !== 'IEND') {
    throw new Error('Incomplete PNG file.');
  }
  return chunks;
}

export function writePng(chunks: PngChunk[]): Uint8Array<ArrayBuffer> {
  const size = 8 + chunks.reduce((n, c) => n + 12 + c.data.length, 0);
  const out = new Uint8Array(size);
  const view = new DataView(out.buffer);
  out.set(SIGNATURE, 0);
  let at = 8;
  for (const { type, data } of chunks) {
    view.setUint32(at, data.length);
    for (let i = 0; i < 4; i++) out[at + 4 + i] = type.charCodeAt(i);
    out.set(data, at + 8);
    view.setUint32(at + 8 + data.length, crc32(out.subarray(at + 4, at + 8 + data.length)));
    at += 12 + data.length;
  }
  return out;
}

export function stripPngMetadata(png: Uint8Array): Uint8Array<ArrayBuffer> {
  return writePng(readPngChunks(png).filter((c) => KEEP.has(c.type)));
}
