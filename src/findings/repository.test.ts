import 'fake-indexeddb/auto';
import { openDB } from 'idb';
import { describe, expect, it } from 'vitest';
import { DB_VERSION, type PwnPointDB } from '../storage/schema';
import { Vault } from '../storage/vault';
import { findingRef } from './model';
import {
  addCategory,
  createFinding,
  createProject,
  deleteFinding,
  duplicateFinding,
  getFinding,
  listFindings,
  listProjects,
  recategorize,
  removeCategory,
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
  it('drops the free-text recommendation of findings saved by older versions', async () => {
    const { vault } = await readyVault();
    const p = await createProject(vault, 'Old');
    const f = await createFinding(vault, p.id);
    const old = { ...f, recommendation: 'Patch it.' };
    await vault.put('findings', { id: f.id, projectId: p.id, updatedAt: 1 }, old);
    expect(await getFinding(vault, f.id)).not.toHaveProperty('recommendation');
    expect((await listFindings(vault, p.id))[0]).not.toHaveProperty('recommendation');
  });

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

  it('numbers each category on its own', async () => {
    const { vault } = await readyVault();
    const p = await createProject(vault, 'P');
    const refs = [];
    for (const cat of [undefined, 'NET', 'PHY', 'NET', undefined]) {
      refs.push(findingRef(await createFinding(vault, p.id, 1, cat)));
    }
    expect(refs).toEqual(['VLN.01', 'VLN.NET.01', 'VLN.PHY.01', 'VLN.NET.02', 'VLN.02']);
    const net2 = (await listFindings(vault, p.id)).find((f) => findingRef(f) === 'VLN.NET.02');
    if (!net2) throw new Error('missing');
    expect(findingRef(await duplicateFinding(vault, net2))).toBe('VLN.NET.03');
    vault.close();
  });

  it('gives a moved finding the next number of its new category, or its old one back', async () => {
    const { vault } = await readyVault();
    const p = await createProject(vault, 'P');
    const f = await createFinding(vault, p.id); // VLN.01
    await createFinding(vault, p.id, 1, 'NET'); // VLN.NET.01
    const moved = await recategorize(vault, f, 'NET', f);
    expect(findingRef(moved)).toBe('VLN.NET.02');
    expect(await recategorize(vault, f, undefined, f)).toEqual({ number: 1 });
    // VLN.NET.02 was handed out: it is not reused.
    expect(findingRef(await createFinding(vault, p.id, 1, 'NET'))).toBe('VLN.NET.03');
    const other = await recategorize(vault, f, 'PHY', f);
    expect(findingRef(other)).toBe('VLN.PHY.01');
    vault.close();
  });

  it("adds and removes the project's own categories", async () => {
    const { vault } = await readyVault();
    const p = await createProject(vault, 'P');
    const added = await addCategory(vault, p.id, { code: ' cloud ', name: ' Cloud ' });
    expect(added.categories).toEqual([{ code: 'CLOUD', name: 'Cloud' }]);
    await expect(addCategory(vault, p.id, { code: 'CLOUD', name: 'x' })).rejects.toThrow(
      /already exists/,
    );
    await expect(addCategory(vault, p.id, { code: 'NET', name: 'x' })).rejects.toThrow(
      /already exists/,
    );
    await expect(addCategory(vault, p.id, { code: 'VLN', name: 'x' })).rejects.toThrow(/reserved/);
    await expect(addCategory(vault, p.id, { code: 'A', name: 'x' })).rejects.toThrow(/2 to 6/);

    const f = await createFinding(vault, p.id, 1, 'CLOUD');
    await expect(removeCategory(vault, p.id, 'CLOUD')).rejects.toThrow(/use CLOUD/);
    await deleteFinding(vault, f.id);
    expect((await removeCategory(vault, p.id, 'CLOUD')).categories).toEqual([]);
    // Added again later: the counter was kept, VLN.CLOUD.01 is not reused.
    await addCategory(vault, p.id, { code: 'CLOUD', name: 'Cloud' });
    expect(findingRef(await createFinding(vault, p.id, 1, 'CLOUD'))).toBe('VLN.CLOUD.02');
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
