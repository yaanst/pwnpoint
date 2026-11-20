import 'fake-indexeddb/auto';
import { openDB } from 'idb';
import { describe, expect, it } from 'vitest';
import { DB_VERSION, type PwnPointDB } from '../storage/schema';
import { Vault } from '../storage/vault';
import {
  createFinding,
  createProject,
  deleteFinding,
  duplicateFinding,
  getFinding,
  listFindings,
  listProjects,
  renameProject,
  saveFinding,
} from './repository';

let n = 0;
async function readyVault(name = `findings-test-${++n}`) {
  const vault = await Vault.open({ name, iterations: 1_000 });
  await vault.setup('passphrase');
  return { vault, name };
}

describe('finding repository', () => {
  it('numbers findings per project and never reuses a number', async () => {
    const { vault } = await readyVault();
    const acme = await createProject(vault, ' ACME 2026 ');
    const other = await createProject(vault, 'Other');
    expect(acme.name).toBe('ACME 2026');

    const f1 = await createFinding(vault, acme.id);
    const f2 = await createFinding(vault, acme.id);
    const o1 = await createFinding(vault, other.id);
    expect([f1.number, f2.number, o1.number]).toEqual([1, 2, 1]);

    await deleteFinding(vault, f2.id);
    expect((await createFinding(vault, acme.id)).number).toBe(3);
    expect((await duplicateFinding(vault, f1)).number).toBe(4);

    expect((await listFindings(vault, acme.id)).map((f) => f.number).sort()).toEqual([1, 3, 4]);
    expect(await listFindings(vault, other.id)).toHaveLength(1);
    vault.close();
  });

  it('saves edits and refreshes updatedAt', async () => {
    const { vault } = await readyVault();
    const p = await createProject(vault, 'P', 1);
    const f = await createFinding(vault, p.id, 1);
    await saveFinding(vault, { ...f, title: 'Kerberoasting', assets: ['dc01'] }, 50);
    expect(await getFinding(vault, f.id)).toMatchObject({
      title: 'Kerberoasting',
      assets: ['dc01'],
      updatedAt: 50,
    });
    vault.close();
  });

  it('renames projects and lists them', async () => {
    const { vault } = await readyVault();
    const p = await createProject(vault, 'Old');
    await renameProject(vault, p, 'New');
    expect((await listProjects(vault)).map((x) => x.name)).toEqual(['New']);
    vault.close();
  });

  it('refuses to create a finding in a project that does not exist', async () => {
    const { vault } = await readyVault();
    await expect(createFinding(vault, 'nope')).rejects.toThrow(/no longer exists/);
    vault.close();
  });

  it('stores titles and project names encrypted', async () => {
    const { vault, name } = await readyVault();
    const p = await createProject(vault, 'Client Megacorp');
    const f = await createFinding(vault, p.id);
    await saveFinding(vault, { ...f, title: 'Domain admin via ADCS ESC8' });
    vault.close();

    const db = await openDB<PwnPointDB>(name, DB_VERSION);
    const raw = JSON.stringify([await db.getAll('projects'), await db.getAll('findings')]);
    expect(raw).not.toContain('Megacorp');
    expect(raw).not.toContain('ESC8');
    db.close();
  });
});
