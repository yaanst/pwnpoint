import type { Project } from '../findings/model';
import type { Vault } from '../storage/vault';
import type { MissionDetails } from './mission';

/** Saves a project's mission details, keeping its counters (re-read: they may have moved). */
export async function saveMission(
  vault: Vault,
  projectId: string,
  mission: MissionDetails,
): Promise<Project> {
  const project = await vault.get<Project>('projects', projectId);
  if (!project) throw new Error('This project no longer exists.');
  const next = { ...project, mission };
  await vault.put('projects', { id: projectId }, next);
  return next;
}
