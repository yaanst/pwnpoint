import { describe, expect, it } from 'vitest';
import { newFinding } from '../findings/model';
import { newRecommendation } from '../recommendations/model';
import { type ScenarioStep, stepView } from './model';

describe('stepView', () => {
  it('gives a finding step its linked recommendations, highest priority first', () => {
    const f = { ...newFinding('f1', 'p1', 1, 0), title: 'Weak passwords' };
    const rec = (id: string, number: number, priority: 1 | 2 | 3, findingIds: string[]) => ({
      ...newRecommendation(id, 'p1', number, 0, 'ACC'),
      title: `Action ${number}`,
      priority,
      findingIds,
    });
    const recs = [rec('r1', 1, 1, ['f1']), rec('r2', 2, 3, ['f1']), rec('r3', 3, 3, ['other'])];
    const step: ScenarioStep = {
      id: 's1',
      kind: 'finding',
      findingId: 'f1',
      gains: '',
      note: '',
      chainBreaker: true,
    };
    const v = stepView(step, new Map([['f1', f]]), recs);
    expect(v.recommendation).toBe('REC.ACC.02 Action 2; REC.ACC.01 Action 1');
    expect(stepView(step, new Map([['f1', f]])).recommendation).toBe('');
  });
});
