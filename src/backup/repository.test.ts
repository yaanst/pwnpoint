import 'fake-indexeddb/auto';
import { describe, expect, it } from 'vitest';
import { addEvidence, getEvidenceBytes, listEvidence } from '../evidence/repository';
import {
  createFinding,
  createProject,
  getFinding,
  listFindings,
  listProjects,
  saveFinding,
} from '../findings/repository';
import { findingStep } from '../scenarios/model';
import { createScenario, listScenarios, saveScenario } from '../scenarios/repository';
import { DEFAULT_THEME } from '../slides/theme';
import { loadTheme, saveTheme } from '../slides/themeStore';
import { Vault } from '../storage/vault';
import { buildMissionFile, openMissionFile } from './mission';
import { collectMission, existingProjects, missionCounts, restoreMission } from './repository';
import { fakeReencode, TINY_PNG } from './testing';

/** The first item, or a test failure. */
function first<T>(items: T[]): T {
  const item = items[0];
  if (item === undefined) throw new Error('Expected at least one item.');
  return item;
}

let n = 0;
async function readyVault() {
  const vault = await Vault.open({ name: `backup-test-${++n}`, iterations: 1_000 });
  await vault.setup('passphrase');
  return vault;
}

/** A project with one finding, one image and a scenario using the finding. */
async function seed(vault: Vault, name = 'ACME') {
  const p = await createProject(vault, name);
  const f = await createFinding(vault, p.id);
  await saveFinding(vault, { ...f, title: 'SQL injection' });
  await addEvidence(
    vault,
    { findingId: f.id, projectId: p.id },
    { bytes: TINY_PNG, width: 1, height: 1 },
  );
  const s = await createScenario(vault, p.id);
  await saveScenario(vault, { ...s, title: 'Takeover', steps: [findingStep('st1', f.id)] });
  return { p, f, s };
}

/** Saves then re-opens, as the UI does. */
async function roundTrip(vault: Vault, scope: { projectId: string } | 'all') {
  const file = await buildMissionFile(await collectMission(vault, scope), {
    passphrase: null,
    appVersion: 't',
  });
  const opened = openMissionFile(file);
  if (opened.status !== 'ok') throw new Error(JSON.stringify(opened));
  return opened.content;
}

const opts = { theme: false, reencode: fakeReencode };

