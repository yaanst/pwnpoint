import { describe, expect, it } from 'vitest';
import type { Project } from '../findings/model';
import {
  newRecommendation,
  nextRecommendationNumber,
  quadrantOf,
  recommendationProblems,
  recommendationRef,
  sortForPlan,
  withRecommendationNumberTaken,
} from './model';

const rec = (number: number, patch = {}) => ({
  ...newRecommendation(`r${number}`, 'p', number, 0),
  ...patch,
});

describe('recommendationRef', () => {
  it('reads REC.NN or REC.CAT.NN', () => {
    expect(recommendationRef({ number: 1 })).toBe('REC.01');
    expect(recommendationRef({ number: 12, category: 'ACC' })).toBe('REC.ACC.12');
  });
});

describe('quadrantOf', () => {
  it('follows the recommendation classification', () => {
    const q = (complexity: 1 | 2 | 3, workload: 1 | 2 | 3, cost: 1 | 2 | 3, priority: 1 | 2 | 3) =>
      quadrantOf({ complexity, workload, cost, priority });
    expect(q(1, 2, 2, 3)).toBe('quick-win'); // 5 < 6, top priority
    expect(q(1, 2, 2, 2)).toBe('side-action');
    expect(q(2, 2, 2, 3)).toBe('heavy-project'); // 6
    expect(q(3, 3, 3, 1)).toBe('can-be-delayed');
    expect(quadrantOf({ complexity: 1, workload: 1, cost: 1 })).toBeUndefined();
  });
});

describe('counters', () => {
  it('counts each category on its own', () => {
    const p: Project = { id: 'p', name: 'P', nextFindingNumber: 1, createdAt: 0 };
    expect(nextRecommendationNumber(p, undefined)).toBe(1);
    const p2 = withRecommendationNumberTaken(
      withRecommendationNumberTaken(p, 'ACC', 1),
      undefined,
      1,
    );
    expect(nextRecommendationNumber(p2, 'ACC')).toBe(2);
    expect(nextRecommendationNumber(p2, 'HAR')).toBe(1);
    expect(nextRecommendationNumber(p2, undefined)).toBe(2);
    expect(nextRecommendationNumber(withRecommendationNumberTaken(p2, 'ACC', 1), 'ACC')).toBe(2);
  });
});

describe('sortForPlan and problems', () => {
  it('orders by priority, then category, then number', () => {
    const list = [
      rec(1, { priority: 1 }),
      rec(2, { category: 'HAR', priority: 3 }),
      rec(1, { category: 'ACC', priority: 3 }),
      rec(3),
    ];
    expect(sortForPlan(list).map(recommendationRef)).toEqual([
      'REC.ACC.01',
      'REC.HAR.02',
      'REC.01',
      'REC.03',
    ]);
  });

  it('asks for a title, a finding and the four criteria', () => {
    expect(recommendationProblems(rec(1))).toHaveLength(3);
    const done = rec(1, {
      title: 'Disable SMBv1',
      findingIds: ['f1'],
      complexity: 1,
      workload: 1,
      cost: 1,
      priority: 3,
    });
    expect(recommendationProblems(done)).toEqual([]);
  });
});
