import type { BaseMetrics, Severity } from '../cvss/cvss31';
import type { EnvMetrics } from '../cvss/environmental';
import { isEnabled } from '../flags';
import type { Finding } from '../findings/model';
import { successors } from './graph';
import type { ScenarioStep } from './model';

/**
 * Attack scenario rating: exploitability and impact on 5 levels, and the severity read from
 * the exploitability × impact matrix. Pure module.
 */

/** 1 (lowest) to 5 (highest). */
export type Rating = 1 | 2 | 3 | 4 | 5;
export const RATINGS: readonly Rating[] = [1, 2, 3, 4, 5];
export const isRating = (v: unknown): v is Rating =>
  typeof v === 'number' && (RATINGS as readonly number[]).includes(v);

export type ScenarioSeverity = 'Minor' | 'Moderate' | 'Major' | 'Severe';
export const SCENARIO_SEVERITIES: readonly ScenarioSeverity[] = [
  'Minor',
  'Moderate',
  'Major',
  'Severe',
];

/** MATRIX[exploitability - 1][impact - 1]. */
const MATRIX: readonly (readonly ScenarioSeverity[])[] = [
  ['Minor', 'Minor', 'Moderate', 'Moderate', 'Major'], // Rare
  ['Minor', 'Minor', 'Moderate', 'Moderate', 'Major'], // Unlikely
  ['Minor', 'Moderate', 'Moderate', 'Major', 'Severe'], // Possible
  ['Moderate', 'Moderate', 'Major', 'Severe', 'Severe'], // Likely
  ['Moderate', 'Major', 'Major', 'Severe', 'Severe'], // Very likely
];

export function scenarioSeverity(exploitability: Rating, impact: Rating): ScenarioSeverity {
  return MATRIX[exploitability - 1]?.[impact - 1] ?? 'Minor';
}

/** The finding severity whose theme colours a scenario severity uses. */
export const SEVERITY_COLOURS: Record<ScenarioSeverity, Severity> = {
  Minor: 'Low',
  Moderate: 'Medium',
  Major: 'High',
  Severe: 'Critical',
};

/** Ratings of scenarios saved before version 0.4 (4 levels, impact and likelihood). */
export const LEGACY_LEVELS: Record<string, Rating> = { Critical: 5, High: 4, Medium: 3, Low: 2 };

const W = {
  AV: { N: 0.85, A: 0.62, L: 0.55, P: 0.2 },
  AC: { L: 0.77, H: 0.44 },
  PR_U: { N: 0.85, L: 0.62, H: 0.27 },
  PR_C: { N: 0.85, L: 0.68, H: 0.5 },
  UI: { N: 0.85, R: 0.62 },
  CIA: { H: 0.56, L: 0.22, N: 0 },
} as const;

/** The metrics that apply: modified (environmental) ones when set, else the base ones. */
function effective(base: BaseMetrics, env: EnvMetrics | undefined): BaseMetrics {
  const e = isEnabled('cvssAdvanced') ? (env ?? {}) : {};
  return {
    AV: e.MAV ?? base.AV,
    AC: e.MAC ?? base.AC,
    PR: e.MPR ?? base.PR,
    UI: e.MUI ?? base.UI,
    S: e.MS ?? base.S,
    C: e.MC ?? base.C,
    I: e.MI ?? base.I,
    A: e.MA ?? base.A,
  };
}

/**
 * A finding's exploitability, from the CVSS exploitability sub-score (0.1 to 3.9):
 * 3.5 and up Very likely (e.g. network, no privilege), 2.5 Likely, 1.5 Possible, 0.7 Unlikely,
 * below that Rare (e.g. physical access and user interaction).
 */
export function findingExploitability(f: Pick<Finding, 'cvss' | 'cvssEnv'>): Rating {
  const m = effective(f.cvss, f.cvssEnv);
  const pr = m.S === 'C' ? W.PR_C[m.PR] : W.PR_U[m.PR];
  const score = 8.22 * W.AV[m.AV] * W.AC[m.AC] * pr * W.UI[m.UI];
  return score >= 3.5 ? 5 : score >= 2.5 ? 4 : score >= 1.5 ? 3 : score >= 0.7 ? 2 : 1;
}

/**
 * A finding's impact, from the CVSS impact sub-score (0 to 6.1): 0 Negligible, below 2 Low
 * (e.g. one low impact), below 4 Medium (e.g. one high impact), below 5.5 Significant, above
 * that Very significant (e.g. high on confidentiality, integrity and availability).
 */
export function findingImpact(f: Pick<Finding, 'cvss' | 'cvssEnv'>): Rating {
  const m = effective(f.cvss, f.cvssEnv);
  const iss = 1 - (1 - W.CIA[m.C]) * (1 - W.CIA[m.I]) * (1 - W.CIA[m.A]);
  const score = m.S === 'C' ? 7.52 * (iss - 0.029) - 3.25 * Math.pow(iss - 0.02, 15) : 6.42 * iss;
  if (iss === 0 || score <= 0) return 1;
  return score >= 5.5 ? 5 : score >= 4 ? 4 : score >= 2 ? 3 : 2;
}

export interface RatingSuggestion {
  exploitability: Rating;
  impact: Rating;
}

/**
 * The rating suggested from a scenario's findings. Along a path, the hardest step limits
 * exploitability (minimum); with alternative paths, the attacker takes the easiest one
 * (maximum over paths). Impact is the highest impact of any finding. Techniques and missing
 * findings do not count. Undefined when the scenario has no finding.
 */
export function suggestRating(
  steps: ScenarioStep[],
  findings: Map<string, Finding>,
): RatingSuggestion | undefined {
  const own = steps.map((s) =>
    s.kind === 'finding' && s.findingId ? findings.get(s.findingId) : undefined,
  );
  if (!own.some(Boolean)) return undefined;
  const succ = successors(steps);
  const NONE = Infinity; // a step that does not limit the path
  const best: number[] = steps.map(() => NONE);
  for (let i = steps.length - 1; i >= 0; i--) {
    const f = own[i];
    const here = f ? findingExploitability(f) : NONE;
    const next = succ[i] ?? [];
    const after = next.length ? Math.max(...next.map((j) => best[j] ?? NONE)) : NONE;
    best[i] = Math.min(here, after);
  }
  const hasParent = new Set(succ.flat());
  const starts = steps.map((_, i) => i).filter((i) => !hasParent.has(i));
  const exploit = Math.max(...starts.map((i) => best[i] ?? NONE));
  const impact = Math.max(...own.map((f) => (f ? findingImpact(f) : 1)));
  return {
    // A path made of techniques only is not limited by any finding: as easy as it gets.
    exploitability: (exploit === NONE ? 5 : exploit) as Rating,
    impact: impact as Rating,
  };
}