describe('backup repository', () => {
  it('collects one project with its findings, images and scenarios', async () => {
    const vault = await readyVault();
    const { p } = await seed(vault);
    await seed(vault, 'Other');
    const content = await collectMission(vault, { projectId: p.id });
    expect(content.scope).toBe('project');
    expect(content.theme).toBeUndefined();
    expect(missionCounts(content)).toEqual({ projects: 1, findings: 1, images: 1, scenarios: 1 });
    const all = await collectMission(vault, 'all');
    expect(missionCounts(all).projects).toBe(2);
    expect(all.theme).toBeDefined();
  });

  it('restores into another browser with the same ids and working links', async () => {
    const source = await readyVault();
    const { p, f } = await seed(source);
    const content = await roundTrip(source, { projectId: p.id });

    const target = await readyVault();
    expect(await existingProjects(target, content)).toEqual([]);
    const result = await restoreMission(target, content, { ...opts, conflict: 'replace' });
    expect(result).toMatchObject({ replaced: 0, copied: 0 });
    expect((await listProjects(target)).map((x) => x.id)).toEqual([p.id]);
    expect((await getFinding(target, f.id))?.title).toBe('SQL injection');
    const e = first(await listEvidence(target, f.id));
    expect(await getEvidenceBytes(target, e.id)).toEqual(TINY_PNG);
    expect((await listScenarios(target, p.id))[0]?.steps[0]?.findingId).toBe(f.id);
    // Counters continue: the next finding is VLN.02.
    expect((await createFinding(target, p.id)).number).toBe(2);
  });

  it('replaces an existing project: new records written, records missing from the file removed', async () => {
    const vault = await readyVault();
    const { p } = await seed(vault);
    const content = await roundTrip(vault, { projectId: p.id });
    const extra = await createFinding(vault, p.id); // created after the save
    expect((await existingProjects(vault, content)).map((x) => x.id)).toEqual([p.id]);

    const result = await restoreMission(vault, content, { ...opts, conflict: 'replace' });
    expect(result.replaced).toBe(1);
    const findings = await listFindings(vault, p.id);
    expect(findings.map((x) => x.title)).toEqual(['SQL injection']);
    expect(await getFinding(vault, extra.id)).toBeUndefined();
    // The counter is the file's: the deleted finding's number may come back (file is the truth).
    expect((await listProjects(vault)).length).toBe(1);
  });

  it('keeps both when asked: the copy gets fresh ids and its links follow', async () => {
    const vault = await readyVault();
    const { p, f } = await seed(vault);
    const content = await roundTrip(vault, { projectId: p.id });
    const result = await restoreMission(vault, content, { ...opts, conflict: 'copy' });
    expect(result.copied).toBe(1);
    const copy = first(result.projects);
    expect(copy.id).not.toBe(p.id);
    expect(copy.name).toBe('ACME (copy)');
    const cf = first(await listFindings(vault, copy.id));
    expect(cf.id).not.toBe(f.id);
    expect((await listEvidence(vault, cf.id)).length).toBe(1);
    expect((await listScenarios(vault, copy.id))[0]?.steps[0]?.findingId).toBe(cf.id);
    // The original is untouched.
    expect((await listFindings(vault, p.id)).map((x) => x.id)).toEqual([f.id]);
  });

  it('imports as new when record ids are taken by another project', async () => {
    const vault = await readyVault();
    const { p } = await seed(vault);
    const content = await roundTrip(vault, { projectId: p.id });
    // Same records under another project id: the finding, image and scenario ids are taken.
    const clash = {
      ...content,
      projects: content.projects.map((x) => ({ ...x, project: { ...x.project, id: 'other' } })),
    };
    const second = await restoreMission(vault, clash, { ...opts, conflict: 'replace' });
    expect(second.projects[0]?.id).not.toBe('other');
    expect((await listProjects(vault)).length).toBe(2);
    expect((await listFindings(vault, p.id)).length).toBe(1); // the original is untouched
  });

  it('re-encodes every image and stores the re-encoded size', async () => {
    const vault = await readyVault();
    const { p, f } = await seed(vault);
    const content = await roundTrip(vault, { projectId: p.id });
    const target = await readyVault();
    const reencoded = new Uint8Array([1, 2, 3]);
    await restoreMission(target, content, {
      ...opts,
      conflict: 'replace',
      reencode: () => Promise.resolve({ bytes: reencoded, width: 7, height: 9 }),
    });
    const e = first(await listEvidence(target, f.id));
    expect(e).toMatchObject({ width: 7, height: 9, byteLength: 3 });
    expect(await getEvidenceBytes(target, e.id)).toEqual(reencoded);
  });

  it('writes nothing when an image cannot be re-encoded', async () => {
    const vault = await readyVault();
    const { p } = await seed(vault);
    const content = await roundTrip(vault, { projectId: p.id });
    const target = await readyVault();
    await expect(
      restoreMission(target, content, {
        ...opts,
        conflict: 'replace',
        reencode: () => Promise.reject(new Error('bad image')),
      }),
    ).rejects.toThrow('bad image');
    expect(await listProjects(target)).toEqual([]);
  });

  it('restores the slide theme only when asked', async () => {
    const vault = await readyVault();
    await seed(vault);
    await saveTheme(vault, {
      ...DEFAULT_THEME,
      name: 'ACME',
      logo: { bytes: TINY_PNG, width: 1, height: 1 },
    });
    const content = await roundTrip(vault, 'all');

    const target = await readyVault();
    await restoreMission(target, content, { ...opts, conflict: 'replace' });
    expect((await loadTheme(target)).name).toBe('Default');
    const result = await restoreMission(target, content, {
      ...opts,
      conflict: 'replace',
      theme: true,
    });
    expect(result.themeRestored).toBe(true);
    const theme = await loadTheme(target);
    expect(theme.name).toBe('ACME');
    expect(theme.logo?.bytes).toEqual(TINY_PNG);
  });
});
