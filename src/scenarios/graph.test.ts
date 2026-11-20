import { describe, expect, it } from 'vitest';
import { canBypass, cleanLinks, columns, isLinear, layers, successors } from './graph';
import { techniqueStep } from './model';

const step = (id: string, next?: string[]) =>
  next ? { ...techniqueStep(id), next } : techniqueStep(id);

describe('scenario graph', () => {
  it('is a plain chain by default, and while the feature is off', () => {
    const steps = [step('a'), step('b'), step('c')];
    expect(successors(steps, true)).toEqual([[1], [2], []]);
    expect(isLinear(successors(steps, true))).toBe(true);
    const branching = [step('a', ['b', 'c']), step('b'), step('c')];
    expect(successors(branching, false)).toEqual([[1], [2], []]);
  });

  it('follows explicit links, only forward, and an empty list leads to the goal', () => {
    // a → b, a → c; b → goal; c → goal. Backward and unknown links are ignored.
    const steps = [step('a', ['c', 'b', 'zz']), step('b', []), step('c', ['a'])];
    const succ = successors(steps, true);
    expect(succ).toEqual([[1, 2], [], []]);
    expect(isLinear(succ)).toBe(false);
  });

  it('places each step in the column of its longest path from a start', () => {
    // Two routes: phishing (0) → user (2) → admin (3); RDP (1) → admin (3) directly.
    const succ = [[2], [3], [3], []];
    expect(layers(succ)).toEqual([0, 0, 1, 2]);
    expect(columns(succ)).toEqual([[0, 1], [2], [3]]);
  });

  it('orders a column by its parents to limit crossings', () => {
    // 0 → 3, 1 → 2: without reordering, the links would cross.
    const succ = [[3], [2], [], []];
    expect(columns(succ)).toEqual([
      [0, 1],
      [3, 2],
    ]);
  });

  it('drops links that no longer point forward after a move or removal', () => {
    const steps = [step('c'), step('a', ['b', 'c', 'gone']), step('b')];
    expect(cleanLinks(steps).map((s) => s.next)).toEqual([undefined, ['b'], undefined]);
  });

  it('tells whether the attack can go around a step', () => {
    // 0 → 2, 1 → 3, 2 → 3: every route ends with 3; 2 can be bypassed through 1.
    const succ = [[2], [3], [3], []];
    expect(canBypass(succ, 3)).toBe(false);
    expect(canBypass(succ, 2)).toBe(true);
    expect(canBypass([[1], [2], []], 1)).toBe(false); // a chain: every step is required
  });
});
