/**
 * Redaction and crop as pure operations on RGBA pixels, so they can be unit-tested and
 * applied at full resolution regardless of how the image is displayed.
 */

export interface Rect {
  x: number;
  y: number;
  w: number;
  h: number;
}

export type Redaction = { kind: 'box'; rect: Rect } | { kind: 'pixelate'; rect: Rect };

export interface Pixels {
  data: Uint8ClampedArray;
  width: number;
  height: number;
}

/** Rectangle from two drag points, in any direction, clamped to the image, in whole pixels. */
export function rectFromPoints(
  a: { x: number; y: number },
  b: { x: number; y: number },
  width: number,
  height: number,
): Rect {
  const x0 = Math.max(0, Math.min(a.x, b.x));
  const y0 = Math.max(0, Math.min(a.y, b.y));
  const x1 = Math.min(width, Math.max(a.x, b.x));
  const y1 = Math.min(height, Math.max(a.y, b.y));
  const x = Math.floor(x0);
  const y = Math.floor(y0);
  return { x, y, w: Math.max(0, Math.ceil(x1) - x), h: Math.max(0, Math.ceil(y1) - y) };
}

export function clampRect(r: Rect, width: number, height: number): Rect {
  return rectFromPoints({ x: r.x, y: r.y }, { x: r.x + r.w, y: r.y + r.h }, width, height);
}

export const isEmpty = (r: Rect) => r.w < 1 || r.h < 1;

/** Fills a rectangle with opaque black. */
export function fillBlack(p: Pixels, rect: Rect): void {
  const r = clampRect(rect, p.width, p.height);
  for (let y = r.y; y < r.y + r.h; y++) {
    for (let x = r.x; x < r.x + r.w; x++) {
      const i = (y * p.width + x) * 4;
      p.data[i] = 0;
      p.data[i + 1] = 0;
      p.data[i + 2] = 0;
      p.data[i + 3] = 255;
    }
  }
}

/**
 * Block size for pixelation: coarse on purpose (at least 16 px, and at least 1/4 of the
 * shorter side of the area), because fine pixelation of text can be reversed.
 */
export function pixelBlockSize(rect: Rect): number {
  return Math.max(16, Math.ceil(Math.min(rect.w, rect.h) / 4));
}

/** Replaces each block of the rectangle by its average colour (fully opaque). */
export function pixelate(p: Pixels, rect: Rect, block = pixelBlockSize(rect)): void {
  const r = clampRect(rect, p.width, p.height);
  for (let by = r.y; by < r.y + r.h; by += block) {
    for (let bx = r.x; bx < r.x + r.w; bx += block) {
      const ex = Math.min(bx + block, r.x + r.w);
      const ey = Math.min(by + block, r.y + r.h);
      let red = 0;
      let green = 0;
      let blue = 0;
      let n = 0;
      for (let y = by; y < ey; y++) {
        for (let x = bx; x < ex; x++) {
          const i = (y * p.width + x) * 4;
          red += p.data[i] ?? 0;
          green += p.data[i + 1] ?? 0;
          blue += p.data[i + 2] ?? 0;
          n++;
        }
      }
      const avg = [red / n, green / n, blue / n].map(Math.round);
      for (let y = by; y < ey; y++) {
        for (let x = bx; x < ex; x++) {
          const i = (y * p.width + x) * 4;
          p.data[i] = avg[0] ?? 0;
          p.data[i + 1] = avg[1] ?? 0;
          p.data[i + 2] = avg[2] ?? 0;
          p.data[i + 3] = 255;
        }
      }
    }
  }
}

/** Copy of a rectangle of the image. */
export function crop(p: Pixels, rect: Rect): Pixels {
  const r = clampRect(rect, p.width, p.height);
  const data = new Uint8ClampedArray(r.w * r.h * 4);
  for (let y = 0; y < r.h; y++) {
    const from = ((r.y + y) * p.width + r.x) * 4;
    data.set(p.data.subarray(from, from + r.w * 4), y * r.w * 4);
  }
  return { data, width: r.w, height: r.h };
}

/** Applies redactions (in order) then the optional crop, on a copy. */
export function applyEdits(source: Pixels, redactions: Redaction[], cropRect?: Rect): Pixels {
  const p: Pixels = {
    data: new Uint8ClampedArray(source.data),
    width: source.width,
    height: source.height,
  };
  for (const r of redactions) {
    if (r.kind === 'box') fillBlack(p, r.rect);
    else pixelate(p, r.rect);
  }
  return cropRect && !isEmpty(clampRect(cropRect, p.width, p.height)) ? crop(p, cropRect) : p;
}
