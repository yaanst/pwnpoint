import { describe, expect, it } from 'vitest';
import { findingHref, matchRoute, routeFromHash, scenarioHref } from './router';

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

describe('matchRoute', () => {
  it.each([
    ['/', { name: 'findings' }],
    ['/findings', { name: 'findings' }],
    ['/findings/abc-123', { name: 'finding', id: 'abc-123' }],
    ['/scenarios', { name: 'scenarios' }],
    ['/scenarios/s-1', { name: 'scenario', id: 's-1' }],
    ['/recommendations', { name: 'recommendations' }],
    ['/recommendations/r-1', { name: 'recommendation', id: 'r-1' }],
    ['/recommendations/r-1/x', { name: 'not-found' }],
    ['/toString/x', { name: 'not-found' }],
    ['/scenarios/%E0%A4%A', { name: 'not-found' }],
    ['/cvss', { name: 'cvss' }],
    ['/settings', { name: 'settings' }],
    ['/findings/a/b', { name: 'not-found' }],
    ['/nope', { name: 'not-found' }],
    ['/findings/%E0%A4%A', { name: 'not-found' }],
  ])('%s', (route, page) => {
    expect(matchRoute(route)).toEqual(page);
  });

  it('round-trips finding links', () => {
    const id = 'id with/slash';
    expect(matchRoute(routeFromHash(findingHref(id)))).toEqual({ name: 'finding', id });
    expect(matchRoute(routeFromHash(scenarioHref(id)))).toEqual({ name: 'scenario', id });
  });
});
