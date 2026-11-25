import { describe, expect, it } from 'vitest';
import type { BaseMetrics } from '../cvss/cvss31';
import { type Finding, newFinding } from '../findings/model';
import { findingStep, newScenario, techniqueStep, upgradeScenario, type Scenario } from './model';
import {
  findingExploitability,
  findingImpact,
  RATINGS,
  scenarioSeverity,
  suggestRating,
} from './rating';

const cvss = (vector: string): BaseMetrics =>
  Object.fromEntries(vector.split('/').map((p) => p.split(':'))) as BaseMetrics;
const finding = (id: string, vector: string): Finding => ({
  ...newFinding(id, 'p', 1, 0),
  cvss: cvss(vector),
});

describe('scenarioSeverity', () => {
  it('reads the appendix matrix (rows: exploitability, columns: impact)', () => {
    const grid = [...RATINGS].reverse().map((e) => RATINGS.map((i) => scenarioSeverity(e, i)));
    expect(grid).toEqual([
      ['Moderate', 'Major', 'Major', 'Severe', 'Severe'], // Very likely
      ['Moderate', 'Moderate', 'Major', 'Severe', 'Severe'], // Likely
      ['Minor', 'Moderate', 'Moderate', 'Major', 'Severe'], // Possible
      ['Minor', 'Minor', 'Moderate', 'Moderate', 'Major'], // Unlikely
      ['Minor', 'Minor', 'Moderate', 'Moderate', 'Major'], // Rare
    ]);
  });
});

describe('finding exploitability and impact', () => {
  it('bands the CVSS sub-scores into 5 levels', () => {
    const e = (v: string) => findingExploitability({ cvss: cvss(v) });
    expect(e('AV:N/AC:L/PR:N/UI:N/S:U/C:H/I:H/A:H')).toBe(5); // 3.9
    expect(e('AV:A/AC:L/PR:N/UI:N/S:U/C:H/I:H/A:H')).toBe(4); // 3.3
    expect(e('AV:N/AC:H/PR:N/UI:N/S:U/C:H/I:H/A:H')).toBe(3); // 2.2
    expect(e('AV:P/AC:L/PR:N/UI:N/S:U/C:H/I:H/A:H')).toBe(2); // 0.9
    expect(e('AV:P/AC:L/PR:L/UI:R/S:C/C:H/I:L/A:H')).toBe(1); // 0.5

    const i = (v: string) => findingImpact({ cvss: cvss(v) });
    expect(i('AV:N/AC:L/PR:N/UI:N/S:U/C:N/I:N/A:N')).toBe(1);
    expect(i('AV:N/AC:L/PR:N/UI:N/S:U/C:L/I:N/A:N')).toBe(2); // 1.4
    expect(i('AV:N/AC:L/PR:N/UI:N/S:U/C:H/I:N/A:N')).toBe(3); // 3.6
    expect(i('AV:N/AC:L/PR:N/UI:N/S:U/C:H/I:H/A:N')).toBe(4); // 5.2
    expect(i('AV:N/AC:L/PR:N/UI:N/S:U/C:H/I:H/A:H')).toBe(5); // 5.9
    expect(i('AV:N/AC:L/PR:N/UI:N/S:C/C:H/I:H/A:H')).toBe(5); // 6.0
  });

  it('uses the modified (environmental) metrics when set', () => {
    const f = { cvss: cvss('AV:N/AC:L/PR:N/UI:N/S:U/C:H/I:H/A:H'), cvssEnv: { MAV: 'P' as const } };
    expect(findingExploitability(f)).toBe(2);
  });
});

describe('suggestRating', () => {
  const easy = finding('easy', 'AV:N/AC:L/PR:N/UI:N/S:U/C:L/I:N/A:N'); // 5, impact 2
  const hard = finding('hard', 'AV:P/AC:L/PR:N/UI:N/S:U/C:H/I:H/A:H'); // 2, impact 5
  const mid = finding('mid', 'AV:N/AC:H/PR:N/UI:N/S:U/C:H/I:N/A:N'); // 3, impact 3
  const all = new Map([easy, hard, mid].map((f) => [f.id, f]));

  it('takes the minimum exploitability along a chain and the maximum impact', () => {
    const steps = [findingStep('a', 'easy'), techniqueStep('t'), findingStep('b', 'hard')];
    expect(suggestRating(steps, all)).toEqual({ exploitability: 2, impact: 5 });
  });

  it('takes the easiest of alternative paths', () => {
    // a → (b | c) → goal: via b the path is limited to 2, via c to 3.
    const steps = [
      { ...findingStep('a', 'easy'), next: ['b', 'c'] },
      { ...findingStep('b', 'hard'), next: [] },
      { ...findingStep('c', 'mid'), next: [] },
    ];
    expect(suggestRating(steps, all)).toEqual({ exploitability: 3, impact: 5 });
  });

  it('suggests nothing without findings, and ignores deleted ones', () => {
    expect(suggestRating([techniqueStep('t')], all)).toBeUndefined();
    expect(suggestRating([findingStep('x', 'gone')], all)).toBeUndefined();
    expect(suggestRating([findingStep('x', 'gone'), findingStep('m', 'mid')], all)).toEqual({
      exploitability: 3,
      impact: 3,
    });
  });
});

describe('upgradeScenario', () => {
  it('maps the 4-level impact and likelihood of older scenarios to the 5-level scales', () => {
    const {
      exploitabilityRationale: _e,
      impactRationale: _i,
      ...bare
    } = newScenario('s', 'p', 1, 0);
    const old = { ...bare, impact: 'Critical', likelihood: 'Medium' } as unknown as Scenario;
    const s = upgradeScenario(old);
    expect(s).toMatchObject({ exploitability: 3, impact: 5, exploitabilityRationale: '' });
    expect(Object.keys(s)).not.toContain('likelihood');
    expect(upgradeScenario(s)).toEqual(s);
    const unrated = upgradeScenario(newScenario('s', 'p', 1, 0));
    expect(unrated.exploitability).toBeUndefined();
    expect(unrated.impact).toBeUndefined();
  });
});
