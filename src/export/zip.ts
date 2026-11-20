import { crc32 } from '../evidence/png';

export interface ZipEntry {
  name: string;
  data: Uint8Array;
}

const utf8 = new TextEncoder();
// Fixed timestamp (1980-01-01 00:00, the DOS epoch): output is deterministic and leaks no time.
const DOS_TIME = 0;
const DOS_DATE = (0 << 9) | (1 << 5) | 1;

/**
 * Minimal ZIP writer (method 0, "stored"): enough for OOXML packages. PNG data is already
 * compressed, and XML parts are small. No ZIP64: refuses archives over 4 GiB or 65535 entries.
 */
export function zip(entries: ZipEntry[]): Uint8Array<ArrayBuffer> {
  if (entries.length > 0xffff) throw new Error('Too many files for a ZIP archive.');
  const names = entries.map((e) => utf8.encode(e.name));
  const crcs = entries.map((e) => crc32(e.data));
  const localSize = entries.reduce(
    (n, e, i) => n + 30 + (names[i]?.length ?? 0) + e.data.length,
    0,
  );
  const centralSize = names.reduce((n, name) => n + 46 + name.length, 0);
  const total = localSize + centralSize + 22;
  if (total > 0xffffffff) throw new Error('The archive is too large.');

  const out = new Uint8Array(total);
  const view = new DataView(out.buffer);
  const offsets: number[] = [];
  let at = 0;
  entries.forEach((e, i) => {
    const name = names[i] ?? new Uint8Array();
    offsets.push(at);
    view.setUint32(at, 0x04034b50, true);
    view.setUint16(at + 4, 20, true); // version needed
    view.setUint16(at + 6, 0x0800, true); // UTF-8 names
    view.setUint16(at + 8, 0, true); // stored
    view.setUint16(at + 10, DOS_TIME, true);
    view.setUint16(at + 12, DOS_DATE, true);
    view.setUint32(at + 14, crcs[i] ?? 0, true);
    view.setUint32(at + 18, e.data.length, true);
    view.setUint32(at + 22, e.data.length, true);
    view.setUint16(at + 26, name.length, true);
    view.setUint16(at + 28, 0, true);
    out.set(name, at + 30);
    out.set(e.data, at + 30 + name.length);
    at += 30 + name.length + e.data.length;
  });
  const centralStart = at;
  entries.forEach((e, i) => {
    const name = names[i] ?? new Uint8Array();
    view.setUint32(at, 0x02014b50, true);
    view.setUint16(at + 4, 20, true); // version made by
    view.setUint16(at + 6, 20, true); // version needed
    view.setUint16(at + 8, 0x0800, true);
    view.setUint16(at + 10, 0, true);
    view.setUint16(at + 12, DOS_TIME, true);
    view.setUint16(at + 14, DOS_DATE, true);
    view.setUint32(at + 16, crcs[i] ?? 0, true);
    view.setUint32(at + 20, e.data.length, true);
    view.setUint32(at + 24, e.data.length, true);
    view.setUint16(at + 28, name.length, true);
    // extra length, comment length, disk, internal and external attributes: 0
    view.setUint32(at + 42, offsets[i] ?? 0, true);
    out.set(name, at + 46);
    at += 46 + name.length;
  });
  view.setUint32(at, 0x06054b50, true);
  view.setUint16(at + 8, entries.length, true);
  view.setUint16(at + 10, entries.length, true);
  view.setUint32(at + 12, at - centralStart, true);
  view.setUint32(at + 16, centralStart, true);
  return out;
}

export class ZipError extends Error {
  override name = 'ZipError';
}

/**
 * Reads a stored-only archive (as written by `zip`). Safe on untrusted input: every offset and
 * length is bounds-checked, only method 0 (stored) is accepted, names must be unique, relative
 * and free of `..`, and the CRC of every entry is verified. Throws ZipError otherwise.
 */
export function unzipStored(
  archive: Uint8Array,
  { maxEntries = 0xffff }: { maxEntries?: number } = {},
): Map<string, Uint8Array> {
  const fail = (why: string): never => {
    throw new ZipError(why);
  };
  const view = new DataView(archive.buffer, archive.byteOffset, archive.byteLength);
  const u16 = (at: number) =>
    at + 2 <= archive.length ? view.getUint16(at, true) : fail('Truncated archive.');
  const u32 = (at: number) =>
    at + 4 <= archive.length ? view.getUint32(at, true) : fail('Truncated archive.');
  const end = archive.length - 22; // no archive comment: `zip` never writes one
  if (end < 0 || u32(end) !== 0x06054b50) fail('Not a ZIP archive.');
  const count = u16(end + 10);
  if (count > maxEntries) fail('The archive has too many files.');
  const centralSize = u32(end + 12);
  let at = u32(end + 16);
  if (at + centralSize > end) fail('Bad central directory.');
  const files = new Map<string, Uint8Array>();
  const decoder = new TextDecoder('utf-8', { fatal: true });
  for (let i = 0; i < count; i++) {
    if (u32(at) !== 0x02014b50) fail('Bad central directory.');
    if (u16(at + 10) !== 0) fail('Compressed entries are not supported.');
    const crc = u32(at + 16);
    const size = u32(at + 20);
    if (u32(at + 24) !== size) fail('Bad entry size.');
    const nameLen = u16(at + 28);
    const skip = nameLen + u16(at + 30) + u16(at + 32);
    const offset = u32(at + 42);
    if (at + 46 + skip > end) fail('Bad central directory.');
    let name = '';
    try {
      name = decoder.decode(archive.subarray(at + 46, at + 46 + nameLen));
    } catch {
      fail('Bad file name in archive.');
    }
    if (!name || name.startsWith('/') || name.split('/').includes('..') || name.includes('\\')) {
      fail('Unsafe file name in archive.');
    }
    if (files.has(name)) fail('Duplicate file name in archive.');
    if (u32(offset) !== 0x04034b50) fail('Bad local file header.');
    if (u16(offset + 8) !== 0) fail('Compressed entries are not supported.');
    const start = offset + 30 + u16(offset + 26) + u16(offset + 28);
    if (start + size > archive.length) fail('Truncated archive.');
    const data = archive.subarray(start, start + size);
    if (crc32(data) !== crc) fail(`Bad CRC for ${name}.`);
    files.set(name, data);
    at += 46 + skip;
  }
  return files;
}
