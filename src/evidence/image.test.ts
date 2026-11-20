import { describe, expect, it } from 'vitest';
import { ACCEPTED_TYPES, fitWithin } from './image';

describe('fitWithin', () => {
  it('keeps images up to 2560 px wide unchanged', () => {
    expect(fitWithin(2560, 1440)).toEqual({ width: 2560, height: 1440, scaled: false });
    expect(fitWithin(800, 600)).toEqual({ width: 800, height: 600, scaled: false });
  });

  it('downscales wider images keeping the aspect ratio', () => {
    expect(fitWithin(5120, 2880)).toEqual({ width: 2560, height: 1440, scaled: true });
    expect(fitWithin(3000, 1000)).toEqual({ width: 2560, height: 853, scaled: true });
  });

  it('never returns a zero height', () => {
    expect(fitWithin(100000, 10).height).toBe(1);
  });
});

describe('accepted types', () => {
  it('refuses SVG', () => {
    expect(ACCEPTED_TYPES).not.toContain('image/svg+xml');
  });
});
