import type { BaseMetrics, Severity } from '../cvss/cvss31';
import { type CvssResult, cvssResult, type EnvMetrics } from '../cvss/environmental';
import { isEnabled } from '../flags';
import type { Category } from './categories';

export const SEVERITIES: readonly Severity[] = ['Critical', 'High', 'Medium', 'Low', 'None'];
export type FindingStatus = 'draft' | 'validated';
export const STATUSES: readonly FindingStatus[] = ['draft', 'validated'];

export interface Project {
  id: string;
  name: string;
  /**
   * Next number for findings without a category. Numbers are never reused, even after a delete.
   */
  nextFindingNumber: number;
  /** Next number per category code (NET → 3). A missing code starts at 1. */
  categoryCounters?: Record<string, number>;
  /** This project's own categories, after the built-in ones. */
  categories?: Category[];
  /** Next scenario number (SCN.NN). Missing on projects created before scenarios: starts at 1. */
  nextScenarioNumber?: number;
  createdAt: number;
}

export interface SeverityOverride {
  severity: Severity;
  /** Mandatory: why the severity differs from the CVSS score. */
  justification: string;
}

export interface Finding {
  id: string;
  projectId: string;
  /** Stable number within its category (or within findings without one): VLN.01, VLN.NET.01… */
  number: number;
  /** Category code (NET, PHY…), shown in the reference. None: VLN.NN. */
  category?: string;
  title: string;
  /** Affected assets (hosts, URLs, applications), one per entry. */
  assets: string[];
  /** Markdown-lite text. */
  description: string;
  impact: string;
  /** Ordered steps to reproduce, Markdown-lite each. */
  steps: string[];
  recommendation: string;
  /** URLs or citations, stored as text and never fetched. */
  references: string[];
  status: FindingStatus;
  cvss: BaseMetrics;
  /** Environmental metrics for this client's context. When any is set, its score is used. */
  cvssEnv?: EnvMetrics;
  severityOverride?: SeverityOverride;
  createdAt: number;
  updatedAt: number;
}

export const DEFAULT_CVSS: BaseMetrics = {
  AV: 'N',
  AC: 'L',
  PR: 'N',
  UI: 'N',
  S: 'U',
  C: 'N',
  I: 'N',
  A: 'N',
};

/** "VLN.01" … "VLN.99", then "VLN.100" (two digits minimum); "VLN.NET.01" with a category. */
export function findingRef(f: Pick<Finding, 'number' | 'category'>): string {
  const n = String(f.number).padStart(2, '0');
  return f.category ? `VLN.${f.category}.${n}` : `VLN.${n}`;
}

/** The project's next number for a category (undefined: no category). */
export function nextNumberFor(project: Project, category: string | undefined): number {
  return category ? (project.categoryCounters?.[category] ?? 1) : project.nextFindingNumber;
}

/** The project with that category's counter moved past `number`. */
export function withNumberTaken(
  project: Project,
  category: string | undefined,
  number: number,
): Project {
  if (!category) {
    return { ...project, nextFindingNumber: Math.max(project.nextFindingNumber, number + 1) };
  }
  const counters = { ...project.categoryCounters };
  counters[category] = Math.max(counters[category] ?? 1, number + 1);
  return { ...project, categoryCounters: counters };
}

export function newFinding(
  id: string,
  projectId: string,
  number: number,
  now: number,
  category?: string,
): Finding {
  return {
    id,
    projectId,
    number,
    ...(category ? { category } : {}),
    title: '',
    assets: [],
    description: '',
    impact: '',
    steps: [],
    recommendation: '',
    references: [],
    status: 'draft',
    cvss: { ...DEFAULT_CVSS },
    createdAt: now,
    updatedAt: now,
  };
}

/**
 * The finding's CVSS score: the base score, or the environmental score when any environmental
 * metric is set (and the cvssAdvanced feature is on).
 */
export function findingCvss(finding: Pick<Finding, 'cvss' | 'cvssEnv'>): CvssResult {
  return cvssResult(finding.cvss, isEnabled('cvssAdvanced') ? finding.cvssEnv : undefined);
}

export function cvssSeverity(finding: Pick<Finding, 'cvss' | 'cvssEnv'>): Severity {
  return findingCvss(finding).severity;
}

/** The severity shown on slides: the override when there is a valid one, else the CVSS rating. */
export function effectiveSeverity(
  finding: Pick<Finding, 'cvss' | 'cvssEnv' | 'severityOverride'>,
): Severity {
  const o = finding.severityOverride;
  return o && o.justification.trim() ? o.severity : cvssSeverity(finding);
}

/** Problems that block marking a finding as validated, phrased for the user. */
export function findingProblems(f: Finding): string[] {
  const problems: string[] = [];
  if (!f.title.trim()) problems.push('Add a title.');
  if (f.severityOverride && !f.severityOverride.justification.trim()) {
    problems.push('Explain why the severity differs from the CVSS score, or remove the override.');
  }
  return problems;
}

/** Copy of a finding with a new id and number (same category), back to draft. */
export function duplicateOf(f: Finding, id: string, number: number, now: number): Finding {
  return {
    ...structuredClone(f),
    id,
    number,
    title: f.title ? `${f.title} (copy)` : '',
    status: 'draft',
    createdAt: now,
    updatedAt: now,
  };
}

/** Filter value for findings without a category. */
export const NO_CATEGORY = '-';

export interface FindingFilter {
  severity?: Severity;
  /** A category code, or NO_CATEGORY. */
  category?: string;
  status?: FindingStatus;
  /** Case-insensitive match on reference, title and assets. */
  text?: string;
}

export function filterFindings(findings: Finding[], filter: FindingFilter): Finding[] {
  const text = filter.text?.trim().toLowerCase();
  return findings.filter(
    (f) =>
      (!filter.severity || effectiveSeverity(f) === filter.severity) &&
      (!filter.status || f.status === filter.status) &&
      (!filter.category || (f.category ?? NO_CATEGORY) === filter.category) &&
      (!text || [findingRef(f), f.title, ...f.assets].some((s) => s.toLowerCase().includes(text))),
  );
}

/**
 * Findings ordered for a report: by severity (Critical first), then CVSS score, then category
 * (none first), then number.
 */
export function sortForReport(findings: Finding[]): Finding[] {
  const rank = (f: Finding) => SEVERITIES.indexOf(effectiveSeverity(f));
  const cat = (f: Finding) => f.category ?? '';
  return [...findings].sort(
    (a, b) =>
      rank(a) - rank(b) ||
      findingCvss(b).score - findingCvss(a).score ||
      (cat(a) < cat(b) ? -1 : cat(a) > cat(b) ? 1 : 0) ||
      a.number - b.number,
  );
}
