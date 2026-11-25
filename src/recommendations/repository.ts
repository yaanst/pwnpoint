import type { Project } from '../findings/model';
import type { Vault } from '../storage/vault';
import {
  newRecommendation,
  nextRecommendationNumber,
  type Recommendation,
  withRecommendationNumberTaken,
} from './model';

/** Recommendations on top of the encrypted vault: content sealed, ids and dates in clear. */

const newId = () => globalThis.crypto.randomUUID();

async function takeNumber(
  vault: Vault,
  projectId: string,
  category: string | undefined,
): Promise<number> {
  const project = await vault.get<Project>('projects', projectId);
  if (!project) throw new Error('This project no longer exists.');
  const number = nextRecommendationNumber(project, category);
  await vault.put(
    'projects',
    { id: projectId },
    withRecommendationNumberTaken(project, category, number),
  );
  return number;
}

export async function createRecommendation(
  vault: Vault,
  projectId: string,
  options: { category?: string; findingIds?: string[]; now?: number } = {},
): Promise<Recommendation> {
  const now = options.now ?? Date.now();
  const number = await takeNumber(vault, projectId, options.category);
  const r = {
    ...newRecommendation(newId(), projectId, number, now, options.category),
    findingIds: options.findingIds ?? [],
  };
  return saveRecommendation(vault, r, now);
}

export async function saveRecommendation(
  vault: Vault,
  r: Recommendation,
  now = Date.now(),
): Promise<Recommendation> {
  const saved = { ...r, updatedAt: now };
  await vault.put(
    'recommendations',
    { id: saved.id, projectId: saved.projectId, updatedAt: now },
    saved,
  );
  return saved;
}

export function getRecommendation(vault: Vault, id: string): Promise<Recommendation | undefined> {
  return vault.get<Recommendation>('recommendations', id);
}

export async function listRecommendations(
  vault: Vault,
  projectId: string,
): Promise<Recommendation[]> {
  return (await vault.list<Recommendation>('recommendations', projectId)).map((r) => r.value);
}

/** Deletes a recommendation. Its number is not reused. */
export function deleteRecommendation(vault: Vault, id: string): Promise<void> {
  return vault.delete('recommendations', id);
}

/**
 * The category and number a recommendation gets when moved to `category`: the next number of
 * that category, or its original number when moved back to its original category.
 */
export async function recategorizeRecommendation(
  vault: Vault,
  r: Pick<Recommendation, 'projectId'>,
  category: string | undefined,
  original: Pick<Recommendation, 'number' | 'category'>,
): Promise<{ number: number; category?: string }> {
  const number =
    category === original.category
      ? original.number
      : await takeNumber(vault, r.projectId, category);
  return category ? { number, category } : { number };
}

/** Links or unlinks a finding, saving the recommendation. */
export async function setLinked(
  vault: Vault,
  r: Recommendation,
  findingId: string,
  linked: boolean,
): Promise<Recommendation> {
  const ids = r.findingIds.filter((id) => id !== findingId);
  return saveRecommendation(vault, { ...r, findingIds: linked ? [...ids, findingId] : ids });
}

/** Removes a deleted finding from every recommendation that addressed it. */
export async function unlinkFinding(
  vault: Vault,
  projectId: string,
  findingId: string,
): Promise<void> {
  for (const r of await listRecommendations(vault, projectId)) {
    if (r.findingIds.includes(findingId)) await setLinked(vault, r, findingId, false);
  }
}
