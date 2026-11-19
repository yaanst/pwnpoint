import { describe, expect, it } from 'vitest';
import { flags, isEnabled } from './flags';

describe('flags', () => {
  it('ships unfinished features disabled', () => {
    expect(isEnabled('cvssAdvanced')).toBe(false);
    expect(isEnabled('scenarioBranches')).toBe(false);
  });

  it('only holds booleans', () => {
    for (const value of Object.values(flags)) expect(typeof value).toBe('boolean');
  });
});
