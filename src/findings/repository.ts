import { copyEvidence, deleteEvidenceOf } from '../evidence/repository';
import type { Vault } from '../storage/vault';
import { type Category, categoryProblem } from './categories';
import {
  duplicateOf,
  type Finding,
  newFinding,
  nextNumberFor,
  type Project,
  withNumberTaken,
} from './model';

/**
 * Projects and findings on top of the encrypted vault. All content (names, titles, text) is
 * sealed; only ids, projectId and timestamps are stored in clear.
 */

const newId = () => globalThis.crypto.randomUUID();

export async function createProject(
  vault: Vault,
  name: string,
  now = Date.now(),
): Promise<Project> {
  const project: Project = { id: newId(), name: name.trim(), nextFindingNumber: 1, createdAt: now };
  await vault.put('projects', { id: project.id, updatedAt: now }, project);
  return project;
}

export async function listProjects(vault: Vault): Promise<Project[]> {
  return (await vault.list<Project>('projects')).map((r) => r.value);
}

export async function renameProject(
  vault: Vault,
  project: Project,
  name: string,
): Promise<Project> {
  // Re-read: the caller's copy may hold stale counters (findings or scenarios created since).
  const current = (await vault.get<Project>('projects', project.id)) ?? project;
  const renamed = { ...current, name: name.trim() };
  await vault.put('projects', { id: project.id }, renamed);
  return renamed;
}

async function getProject(vault: Vault, projectId: string): Promise<Project> {
  const project = await vault.get<Project>('projects', projectId);
  if (!project) throw new Error('This project no longer exists.');
  return project;
}

/** Hands out the next number of a category (or of findings without one) and saves the counter. */
async function takeNumber(
  vault: Vault,
  projectId: string,
  category: string | undefined,
): Promise<number> {
  const project = await getProject(vault, projectId);
  const number = nextNumberFor(project, category);
  await vault.put('projects', { id: projectId }, withNumberTaken(project, category, number));
  return number;
}

export async function createFinding(
  vault: Vault,
  projectId: string,
  now = Date.now(),
  category?: string,
): Promise<Finding> {
  const number = await takeNumber(vault, projectId, category);
  const finding = newFinding(newId(), projectId, number, now, category);
  await saveFinding(vault, finding, now);
  return finding;
}

/**
 * The category and number a finding gets when moved to `category`: the next number of that
 * category. Moving back to `original` (what it had when the editor opened) gives its old number
 * back, since nothing else can have taken it. The caller saves the finding.
 */
export async function recategorize(
  vault: Vault,
  finding: Pick<Finding, 'projectId'>,
  category: string | undefined,
  original: Pick<Finding, 'number' | 'category'>,
): Promise<{ number: number; category?: string }> {
  const number =
    category === original.category
      ? original.number
      : await takeNumber(vault, finding.projectId, category);
  return category ? { number, category } : { number };
}

/** Adds one of the project's own categories. Throws with a message for the user. */
export async function addCategory(
  vault: Vault,
  projectId: string,
  category: Category,
): Promise<Project> {
  const project = await getProject(vault, projectId);
  const code = category.code.trim().toUpperCase();
  const problem = categoryProblem(code, category.name, project.categories);
  if (problem) throw new Error(problem);
  const next = {
    ...project,
    categories: [...(project.categories ?? []), { code, name: category.name.trim() }],
  };
  await vault.put('projects', { id: projectId }, next);
  return next;
}

/**
 * Removes one of the project's own categories, if no finding uses it. Its counter is kept, so
 * adding the code again later never hands out a number already used.
 */
export async function removeCategory(
  vault: Vault,
  projectId: string,
  code: string,
): Promise<Project> {
  const project = await getProject(vault, projectId);
  const used = (await listFindings(vault, projectId)).some((f) => f.category === code);
  if (used) throw new Error(`Findings use ${code}: move them to another category first.`);
  const next = {
    ...project,
    categories: (project.categories ?? []).filter((c) => c.code !== code),
  };
  await vault.put('projects', { id: projectId }, next);
  return next;
}

export async function saveFinding(
  vault: Vault,
  finding: Finding,
  now = Date.now(),
): Promise<Finding> {
  const saved = { ...finding, updatedAt: now };
  await vault.put('findings', { id: saved.id, projectId: saved.projectId, updatedAt: now }, saved);
  return saved;
}

export function getFinding(vault: Vault, id: string): Promise<Finding | undefined> {
  return vault.get<Finding>('findings', id);
}

export async function listFindings(vault: Vault, projectId?: string): Promise<Finding[]> {
  return (await vault.list<Finding>('findings', projectId)).map((r) => r.value);
}

export async function duplicateFinding(
  vault: Vault,
  finding: Finding,
  now = Date.now(),
): Promise<Finding> {
  const number = await takeNumber(vault, finding.projectId, finding.category);
  const copy = duplicateOf(finding, newId(), number, now);
  const saved = await saveFinding(vault, copy, now);
  await copyEvidence(vault, finding.id, saved);
  return saved;
}

/** Deletes a finding and its evidence. Its number is not reused. Scenario links come later. */
export async function deleteFinding(vault: Vault, id: string): Promise<void> {
  await deleteEvidenceOf(vault, id);
  await vault.delete('findings', id);
}
