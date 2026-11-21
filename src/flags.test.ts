import { describe, expect, it } from 'vitest';
import { flags, isEnabled } from './flags';

describe('flags', () => {
  it('ships the finished features enabled (v0.2.0)', () => {
    expect(isEnabled('cvssAdvanced')).toBe(true);
    expect(isEnabled('scenarioBranches')).toBe(true);
  });

  it('only holds booleans', () => {
    for (const value of Object.values(flags)) expect(typeof value).toBe('boolean');
  });
});
