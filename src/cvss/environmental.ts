/**
 * CVSS v3.1 environmental metrics and score. FIRST CVSS v3.1 Specification, section 4
 * (metrics), section 6 (vector string), section 7.3 (equations) and Table 16 (weights).
 * https://www.first.org/cvss/v3.1/specification-document
 *
 * Temporal metrics (E, RL, RC) are not supported: they count as Not Defined (weight 1).
 * Pure module: no DOM, no I/O.
 */
import {
  BASE_METRICS,
  type BaseMetrics,
  calculateBaseScore,
  METRIC_ORDER,
  type MetricKey,
  roundUp,
  type Severity,
  severityOf,
  toVector,
  VECTOR_PREFIX,
} from './cvss31';

/** Environmental metrics, in vector-string order (Table 15). Not Defined (X) is never stored. */
export const ENV_METRICS = {
  CR: ['H', 'M', 'L'],
  IR: ['H', 'M', 'L'],
  AR: ['H', 'M', 'L'],
  MAV: ['N', 'A', 'L', 'P'],
  MAC: ['L', 'H'],
  MPR: ['N', 'L', 'H'],
  MUI: ['N', 'R'],
  MS: ['U', 'C'],
  MC: ['H', 'L', 'N'],
  MI: ['H', 'L', 'N'],
  MA: ['H', 'L', 'N'],
} as const;

export type EnvKey = keyof typeof ENV_METRICS;
/** Only defined metrics are present: a missing key means Not Defined (X). */
export type EnvMetrics = { [K in EnvKey]?: (typeof ENV_METRICS)[K][number] };

export const ENV_ORDER = Object.keys(ENV_METRICS) as EnvKey[];
const TEMPORAL = new Set(['E', 'RL', 'RC']);

/** The base metric each modified metric overrides. */
export const MODIFIES: Partial<Record<EnvKey, MetricKey>> = {
  MAV: 'AV',
  MAC: 'AC',
  MPR: 'PR',
  MUI: 'UI',
  MS: 'S',
  MC: 'C',
  MI: 'I',
  MA: 'A',
};

const W = {
  AV: { N: 0.85, A: 0.62, L: 0.55, P: 0.2 },
  AC: { L: 0.77, H: 0.44 },
  PR_U: { N: 0.85, L: 0.62, H: 0.27 },
  PR_C: { N: 0.85, L: 0.68, H: 0.5 },
  UI: { N: 0.85, R: 0.62 },
  CIA: { H: 0.56, L: 0.22, N: 0 },
  REQ: { H: 1.5, M: 1, L: 0.5 },
} as const;

/** True when at least one environmental metric is defined: the environmental score then applies. */
export const hasEnvironmental = (env: EnvMetrics | undefined): env is EnvMetrics =>
  !!env && ENV_ORDER.some((k) => env[k] !== undefined);

/** Environmental score (section 7.3), with temporal metrics Not Defined. */
export function calculateEnvironmentalScore(base: BaseMetrics, env: EnvMetrics): number {
  const av = env.MAV ?? base.AV;
  const ac = env.MAC ?? base.AC;
  const pr = env.MPR ?? base.PR;
  const ui = env.MUI ?? base.UI;
  const changed = (env.MS ?? base.S) === 'C';
  const c = env.MC ?? base.C;
  const i = env.MI ?? base.I;
  const a = env.MA ?? base.A;
  const req = (r: 'H' | 'M' | 'L' | undefined) => (r ? W.REQ[r] : 1);

  const miss = Math.min(
    1 - (1 - req(env.CR) * W.CIA[c]) * (1 - req(env.IR) * W.CIA[i]) * (1 - req(env.AR) * W.CIA[a]),
    0.915,
  );
  const impact = changed
    ? 7.52 * (miss - 0.029) - 3.25 * Math.pow(miss * 0.9731 - 0.02, 13)
    : 6.42 * miss;
  const exploitability =
    8.22 * W.AV[av] * W.AC[ac] * (changed ? W.PR_C[pr] : W.PR_U[pr]) * W.UI[ui];
  if (impact <= 0) return 0;
  const sum = changed ? 1.08 * (impact + exploitability) : impact + exploitability;
  // The spec then multiplies by ExploitCodeMaturity × RemediationLevel × ReportConfidence and
  // rounds up again; with temporal metrics Not Defined (1) that changes nothing.
  return roundUp(Math.min(sum, 10));
}

export interface CvssResult {
  score: number;
  severity: Severity;
  /** Which score this is: the base one, or the environmental one when any metric is set. */
  kind: 'base' | 'environmental';
  baseScore: number;
  vector: string;
}

/** The score to use: environmental when any environmental metric is defined, else base. */
export function cvssResult(base: BaseMetrics, env?: EnvMetrics): CvssResult {
  const baseScore = calculateBaseScore(base).score;
  if (!hasEnvironmental(env)) {
    return {
      score: baseScore,
      severity: severityOf(baseScore),
      kind: 'base',
      baseScore,
      vector: toVector(base),
    };
  }
  const score = calculateEnvironmentalScore(base, env);
  return {
    score,
    severity: severityOf(score),
    kind: 'environmental',
    baseScore,
    vector: toFullVector(base, env),
  };
}

/** Vector string with the defined environmental metrics after the base ones. */
export function toFullVector(base: BaseMetrics, env: EnvMetrics | undefined): string {
  const extra = ENV_ORDER.filter((k) => env?.[k] !== undefined).map((k) => `/${k}:${env?.[k]}`);
  return toVector(base) + extra.join('');
}

export type FullParseResult =
  { ok: true; metrics: BaseMetrics; env: EnvMetrics } | { ok: false; errors: string[] };

/**
 * Parses a CVSS v3.1 vector with optional environmental metrics, in any order (section 6).
 * X (Not Defined) is accepted and dropped. Temporal metrics are refused.
 */
export function parseFullVector(input: string): FullParseResult {
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
  const env: Record<string, string> = {};
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
    if (TEMPORAL.has(key)) {
      errors.push(`${key} is a temporal metric. Temporal metrics are not supported: remove it.`);
    } else if (key in BASE_METRICS) {
      const allowed: readonly string[] = BASE_METRICS[key as MetricKey];
      if (!allowed.includes(value)) {
        errors.push(`${key}:${value} is not valid. ${key} must be one of ${allowed.join(', ')}.`);
      }
    } else if (key in ENV_METRICS) {
      const allowed: readonly string[] = ENV_METRICS[key as EnvKey];
      if (value === 'X') continue;
      if (!allowed.includes(value)) {
        errors.push(
          `${key}:${value} is not valid. ${key} must be one of X, ${allowed.join(', ')}.`,
        );
      } else env[key] = value;
    } else {
      errors.push(`${key} is not a CVSS 3.1 metric.`);
    }
  }
  const missing = METRIC_ORDER.filter((k) => !found.has(k));
  if (missing.length) errors.push(`Missing base metric(s): ${missing.join(', ')}.`);
  if (errors.length) return { ok: false, errors };
  const metrics = Object.fromEntries(METRIC_ORDER.map((k) => [k, found.get(k)])) as BaseMetrics;
  return { ok: true, metrics, env: env as EnvMetrics };
}
