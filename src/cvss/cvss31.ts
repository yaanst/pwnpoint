/**
 * CVSS v3.1 base metrics: parsing, validation, serialization and scoring.
 * Implements the FIRST CVSS v3.1 Specification, section 7 (formulas) and
 * Appendix A (integer-based Roundup). https://www.first.org/cvss/v3.1/specification-document
 * Pure module: no DOM, no I/O.
 */

export const BASE_METRICS = {
  AV: ['N', 'A', 'L', 'P'],
  AC: ['L', 'H'],
  PR: ['N', 'L', 'H'],
  UI: ['N', 'R'],
  S: ['U', 'C'],
  C: ['H', 'L', 'N'],
  I: ['H', 'L', 'N'],
  A: ['H', 'L', 'N'],
} as const;

export type MetricKey = keyof typeof BASE_METRICS;
export type BaseMetrics = { [K in MetricKey]: (typeof BASE_METRICS)[K][number] };
export type Severity = 'None' | 'Low' | 'Medium' | 'High' | 'Critical';

export const METRIC_ORDER = Object.keys(BASE_METRICS) as MetricKey[];
export const VECTOR_PREFIX = 'CVSS:3.1/';

const TEMPORAL_AND_ENVIRONMENTAL = new Set([
  'E',
  'RL',
  'RC',
  'CR',
  'IR',
  'AR',
  'MAV',
  'MAC',
  'MPR',
  'MUI',
  'MS',
  'MC',
  'MI',
  'MA',
]);

// Metric weights from the specification, section 7.4 (Table 16).
const W = {
  AV: { N: 0.85, A: 0.62, L: 0.55, P: 0.2 },
  AC: { L: 0.77, H: 0.44 },
  PR_U: { N: 0.85, L: 0.62, H: 0.27 },
  PR_C: { N: 0.85, L: 0.68, H: 0.5 }, // PR weights change when Scope is Changed.
  UI: { N: 0.85, R: 0.62 },
  CIA: { H: 0.56, L: 0.22, N: 0 },
} as const;

/**
 * Roundup from Appendix A: the smallest number, to 1 decimal place, that is equal to or
 * higher than its input. Integer arithmetic avoids floating-point errors (e.g. 4.000000001).
 */
export function roundUp(input: number): number {
  const intInput = Math.round(input * 100000);
  if (intInput % 10000 === 0) return intInput / 100000;
  return (Math.floor(intInput / 10000) + 1) / 10;
}

export interface BaseScore {
  /** Base score, 0.0–10.0. */
  score: number;
  severity: Severity;
  /** Impact sub-score (unrounded value per spec, rounded to 1 decimal for display). */
  impact: number;
  /** Exploitability sub-score, rounded to 1 decimal for display. */
  exploitability: number;
}

export function calculateBaseScore(m: BaseMetrics): BaseScore {
  const changed = m.S === 'C';
  const iss = 1 - (1 - W.CIA[m.C]) * (1 - W.CIA[m.I]) * (1 - W.CIA[m.A]);
  const impact = changed ? 7.52 * (iss - 0.029) - 3.25 * Math.pow(iss - 0.02, 15) : 6.42 * iss;
  const pr = changed ? W.PR_C[m.PR] : W.PR_U[m.PR];
  const exploitability = 8.22 * W.AV[m.AV] * W.AC[m.AC] * pr * W.UI[m.UI];

  let score: number;
  if (impact <= 0) score = 0;
  else if (changed) score = roundUp(Math.min(1.08 * (impact + exploitability), 10));
  else score = roundUp(Math.min(impact + exploitability, 10));

  return {
    score,
    severity: severityOf(score),
    impact: Math.round(Math.max(impact, 0) * 10) / 10,
    exploitability: Math.round(exploitability * 10) / 10,
  };
}

/** Qualitative severity rating scale, specification section 5 (Table 14). */
export function severityOf(score: number): Severity {
  if (score === 0) return 'None';
  if (score < 4) return 'Low';
  if (score < 7) return 'Medium';
  if (score < 9) return 'High';
  return 'Critical';
}

/** Canonical vector string, metrics in specification order. */
export function toVector(m: BaseMetrics): string {
  return VECTOR_PREFIX + METRIC_ORDER.map((k) => `${k}:${m[k]}`).join('/');
}

export type ParseResult = { ok: true; metrics: BaseMetrics } | { ok: false; errors: string[] };

/**
 * Parses a CVSS v3.1 vector string. Metrics may appear in any order (spec section 6).
 * Returns every problem found, phrased for the user.
 */
export function parseVector(input: string): ParseResult {
  const text = input.trim();
  if (!text) return { ok: false, errors: ['Paste a vector string, e.g. CVSS:3.1/AV:N/AC:L/…'] };
  if (/^CVSS:3\.0\//.test(text)) {
    return { ok: false, errors: ['This is a CVSS 3.0 vector. Only CVSS 3.1 is supported.'] };
  }
  if (/^CVSS:4\.0\//.test(text)) {
    return { ok: false, errors: ['This is a CVSS 4.0 vector. Only CVSS 3.1 is supported.'] };
  }
  if (!text.startsWith(VECTOR_PREFIX)) {
    return { ok: false, errors: [`The vector must start with "${VECTOR_PREFIX}".`] };
  }

  const errors: string[] = [];
  const found = new Map<string, string>();
  for (const part of text.slice(VECTOR_PREFIX.length).split('/')) {
    const [key, value, extra] = part.split(':');
    if (!key || value === undefined || extra !== undefined) {
      errors.push(`"${part}" is not a metric. Use the form METRIC:VALUE, e.g. AV:N.`);
      continue;
    }
    if (found.has(key)) {
      errors.push(`${key} appears more than once.`);
      continue;
    }
    found.set(key, value);
    if (TEMPORAL_AND_ENVIRONMENTAL.has(key)) {
      errors.push(`${key} is a temporal or environmental metric. Only base metrics are supported.`);
    } else if (!(key in BASE_METRICS)) {
      errors.push(`${key} is not a CVSS 3.1 base metric.`);
    } else {
      const allowed: readonly string[] = BASE_METRICS[key as MetricKey];
      if (!allowed.includes(value)) {
        errors.push(`${key}:${value} is not valid. ${key} must be one of ${allowed.join(', ')}.`);
      }
    }
  }
  const missing = METRIC_ORDER.filter((k) => !found.has(k));
  if (missing.length) errors.push(`Missing base metric(s): ${missing.join(', ')}.`);
  if (errors.length) return { ok: false, errors };
  return { ok: true, metrics: Object.fromEntries(found) as BaseMetrics };
}
