import { describe, expect, it } from 'vitest';
import { formatBytes, storageWarning } from './usage';

describe('formatBytes', () => {
  it.each([
    [512, '512 B'],
    [1536, '1.5 KB'],
    [25 * 1024 * 1024, '25 MB'],
    [3.2 * 1024 ** 3, '3.2 GB'],
  ])('%d → %s', (n, s) => {
    expect(formatBytes(n)).toBe(s);
  });
});

describe('storageWarning', () => {
  it('stays quiet for normal use', () => {
    expect(storageWarning({ usage: 200 * 1024 ** 2, quota: 10 * 1024 ** 3 })).toBeNull();
    expect(storageWarning(null)).toBeNull();
  });

  it('warns above 1 GB or near the quota', () => {
    expect(storageWarning({ usage: 1.5 * 1024 ** 3, quota: 100 * 1024 ** 3 })).toMatch(/1.5 GB/);
    expect(storageWarning({ usage: 850 * 1024 ** 2, quota: 1024 ** 3 })).toMatch(/83%/);
  });
});
