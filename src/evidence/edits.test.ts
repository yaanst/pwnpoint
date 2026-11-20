import { describe, expect, it } from 'vitest';
import {
  applyEdits,
  crop,
  fillBlack,
  type Pixels,
  pixelate,
  pixelBlockSize,
  rectFromPoints,
} from './edits';

/** Image where every pixel has a distinct value: R = x, G = y, B = (x * y) % 256. */
function gradient(width: number, height: number): Pixels {
  const data = new Uint8ClampedArray(width * height * 4);
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const i = (y * width + x) * 4;
      data.set([x, y, (x * y) % 256, 255], i);
    }
  }
  return { data, width, height };
}
const px = (p: Pixels, x: number, y: number) => [
  ...p.data.subarray((y * p.width + x) * 4, (y * p.width + x) * 4 + 4),
];

describe('rectFromPoints', () => {
  it('works in any drag direction and clamps to the image', () => {
    expect(rectFromPoints({ x: 50, y: 40 }, { x: 10, y: 5 }, 100, 100)).toEqual({
      x: 10,
      y: 5,
      w: 40,
      h: 35,
    });
    expect(rectFromPoints({ x: -20, y: 90 }, { x: 30, y: 150 }, 100, 100)).toEqual({
      x: 0,
      y: 90,
      w: 30,
      h: 10,
    });
  });

  it('rounds outward to whole pixels so nothing at the edge is missed', () => {
    expect(rectFromPoints({ x: 1.6, y: 2.2 }, { x: 4.1, y: 5.9 }, 10, 10)).toEqual({
      x: 1,
      y: 2,
      w: 4,
      h: 4,
    });
  });
});

describe('fillBlack', () => {
  it('makes every pixel of the rectangle opaque black and leaves the rest', () => {
    const p = gradient(40, 30);
    fillBlack(p, { x: 10, y: 5, w: 8, h: 4 });
    for (let y = 5; y < 9; y++)
      for (let x = 10; x < 18; x++) expect(px(p, x, y)).toEqual([0, 0, 0, 255]);
    expect(px(p, 9, 5)).toEqual([9, 5, 45, 255]);
    expect(px(p, 18, 8)).toEqual([18, 8, 144, 255]);
  });
});

describe('pixelate', () => {
  it('uses coarse blocks (at least 16 px)', () => {
    expect(pixelBlockSize({ x: 0, y: 0, w: 40, h: 20 })).toBe(16);
    expect(pixelBlockSize({ x: 0, y: 0, w: 400, h: 200 })).toBe(50);
  });

  it('leaves no original pixel value inside the area: each block is one flat colour', () => {
    const p = gradient(64, 64);
    const before = gradient(64, 64);
    pixelate(p, { x: 0, y: 0, w: 32, h: 32 }, 16);
    const block = px(p, 0, 0);
    for (let y = 0; y < 16; y++) for (let x = 0; x < 16; x++) expect(px(p, x, y)).toEqual(block);
    // The distinct gradient values are gone (only 4 colours remain in the 32×32 area).
    const colours = new Set<string>();
    for (let y = 0; y < 32; y++) for (let x = 0; x < 32; x++) colours.add(px(p, x, y).join());
    expect(colours.size).toBe(4);
    expect(px(p, 40, 40)).toEqual(px(before, 40, 40));
  });

  it('averages the block colour', () => {
    const p: Pixels = {
      data: new Uint8ClampedArray([0, 0, 0, 255, 200, 100, 50, 255]),
      width: 2,
      height: 1,
    };
    pixelate(p, { x: 0, y: 0, w: 2, h: 1 }, 16);
    expect([...p.data]).toEqual([100, 50, 25, 255, 100, 50, 25, 255]);
  });
});

describe('crop and applyEdits', () => {
  it('crops to the rectangle', () => {
    const c = crop(gradient(50, 40), { x: 10, y: 20, w: 5, h: 3 });
    expect([c.width, c.height]).toEqual([5, 3]);
    expect(px(c, 0, 0)).toEqual([10, 20, 200, 255]);
    expect(px(c, 4, 2)).toEqual([14, 22, (14 * 22) % 256, 255]);
  });

  it('applies redactions before cropping, on a copy', () => {
    const src = gradient(50, 40);
    const out = applyEdits(src, [{ kind: 'box', rect: { x: 0, y: 0, w: 20, h: 20 } }], {
      x: 10,
      y: 10,
      w: 20,
      h: 20,
    });
    expect([out.width, out.height]).toEqual([20, 20]);
    expect(px(out, 0, 0)).toEqual([0, 0, 0, 255]); // was (10,10) → black
    expect(px(out, 10, 10)).toEqual([20, 20, 144, 255]); // was (20,20) → untouched
    expect(px(src, 0, 0)).toEqual([0, 0, 0, 255]); // source pixel (0,0) is itself black in the gradient
    expect(px(src, 15, 15)).toEqual([15, 15, 225, 255]); // source not modified
  });

  it('ignores an empty crop', () => {
    expect(applyEdits(gradient(10, 10), [], { x: 3, y: 3, w: 0, h: 5 }).width).toBe(10);
  });
});
