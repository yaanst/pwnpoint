import type { Project } from '../findings/model';
import type { Vault } from '../storage/vault';
import { newScenario, type Scenario, upgradeScenario } from './model';

const newId = () => globalThis.crypto.randomUUID();
export const newStepId = newId;

/** Hands out the project's next scenario number. Numbers are never reused. */
async function takeNumber(vault: Vault, projectId: string): Promise<number> {
  const project = await vault.get<Project>('projects', projectId);
  if (!project) throw new Error('This project no longer exists.');
  const number = project.nextScenarioNumber ?? 1;
  await vault.put('projects', { id: projectId }, { ...project, nextScenarioNumber: number + 1 });
  return number;
}

export async function createScenario(
  vault: Vault,
  projectId: string,
  now = Date.now(),
): Promise<Scenario> {
  const scenario = newScenario(newId(), projectId, await takeNumber(vault, projectId), now);
  await saveScenario(vault, scenario, now);
  return scenario;
}

export async function saveScenario(
  vault: Vault,
  scenario: Scenario,
  now = Date.now(),
): Promise<Scenario> {
  const saved = { ...scenario, updatedAt: now };
  await vault.put('scenarios', { id: saved.id, projectId: saved.projectId, updatedAt: now }, saved);
  return saved;
}

export async function getScenario(vault: Vault, id: string): Promise<Scenario | undefined> {
  const s = await vault.get<Scenario>('scenarios', id);
  return s && upgradeScenario(s);
}

export async function listScenarios(vault: Vault, projectId: string): Promise<Scenario[]> {
  return (await vault.list<Scenario>('scenarios', projectId))
    .map((r) => upgradeScenario(r.value))
    .sort((a, b) => a.number - b.number);
}

export function deleteScenario(vault: Vault, id: string): Promise<void> {
  return vault.delete('scenarios', id);
}
