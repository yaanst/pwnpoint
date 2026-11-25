import type { Project } from '../findings/model';
import { allCategories } from '../findings/categories';

/**
 * Recommendations: remediation actions, numbered per category (REC.ACC.01), linked to the
 * findings they address, and classified into an action-plan quadrant. Pure module.
 */

/** 1 (lowest) to 3 (highest), for complexity, workload, cost and priority. */
export type Scale3 = 1 | 2 | 3;
export const SCALE3: readonly Scale3[] = [1, 2, 3];
export const isScale3 = (v: unknown): v is Scale3 => v === 1 || v === 2 || v === 3;

export const CRITERIA = ['complexity', 'workload', 'cost', 'priority'] as const;
export type Criterion = (typeof CRITERIA)[number];

/** What each level of a criterion means (appendix "Recommendation scales"). */
export const CRITERION_INFO: Record<Criterion, { name: string; levels: Record<Scale3, string> }> = {
  complexity: {
    name: 'Complexity',
    levels: { 1: 'Trivial action', 2: 'Few changes', 3: 'Heavy project' },
  },
  workload: {
    name: 'Workload',
    levels: { 1: '0–10 person-days', 2: '10–20 person-days', 3: 'More than 20 person-days' },
  },
  cost: { name: 'Cost', levels: { 1: 'Low', 2: 'Medium', 3: 'High' } },
  priority: {
    name: 'Priority',
    levels: { 1: 'Can be rescheduled', 2: 'Side action', 3: 'Top priority' },
  },
};

export interface Recommendation {
  id: string;
  projectId: string;
  /** Number within its category (or within recommendations without one). Never reused. */
  number: number;
  /** Recommendation category code (ACC, HAR…). None: REC.NN. */
  category?: string;
  title: string;
  /** Markdown-lite. */
  description: string;
  complexity?: Scale3;
  workload?: Scale3;
  cost?: Scale3;
  priority?: Scale3;
  /** Findings this recommendation addresses (same project). */
  findingIds: string[];
  createdAt: number;
  updatedAt: number;
}

export function newRecommendation(
  id: string,
  projectId: string,
  number: number,
  now: number,
  category?: string,
): Recommendation {
  return {
    id,
    projectId,
    number,
    ...(category ? { category } : {}),
    title: '',
    description: '',
    findingIds: [],
    createdAt: now,
    updatedAt: now,
  };
}

/** "REC.01", "REC.ACC.01". */
export function recommendationRef(r: Pick<Recommendation, 'number' | 'category'>): string {
  const n = String(r.number).padStart(2, '0');
  return r.category ? `REC.${r.category}.${n}` : `REC.${n}`;
}

export type Quadrant = 'quick-win' | 'heavy-project' | 'side-action' | 'can-be-delayed';
export const QUADRANTS: readonly Quadrant[] = [
  'quick-win',
  'heavy-project',
  'side-action',
  'can-be-delayed',
];
export const QUADRANT_NAMES: Record<Quadrant, string> = {
  'quick-win': 'Quick win',
  'heavy-project': 'Heavy project',
  'side-action': 'Side action',
  'can-be-delayed': 'Can be delayed',
};

/**
 * Action-plan quadrant: effort is complexity + workload + cost (3 to 9), small below 6;
 * priority 3 is a top priority. Undefined until all four criteria are set.
 */
export function quadrantOf(
  r: Pick<Recommendation, 'complexity' | 'workload' | 'cost' | 'priority'>,
): Quadrant | undefined {
  if (!r.complexity || !r.workload || !r.cost || !r.priority) return undefined;
  const small = r.complexity + r.workload + r.cost < 6;
  const top = r.priority === 3;
  if (small) return top ? 'quick-win' : 'side-action';
  return top ? 'heavy-project' : 'can-be-delayed';
}

/** Action plan order: priority (highest first, unset last), then category, then number. */
export function sortForPlan(list: Recommendation[]): Recommendation[] {
  const cat = (r: Recommendation) => r.category ?? '';
  return [...list].sort(
    (a, b) =>
      (b.priority ?? 0) - (a.priority ?? 0) ||
      (cat(a) < cat(b) ? -1 : cat(a) > cat(b) ? 1 : 0) ||
      a.number - b.number,
  );
}

/** Problems shown in the editor; none of them blocks saving. */
export function recommendationProblems(r: Recommendation): string[] {
  const problems: string[] = [];
  if (!r.title.trim()) problems.push('Add a title.');
  if (r.findingIds.length === 0) problems.push('Link at least one finding it addresses.');
  if (!quadrantOf(r)) {
    problems.push('Rate complexity, workload, cost and priority to place it in the action plan.');
  }
  return problems;
}

/** The project's next recommendation number for a category (undefined: no category). */
export function nextRecommendationNumber(
  project: Pick<Project, 'nextRecommendationNumber' | 'recommendationCounters'>,
  category: string | undefined,
): number {
  return category
    ? (project.recommendationCounters?.[category] ?? 1)
    : (project.nextRecommendationNumber ?? 1);
}

/** The project with that recommendation counter moved past `number`. */
export function withRecommendationNumberTaken(
  project: Project,
  category: string | undefined,
  number: number,
): Project {
  if (!category) {
    const next = Math.max(project.nextRecommendationNumber ?? 1, number + 1);
    return { ...project, nextRecommendationNumber: next };
  }
  const counters = { ...project.recommendationCounters };
  counters[category] = Math.max(counters[category] ?? 1, number + 1);
  return { ...project, recommendationCounters: counters };
}

/** A recommendation as a row of a finding's slide table. */
export interface RecommendationRow {
  ref: string;
  /** Category name, or "—". */
  category: string;
  title: string;
  /** Markdown-lite. */
  description: string;
}

/** The recommendations linked to a finding, highest priority first, ready for a slide table. */
export function recommendationRows(
  findingId: string,
  recs: Recommendation[],
  project: Pick<Project, 'recommendationCategories'> | undefined,
): RecommendationRow[] {
  const cats = allCategories(project?.recommendationCategories, 'recommendation');
  return sortForPlan(recs.filter((r) => r.findingIds.includes(findingId))).map((r) => ({
    ref: recommendationRef(r),
    category: cats.find((c) => c.code === r.category)?.name ?? '—',
    title: r.title.trim(),
    description: r.description,
  }));
}
