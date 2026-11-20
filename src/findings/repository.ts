import { copyEvidence, deleteEvidenceOf } from '../evidence/repository';
import type { Vault } from '../storage/vault';
import { duplicateOf, type Finding, newFinding, type Project } from './model';

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

/** Hands out the project's next finding number and saves the incremented counter. */
async function takeNumber(vault: Vault, projectId: string): Promise<number> {
  const project = await vault.get<Project>('projects', projectId);
  if (!project) throw new Error('This project no longer exists.');
  await vault.put(
    'projects',
    { id: projectId },
    {
      ...project,
      nextFindingNumber: project.nextFindingNumber + 1,
    },
  );
  return project.nextFindingNumber;
}

export async function createFinding(
  vault: Vault,
  projectId: string,
  now = Date.now(),
): Promise<Finding> {
  const finding = newFinding(newId(), projectId, await takeNumber(vault, projectId), now);
  await saveFinding(vault, finding, now);
  return finding;
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
  const copy = duplicateOf(finding, newId(), await takeNumber(vault, finding.projectId), now);
  const saved = await saveFinding(vault, copy, now);
  await copyEvidence(vault, finding.id, saved);
  return saved;
}

/** Deletes a finding and its evidence. Its number is not reused. Scenario links come later. */
export async function deleteFinding(vault: Vault, id: string): Promise<void> {
  await deleteEvidenceOf(vault, id);
  await vault.delete('findings', id);
}
