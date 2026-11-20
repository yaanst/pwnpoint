import { describe, expect, it } from 'vitest';
import { routeFromHash } from './router';

describe('routeFromHash', () => {
  it.each([
    ['', '/'],
    ['#', '/'],
    ['#/settings', '/settings'],
    ['#settings', '/'],
  ])('%j → %j', (hash, route) => {
    expect(routeFromHash(hash)).toBe(route);
  });
});
