import { canBypass, isLinear, successors } from './graph';
import type { Severity } from '../cvss/cvss31';
import { effectiveSeverity, type Finding, findingRef } from '../findings/model';
import { type Recommendation, recommendationRef, sortForPlan } from '../recommendations/model';
import { LEGACY_LEVELS, isRating, type Rating } from './rating';

export interface ScenarioStep {
  /** Stable id, so reordering keeps each step's editor state. */
  id: string;
  kind: 'finding' | 'technique';
  /** For a finding step. The finding may since have been deleted (shown as missing). */
  findingId?: string;
  /** For a technique step: a short label, e.g. "Password spraying". */
  technique?: string;
  /** Optional MITRE ATT&CK technique id, e.g. T1558.003. */
  mitreId?: string;
  /** What the attacker has after this step, e.g. "Domain user credentials". */
  gains: string;
  /** Free note (Markdown-lite). Used in "Break the chain" when the step is a chain breaker. */
  note: string;
  /** Fixing this step breaks the whole chain. */
  chainBreaker: boolean;
  /**
   * Branching scenarios (scenarioBranches flag): ids of the later steps this one leads to. Absent
   * means the next step in the list. Empty means it leads straight to the goal.
   */
  next?: string[];
}

export interface Scenario {
  id: string;
  projectId: string;
  /** Stable per-project number, shown as SCN.01, SCN.02… */
  number: number;
  title: string;
  /** Where the attacker starts, e.g. "Unauthenticated, on the office Wi-Fi". */
  start: string;
  goal: string;
  /** Markdown-lite. Shown as the scenario's description. */
  context: string;
  /** 1 Rare … 5 Very likely. Unset until the auditor rates the scenario. */
  exploitability?: Rating;
  exploitabilityRationale: string;
  /** 1 Negligible … 5 Very significant. Unset until the auditor rates the scenario. */
  impact?: Rating;
  impactRationale: string;
  steps: ScenarioStep[];
  createdAt: number;
  updatedAt: number;
}

export function scenarioRef(number: number): string {
  return `SCN.${String(number).padStart(2, '0')}`;
}

export function newScenario(id: string, projectId: string, number: number, now: number): Scenario {
  return {
    id,
    projectId,
    number,
    title: '',
    start: '',
    goal: '',
    context: '',
    exploitabilityRationale: '',
    impactRationale: '',
    steps: [],
    createdAt: now,
    updatedAt: now,
  };
}

/**
 * A scenario as stored, brought up to date: scenarios saved before the 5-level scales had
 * impact and likelihood on 4 levels (Critical … Low), mapped to 5 … 2.
 */
export function upgradeScenario(raw: Scenario): Scenario {
  const old = raw as Scenario & { likelihood?: unknown; impact?: unknown };
  const { likelihood, ...rest } = old;
  const s: Scenario = {
    ...rest,
    exploitabilityRationale:
      typeof old.exploitabilityRationale === 'string' ? old.exploitabilityRationale : '',
    impactRationale: typeof old.impactRationale === 'string' ? old.impactRationale : '',
  };
  delete s.impact;
  delete s.exploitability;
  const impact = isRating(old.impact) ? old.impact : LEGACY_LEVELS[String(old.impact)];
  const exploit = isRating(old.exploitability)
    ? old.exploitability
    : LEGACY_LEVELS[String(likelihood)];
  if (impact) s.impact = impact;
  if (exploit) s.exploitability = exploit;
  return s;
}

export function findingStep(id: string, findingId: string): ScenarioStep {
  return { id, kind: 'finding', findingId, gains: '', note: '', chainBreaker: false };
}

export function techniqueStep(id: string): ScenarioStep {
  return { id, kind: 'technique', technique: '', gains: '', note: '', chainBreaker: false };
}

/** MITRE ATT&CK technique or sub-technique id (T1234 or T1234.001). Empty is allowed. */
export const MITRE_ID = /^T\d{4}(\.\d{3})?$/;
export const validMitreId = (id: string | undefined) => !id || MITRE_ID.test(id.trim());

/** What a step shows, resolved against the project's findings. */
export interface StepView {
  /** "VLN.03" for a finding, the MITRE id or empty for a technique. */
  tag: string;
  title: string;
  severity?: Severity;
  /** The step points at a finding that no longer exists. */
  missing: boolean;
  /**
   * For a finding: its linked recommendations, "REC.ACC.01 Title; …" (used for "Break the chain"
   * when the note is empty).
   */
  recommendation: string;
}

export function stepView(
  step: ScenarioStep,
  findings: Map<string, Finding>,
  recs: Recommendation[] = [],
): StepView {
  if (step.kind === 'technique') {
    return {
      tag: step.mitreId?.trim() ?? '',
      title: step.technique?.trim() ?? '',
      missing: false,
      recommendation: '',
    };
  }
  const f = step.findingId ? findings.get(step.findingId) : undefined;
  if (!f) return { tag: '', title: '', missing: true, recommendation: '' };
  return {
    tag: findingRef(f),
    title: f.title.trim(),
    severity: effectiveSeverity(f),
    missing: false,
    recommendation: sortForPlan(recs.filter((r) => r.findingIds.includes(f.id)))
      .map((r) => [recommendationRef(r), r.title.trim()].filter(Boolean).join(' '))
      .join('; '),
  };
}

/** Problems shown in the editor; none of them blocks saving. */
export function scenarioProblems(s: Scenario, findings: Map<string, Finding>): string[] {
  const problems: string[] = [];
  const succ = successors(s.steps);
  const branching = !isLinear(succ);
  s.steps.forEach((step, i) => {
    const v = stepView(step, findings);
    if (v.missing)
      problems.push(`Step ${i + 1} points to a deleted finding. Replace or remove it.`);
    if (step.kind === 'technique' && !v.title)
      problems.push(`Step ${i + 1} has no technique name.`);
    if (step.chainBreaker && branching && canBypass(succ, i)) {
      problems.push(
        `Step ${i + 1} is marked as a chain breaker, but another path reaches the goal without it.`,
      );
    }
    if (!validMitreId(step.mitreId)) {
      problems.push(`Step ${i + 1}: “${step.mitreId}” is not a MITRE ATT&CK id (e.g. T1110.003).`);
    }
  });
  return problems;
}

/** Scenarios that use a finding, for the finding editor's "Used in scenarios" list. */
export const scenariosUsing = (scenarios: Scenario[], findingId: string) =>
  scenarios.filter((s) =>
    s.steps.some((st) => st.kind === 'finding' && st.findingId === findingId),
  );

/** Moves an item; used by drag-and-drop and the keyboard shortcuts. */
export function moveStep<T>(items: T[], from: number, to: number): T[] {
  if (from === to || from < 0 || from >= items.length) return items;
  const next = [...items];
  const [item] = next.splice(from, 1);
  if (item !== undefined) next.splice(Math.max(0, Math.min(to, next.length)), 0, item);
  return next;
}

/** Case-insensitive search on reference and title, for the step picker. */
export function searchFindings(findings: Finding[], query: string): Finding[] {
  const q = query.trim().toLowerCase();
  if (!q) return findings;
  return findings.filter((f) => `${findingRef(f)} ${f.title}`.toLowerCase().includes(q));
}
