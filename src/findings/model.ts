import { type BaseMetrics, calculateBaseScore, type Severity, severityOf } from '../cvss/cvss31';

export const SEVERITIES: readonly Severity[] = ['Critical', 'High', 'Medium', 'Low', 'None'];
export type FindingStatus = 'draft' | 'validated';
export const STATUSES: readonly FindingStatus[] = ['draft', 'validated'];

export interface Project {
  id: string;
  name: string;
  /** Next finding number to hand out. Numbers are never reused, even after a delete. */
  nextFindingNumber: number;
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
  /** Stable per-project number, shown as VLN.01, VLN.02… */
  number: number;
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

/** "VLN.01" … "VLN.99", then "VLN.100": two digits minimum. */
export function findingRef(number: number): string {
  return `VLN.${String(number).padStart(2, '0')}`;
}

export function newFinding(id: string, projectId: string, number: number, now: number): Finding {
  return {
    id,
    projectId,
    number,
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

export function cvssSeverity(finding: Pick<Finding, 'cvss'>): Severity {
  return severityOf(calculateBaseScore(finding.cvss).score);
}

/** The severity shown on slides: the override when there is a valid one, else the CVSS rating. */
export function effectiveSeverity(finding: Pick<Finding, 'cvss' | 'severityOverride'>): Severity {
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

/** Copy of a finding with a new id and number, back to draft. */
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

export interface FindingFilter {
  severity?: Severity;
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
      (!text ||
        [findingRef(f.number), f.title, ...f.assets].some((s) => s.toLowerCase().includes(text))),
  );
}

/** Findings ordered for a report: by severity (Critical first), then CVSS score, then number. */
export function sortForReport(findings: Finding[]): Finding[] {
  const rank = (f: Finding) => SEVERITIES.indexOf(effectiveSeverity(f));
  return [...findings].sort(
    (a, b) =>
      rank(a) - rank(b) ||
      calculateBaseScore(b.cvss).score - calculateBaseScore(a.cvss).score ||
      a.number - b.number,
  );
}
