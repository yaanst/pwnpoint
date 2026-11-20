import { describe, expect, it } from 'vitest';
import { nextRadioIndex } from './roving';

describe('nextRadioIndex', () => {
  it('moves forward and backward with wrap-around', () => {
    expect(nextRadioIndex('ArrowRight', 0, 3)).toBe(1);
    expect(nextRadioIndex('ArrowDown', 2, 3)).toBe(0);
    expect(nextRadioIndex('ArrowLeft', 0, 3)).toBe(2);
    expect(nextRadioIndex('ArrowUp', 1, 3)).toBe(0);
  });

  it('jumps with Home and End', () => {
    expect(nextRadioIndex('Home', 2, 4)).toBe(0);
    expect(nextRadioIndex('End', 0, 4)).toBe(3);
  });

  it('ignores other keys', () => {
    expect(nextRadioIndex('Tab', 1, 3)).toBeNull();
    expect(nextRadioIndex('a', 1, 3)).toBeNull();
  });
});
