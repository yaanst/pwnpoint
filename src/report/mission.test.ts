import { describe, expect, it } from 'vitest';
import { newScenario, type Scenario } from '../scenarios/model';
import type { Rating } from '../scenarios/rating';
import {
  EMPTY_MISSION,
  formatDateRange,
  missionProblems,
  securitySentence,
  securityStatus,
} from './mission';

const scenario = (n: number, exploitability?: Rating, impact?: Rating): Scenario => ({
  ...newScenario(`s${n}`, 'p', n, 0),
  ...(exploitability ? { exploitability } : {}),
  ...(impact ? { impact } : {}),
});

describe('securityStatus', () => {
  it('is set by the worst rated scenario', () => {
    expect(securityStatus([]).level).toBe('Satisfactory');
    expect(securityStatus([scenario(1, 1, 1)]).level).toBe('Satisfactory'); // Minor
    expect(securityStatus([scenario(1, 1, 1), scenario(2, 3, 2)]).level).toBe('Pass'); // Moderate
    const major = securityStatus([scenario(1, 4, 3), scenario(2, 3, 2), scenario(3, 5, 2)]);
    expect(major.level).toBe('Improvements required');
    expect(major.worst.map((s) => s.number)).toEqual([1, 3]);
    expect(securityStatus([scenario(1, 5, 5)]).level).toBe('Unsatisfactory'); // Severe
  });

  it('ignores unrated scenarios and lists them', () => {
    const status = securityStatus([scenario(1), scenario(2, 3, 2)]);
    expect(status.level).toBe('Pass');
    expect(status.unrated.map((s) => s.number)).toEqual([1]);
  });
});

describe('securitySentence', () => {
  it('completes the executive sentence', () => {
    const m = { ...EMPTY_MISSION, product: 'Portal', securityLevelReason: 'two major scenarios.' };
    expect(securitySentence(m, 'Improvements required')).toBe(
      'Portal’s security level is Improvements required, as two major scenarios.',
    );
    expect(securitySentence({ ...m, product: 'Kiosks', securityLevelReason: '' }, 'Pass')).toBe(
      'Kiosks’ security level is Pass.',
    );
  });
});

describe('formatDateRange', () => {
  it('writes a single day or a range, in English or French', () => {
    expect(formatDateRange('2026-10-16', '2026-10-16')).toBe('16 October 2026');
    expect(formatDateRange('2026-10-12', '2026-10-16')).toBe('12–16 October 2026');
    expect(formatDateRange('2026-09-28', '2026-10-02')).toBe('28 September – 2 October 2026');
    expect(formatDateRange('2026-12-28', '2027-01-08', 'fr')).toBe(
      '28 décembre 2026 – 8 janvier 2027',
    );
    expect(formatDateRange('', '2026-10-16')).toBe('16 October 2026');
    expect(formatDateRange('', '')).toBe('');
    expect(formatDateRange('2026-13-01', 'nope')).toBe('');
  });
});

describe('missionProblems', () => {
  it('lists what the report still needs', () => {
    const status = securityStatus([scenario(1)]);
    expect(missionProblems(EMPTY_MISSION, status)).toEqual([
      'Add the client.',
      'Add the product or system assessed.',
      'Add the assessment dates.',
      'Explain the security level.',
      '1 scenario is not rated and not counted in the security level.',
    ]);
    const done = {
      ...EMPTY_MISSION,
      client: 'ACME',
      product: 'Portal',
      from: '2026-10-16',
      to: '2026-10-12',
      securityLevelReason: 'x',
    };
    expect(missionProblems(done, securityStatus([]))).toEqual([
      'The first day is after the last day.',
    ]);
  });
});
