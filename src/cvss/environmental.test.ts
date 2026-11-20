import { describe, expect, it } from 'vitest';
import { type BaseMetrics, parseVector } from './cvss31';
import {
  calculateEnvironmentalScore,
  cvssResult,
  type EnvMetrics,
  hasEnvironmental,
  parseFullVector,
  toFullVector,
} from './environmental';

const base = (v: string): BaseMetrics => {
  const r = parseVector(`CVSS:3.1/${v}`);
  if (!r.ok) throw new Error(r.errors.join(' '));
  return r.metrics;
};
const CRIT = base('AV:N/AC:L/PR:N/UI:N/S:U/C:H/I:H/A:H'); // base 9.8

/*
 * Expected values computed by hand from the FIRST v3.1 specification, section 7.3 and Table 16.
 * Exploitability for AV:N/AC:L/PR:N/UI:N = 8.22 × 0.85 × 0.77 × 0.85 × 0.85 = 3.887.
 */
describe('CVSS 3.1 environmental score', () => {
  it('lowers the score when the security requirements are low', () => {
    // MISS = 1 − (1 − 0.5 × 0.56)³ = 0.6268; impact 6.42 × MISS = 4.024; 4.024 + 3.887 → 8.0
    expect(calculateEnvironmentalScore(CRIT, { CR: 'L', IR: 'L', AR: 'L' })).toBe(8.0);
  });

  it('raises it when a requirement is high', () => {
    // Base C:H only: 6.42 × 0.56 + 3.887 = 7.48 → 7.5. With CR:H: 6.42 × 0.84 + 3.887 → 9.3.
    const c = base('AV:N/AC:L/PR:N/UI:N/S:U/C:H/I:N/A:N');
    expect(cvssResult(c).score).toBe(7.5);
    expect(calculateEnvironmentalScore(c, { CR: 'H' })).toBe(9.3);
  });

  it('applies modified base metrics in place of the base ones', () => {
    // MAV:A gives the same result as a base AV:A: 8.8.
    expect(calculateEnvironmentalScore(CRIT, { MAV: 'A' })).toBe(8.8);
    expect(cvssResult(base('AV:A/AC:L/PR:N/UI:N/S:U/C:H/I:H/A:H')).score).toBe(8.8);
    // Modified scope Unchanged also switches PR to the unchanged weights: 8.8, like S:U.
    const changed = base('AV:N/AC:L/PR:L/UI:N/S:C/C:H/I:H/A:H');
    expect(cvssResult(changed).score).toBe(9.9);
    expect(calculateEnvironmentalScore(changed, { MS: 'U' })).toBe(8.8);
    expect(cvssResult(base('AV:N/AC:L/PR:L/UI:N/S:U/C:H/I:H/A:H')).score).toBe(8.8);
  });

  it('is 0 when the modified impacts are all None', () => {
    expect(calculateEnvironmentalScore(CRIT, { MC: 'N', MI: 'N', MA: 'N' })).toBe(0);
  });

  it('uses the v3.1 changed-scope formula (exponent 13, MISS × 0.9731)', () => {
    // Neutral requirement on a changed-scope 9.9: MISS 0.9148, impact 6.128, exploitability
    // 3.110, 1.08 × 9.238 = 9.977 → 10.0. The environmental formula differs from the base one.
    const changed = base('AV:N/AC:L/PR:L/UI:N/S:C/C:H/I:H/A:H');
    expect(calculateEnvironmentalScore(changed, { CR: 'M' })).toBe(10.0);
  });

  it('caps MISS at 0.915', () => {
    // All high requirements on all-high impacts: MISS would be 1 − (1 − 0.84)³ ≈ 0.996.
    // Capped: 6.42 × 0.915 + 3.887 = 9.761 → 9.8.
    expect(calculateEnvironmentalScore(CRIT, { CR: 'H', IR: 'H', AR: 'H' })).toBe(9.8);
  });
});

describe('score selection', () => {
  it('uses the base score unless an environmental metric is defined', () => {
    expect(hasEnvironmental(undefined)).toBe(false);
    expect(hasEnvironmental({})).toBe(false);
    expect(cvssResult(CRIT, {})).toMatchObject({ kind: 'base', score: 9.8, severity: 'Critical' });
    expect(cvssResult(CRIT, { CR: 'L', IR: 'L', AR: 'L' })).toMatchObject({
      kind: 'environmental',
      score: 8.0,
      severity: 'High',
      baseScore: 9.8,
      vector: 'CVSS:3.1/AV:N/AC:L/PR:N/UI:N/S:U/C:H/I:H/A:H/CR:L/IR:L/AR:L',
    });
  });
});

describe('vector strings with environmental metrics', () => {
  it('writes them in specification order after the base metrics', () => {
    const env: EnvMetrics = { MA: 'L', CR: 'H', MAV: 'A' };
    expect(toFullVector(CRIT, env)).toBe(
      'CVSS:3.1/AV:N/AC:L/PR:N/UI:N/S:U/C:H/I:H/A:H/CR:H/MAV:A/MA:L',
    );
  });

  it('reads them in any order, dropping Not Defined (X)', () => {
    const r = parseFullVector('CVSS:3.1/MAV:A/AV:N/AC:L/PR:N/UI:N/S:U/C:H/I:H/A:H/CR:X/MA:L');
    expect(r).toEqual({ ok: true, metrics: CRIT, env: { MAV: 'A', MA: 'L' } });
    expect(parseFullVector('CVSS:3.1/AV:N/AC:L/PR:N/UI:N/S:U/C:H/I:H/A:H')).toEqual({
      ok: true,
      metrics: CRIT,
      env: {},
    });
  });

  it('round-trips', () => {
    const v =
      'CVSS:3.1/AV:L/AC:H/PR:H/UI:R/S:C/C:L/I:N/A:H/CR:L/IR:M/AR:H/MAV:P/MAC:L/MPR:N/MUI:N/MS:U/MC:H/MI:L/MA:N';
    const r = parseFullVector(v);
    if (!r.ok) throw new Error(r.errors.join(' '));
    expect(toFullVector(r.metrics, r.env)).toBe(v);
  });

  it('explains what is wrong', () => {
    const bad = parseFullVector('CVSS:3.1/AV:N/AC:L/PR:N/UI:N/S:U/C:H/I:H/A:H/E:P/CR:Q/ZZ:1/CR:H');
    expect(bad.ok).toBe(false);
    if (bad.ok) return;
    expect(bad.errors).toEqual([
      'E is a temporal metric. Temporal metrics are not supported: remove it.',
      'CR:Q is not valid. CR must be one of X, H, M, L.',
      'ZZ is not a CVSS 3.1 metric.',
      'CR appears more than once.',
    ]);
    expect(parseFullVector('CVSS:3.1/AV:N/CR:H')).toMatchObject({
      ok: false,
      errors: ['Missing base metric(s): AC, PR, UI, S, C, I, A.'],
    });
  });
});
