import 'fake-indexeddb/auto';
import { describe, expect, it } from 'vitest';
import { createFinding, createProject, renameProject } from '../findings/repository';
import { Vault } from '../storage/vault';
import { findingStep } from './model';
import {
  createScenario,
  deleteScenario,
  getScenario,
  listScenarios,
  saveScenario,
} from './repository';

let n = 0;
async function readyVault() {
  const vault = await Vault.open({ name: `scenarios-test-${++n}`, iterations: 1_000 });
  await vault.setup('passphrase');
  return vault;
}

describe('scenario repository', () => {
  it('numbers scenarios per project, never reusing a number, independent of findings', async () => {
    const vault = await readyVault();
    const p = await createProject(vault, 'ACME');
    await createFinding(vault, p.id);
    const s1 = await createScenario(vault, p.id);
    const s2 = await createScenario(vault, p.id);
    expect([s1.number, s2.number]).toEqual([1, 2]);
    await deleteScenario(vault, s2.id);
    expect((await createScenario(vault, p.id)).number).toBe(3);
    expect((await createFinding(vault, p.id)).number).toBe(2);
  });

  it('saves, lists in number order and reads back steps', async () => {
    const vault = await readyVault();
    const p = await createProject(vault, 'ACME');
    const other = await createProject(vault, 'Other');
    const s1 = await createScenario(vault, p.id);
    await createScenario(vault, p.id);
    await createScenario(vault, other.id);
    await saveScenario(vault, { ...s1, title: 'Chain', steps: [findingStep('a', 'f1')] });
    expect((await listScenarios(vault, p.id)).map((s) => s.number)).toEqual([1, 2]);
    const back = await getScenario(vault, s1.id);
    expect(back?.title).toBe('Chain');
    expect(back?.steps[0]?.findingId).toBe('f1');
  });

  it('keeps counters when a project is renamed from a stale copy', async () => {
    const vault = await readyVault();
    const stale = await createProject(vault, 'ACME');
    await createScenario(vault, stale.id);
    await createFinding(vault, stale.id);
    await renameProject(vault, stale, 'ACME 2026');
    expect((await createScenario(vault, stale.id)).number).toBe(2);
    expect((await createFinding(vault, stale.id)).number).toBe(2);
  });
});
