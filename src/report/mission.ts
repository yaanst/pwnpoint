import type { Scenario } from '../scenarios/model';
import { type ScenarioSeverity, scenarioSeverity } from '../scenarios/rating';

/**
 * Mission details (the report's "assessment modalities") and executive summary of a project.
 * Pure module.
 */
export interface MissionDetails {
  client: string;
  product: string;
  /** First and last day of the assessment, YYYY-MM-DD, or empty. */
  from: string;
  to: string;
  /** Report version, e.g. "1.0". */
  version: string;
  leadAuditor: string;
  /** One per entry. */
  auditors: string[];
  /** e.g. Internal penetration test, Web application assessment. */
  auditType: string;
  scope: string;
  /** e.g. On-premises, Cloud, Hybrid. */
  infraType: string;
  /** Markdown-lite. */
  comments: string;
  /** Executive summary: what the client does well, one per entry. */
  strengths: string[];
  /** Executive summary: areas of improvement, one per entry. */
  weaknesses: string[];
  /** Completes "<product>'s security level is <level>, as <reason>." */
  securityLevelReason: string;
}

export const EMPTY_MISSION: MissionDetails = {
  client: '',
  product: '',
  from: '',
  to: '',
  version: '1.0',
  leadAuditor: '',
  auditors: [],
  auditType: '',
  scope: '',
  infraType: '',
  comments: '',
  strengths: [],
  weaknesses: [],
  securityLevelReason: '',
};

export const DATE = /^\d{4}-(0[1-9]|1[0-2])-(0[1-9]|[12]\d|3[01])$/;

export type SecurityLevel = 'Satisfactory' | 'Pass' | 'Improvements required' | 'Unsatisfactory';
export const SECURITY_LEVELS: readonly SecurityLevel[] = [
  'Satisfactory',
  'Pass',
  'Improvements required',
  'Unsatisfactory',
];
/** Global security status scale (appendix). */
export const SECURITY_LEVEL_RULES: Record<SecurityLevel, string> = {
  Satisfactory: 'No or only minor attack scenarios identified',
  Pass: 'At least 1 moderate attack scenario identified',
  'Improvements required': 'At least 1 major attack scenario identified',
  Unsatisfactory: 'At least 1 severe attack scenario identified',
};
const BY_WORST: Record<ScenarioSeverity, SecurityLevel> = {
  Minor: 'Satisfactory',
  Moderate: 'Pass',
  Major: 'Improvements required',
  Severe: 'Unsatisfactory',
};

export interface SecurityStatus {
  level: SecurityLevel;
  /** The scenarios with the worst severity, which set the level. */
  worst: Scenario[];
  /** Scenarios without a rating: they do not count until they are rated. */
  unrated: Scenario[];
}

/** The global security status: set by the worst rated attack scenario. */
export function securityStatus(scenarios: Scenario[]): SecurityStatus {
  const rated = scenarios.flatMap((s) =>
    s.exploitability && s.impact
      ? [{ s, severity: scenarioSeverity(s.exploitability, s.impact) }]
      : [],
  );
  const order: ScenarioSeverity[] = ['Minor', 'Moderate', 'Major', 'Severe'];
  const worst = rated.reduce<ScenarioSeverity>(
    (w, r) => (order.indexOf(r.severity) > order.indexOf(w) ? r.severity : w),
    'Minor',
  );
  return {
    level: BY_WORST[worst],
    worst: rated.filter((r) => r.severity === worst).map((r) => r.s),
    unrated: scenarios.filter((s) => !s.exploitability || !s.impact),
  };
}

/** "<product>'s security level is <level>, as <reason>." */
export function securitySentence(m: MissionDetails, level: SecurityLevel): string {
  const product = m.product.trim() || 'The assessed scope';
  const reason = m.securityLevelReason.trim().replace(/\.$/, '');
  const owner = product.endsWith('s') ? `${product}’` : `${product}’s`;
  return `${owner} security level is ${level}${reason ? `, as ${reason}` : ''}.`;
}

const MONTHS = {
  en: [
    'January',
    'February',
    'March',
    'April',
    'May',
    'June',
    'July',
    'August',
    'September',
    'October',
    'November',
    'December',
  ],
  fr: [
    'janvier',
    'février',
    'mars',
    'avril',
    'mai',
    'juin',
    'juillet',
    'août',
    'septembre',
    'octobre',
    'novembre',
    'décembre',
  ],
} as const;

/** "16 October 2026", "12–16 October 2026", "28 September – 2 October 2026"; empty if unset. */
export function formatDateRange(from: string, to: string, language: 'en' | 'fr' = 'en'): string {
  const parse = (d: string) => {
    if (!DATE.test(d)) return null;
    const [y, m, day] = d.split('-').map(Number) as [number, number, number];
    return { y, m, day };
  };
  const a = parse(from);
  const b = parse(to) ?? a;
  const start = a ?? b;
  if (!start || !b) return '';
  const month = (m: number) => MONTHS[language][m - 1] ?? '';
  const one = (d: { y: number; m: number; day: number }) => `${d.day} ${month(d.m)} ${d.y}`;
  if (start.y === b.y && start.m === b.m && start.day === b.day) return one(b);
  if (start.y === b.y && start.m === b.m) return `${start.day}–${b.day} ${month(b.m)} ${b.y}`;
  if (start.y === b.y) return `${start.day} ${month(start.m)} – ${one(b)}`;
  return `${one(start)} – ${one(b)}`;
}

/** What is missing before the report, phrased for the user. */
export function missionProblems(m: MissionDetails, status: SecurityStatus): string[] {
  const problems: string[] = [];
  if (!m.client.trim()) problems.push('Add the client.');
  if (!m.product.trim()) problems.push('Add the product or system assessed.');
  if (!m.from || !m.to) problems.push('Add the assessment dates.');
  else if (m.from > m.to) problems.push('The first day is after the last day.');
  if (!m.securityLevelReason.trim()) problems.push('Explain the security level.');
  if (status.unrated.length) {
    problems.push(
      `${status.unrated.length} scenario${status.unrated.length > 1 ? 's are' : ' is'} not rated and not counted in the security level.`,
    );
  }
  return problems;
}
