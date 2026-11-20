import { isEnabled } from '../flags';
import type { ScenarioStep } from './model';

/**
 * Branching scenarios: alternative paths. A step leads to one or more later steps (only later
 * ones, so the graph never loops); a step that leads nowhere reaches the goal. Pure module.
 */

/** For each step, the indices of the steps it leads to, in list order. */
export function successors(
  steps: Pick<ScenarioStep, 'id' | 'next'>[],
  branches = isEnabled('scenarioBranches'),
): number[][] {
  const index = new Map(steps.map((s, i) => [s.id, i]));
  return steps.map((s, i) => {
    if (!branches || s.next === undefined) return i + 1 < steps.length ? [i + 1] : [];
    const out = s.next
      .map((id) => index.get(id))
      .filter((j): j is number => j !== undefined && j > i);
    return [...new Set(out)].sort((a, b) => a - b);
  });
}

/** True when every step leads to the next one only: the plain chain of linear scenarios. */
export const isLinear = (succ: number[][]): boolean =>
  succ.every((s, i) => (i + 1 < succ.length ? s.length === 1 && s[0] === i + 1 : s.length === 0));

/** Column of each step: the length of the longest path from a starting step (one without parents). */
export function layers(succ: number[][]): number[] {
  const layer = succ.map(() => 0);
  // Links only go forward in the list, so list order is a topological order.
  succ.forEach((next, i) =>
    next.forEach((j) => (layer[j] = Math.max(layer[j] ?? 0, (layer[i] ?? 0) + 1))),
  );
  return layer;
}

/**
 * Steps of each column, top to bottom. Columns are ordered by the average row of each step's
 * parents (barycentre), so links cross as little as a single left-to-right pass allows.
 */
export function columns(succ: number[][]): number[][] {
  const layer = layers(succ);
  const parents = succ.map(() => [] as number[]);
  succ.forEach((next, i) => next.forEach((j) => parents[j]?.push(i)));
  const count = Math.max(0, ...layer.map((l) => l + 1));
  const cols: number[][] = Array.from({ length: count }, () => []);
  layer.forEach((l, i) => cols[l]?.push(i));
  const row = new Map<number, number>();
  return cols.map((col) => {
    const key = (i: number) => {
      const p = parents[i] ?? [];
      return p.length ? p.reduce((sum, q) => sum + (row.get(q) ?? 0), 0) / p.length : -1;
    };
    const ordered = [...col].sort((a, b) => key(a) - key(b) || a - b);
    // Rows are centred on the column, so compare positions relative to the centre.
    ordered.forEach((i, r) => row.set(i, r - (ordered.length - 1) / 2));
    return ordered;
  });
}

/** Removes links that point to a missing step or to an earlier one (after a move or removal). */
export function cleanLinks(steps: ScenarioStep[]): ScenarioStep[] {
  const index = new Map(steps.map((s, i) => [s.id, i]));
  return steps.map((s, i) => {
    if (s.next === undefined) return s;
    const next = s.next.filter((id) => (index.get(id) ?? -1) > i);
    return next.length === s.next.length ? s : { ...s, next };
  });
}

/**
 * True when some route from a starting step to the goal avoids step `i`: then fixing it does not
 * stop the attack, so it is not really a chain breaker.
 */
export function canBypass(succ: number[][], i: number): boolean {
  const hasParent = new Set(succ.flat());
  const seen = new Set<number>();
  const reachesGoal = (k: number): boolean => {
    if (k === i || seen.has(k)) return false;
    seen.add(k);
    const next = succ[k] ?? [];
    return next.length === 0 || next.some(reachesGoal);
  };
  return succ.some((_, k) => !hasParent.has(k) && reachesGoal(k));
}
