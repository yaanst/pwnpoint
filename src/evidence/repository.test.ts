import 'fake-indexeddb/auto';
import { openDB } from 'idb';
import { describe, expect, it } from 'vitest';
import {
  createFinding,
  createProject,
  deleteFinding,
  duplicateFinding,
} from '../findings/repository';
import { DB_VERSION, type PwnPointDB } from '../storage/schema';
import { Vault } from '../storage/vault';
import {
  addEvidence,
  deleteEvidence,
  getEvidenceBytes,
  listEvidence,
  moveItem,
  saveEvidence,
  saveOrder,
} from './repository';

let n = 0;
async function setup(passphrase: string | null = 'passphrase') {
  const name = `evidence-test-${++n}`;
  const vault = await Vault.open({ name, iterations: 1_000 });
  await vault.setup(passphrase);
  const project = await createProject(vault, 'P');
  const finding = await createFinding(vault, project.id);
  return { vault, name, finding, target: { findingId: finding.id, projectId: project.id } };
}
const image = (text: string) => ({ bytes: new TextEncoder().encode(text), width: 10, height: 5 });
const text = (b: Uint8Array | undefined) => (b ? new TextDecoder().decode(b) : undefined);

describe('evidence repository', () => {
  it('stores images with captions in order and returns their bytes', async () => {
    const { vault, target } = await setup();
    const a = await addEvidence(vault, target, image('IMG-A'), 'Login page');
    const b = await addEvidence(vault, target, image('IMG-B'));
    expect((await listEvidence(vault, target.findingId)).map((e) => [e.caption, e.order])).toEqual([
      ['Login page', 0],
      ['', 1],
    ]);
    expect(text(await getEvidenceBytes(vault, a.id))).toBe('IMG-A');
    expect(text(await getEvidenceBytes(vault, b.id))).toBe('IMG-B');
    vault.close();
  });

  it('keeps the image when only the caption changes', async () => {
    const { vault, target } = await setup();
    const a = await addEvidence(vault, target, image('IMG-A'));
    await saveEvidence(vault, { ...a, caption: 'Admin panel' });
    expect((await listEvidence(vault, target.findingId))[0]?.caption).toBe('Admin panel');
    expect(text(await getEvidenceBytes(vault, a.id))).toBe('IMG-A');
    vault.close();
  });

  it('reorders and renumbers after a delete', async () => {
    const { vault, target } = await setup();
    const ids = [];
    for (const t of ['A', 'B', 'C']) ids.push((await addEvidence(vault, target, image(t), t)).id);
    const list = await listEvidence(vault, target.findingId);
    await saveOrder(vault, moveItem(list, 2, 0));
    expect((await listEvidence(vault, target.findingId)).map((e) => e.caption)).toEqual([
      'C',
      'A',
      'B',
    ]);
    const [, a] = await listEvidence(vault, target.findingId);
    if (a) await deleteEvidence(vault, a);
    expect((await listEvidence(vault, target.findingId)).map((e) => [e.caption, e.order])).toEqual([
      ['C', 0],
      ['B', 1],
    ]);
    vault.close();
  });

  it('encrypts image bytes and captions at rest', async () => {
    const { vault, name, target } = await setup();
    await addEvidence(vault, target, image('SECRET-PIXELS'), 'Domain admin hash');
    vault.close();
    const db = await openDB<PwnPointDB>(name, DB_VERSION);
    const [stored] = await db.getAll('evidence');
    expect(stored?.bytes).toHaveProperty('sealed');
    const raw =
      JSON.stringify(stored) +
      new TextDecoder('latin1').decode(
        (stored?.bytes as { sealed: { data: Uint8Array } }).sealed.data,
      );
    expect(raw).not.toContain('SECRET-PIXELS');
    expect(raw).not.toContain('Domain admin');
    db.close();
  });

  it('keeps images readable when encryption is turned off and on again', async () => {
    const { vault, target } = await setup();
    const a = await addEvidence(vault, target, image('IMG-A'));
    await vault.disableEncryption();
    expect(text(await getEvidenceBytes(vault, a.id))).toBe('IMG-A');
    await vault.enableEncryption('another passphrase');
    expect(text(await getEvidenceBytes(vault, a.id))).toBe('IMG-A');
    vault.close();
  });

  it('copies evidence with a duplicated finding and deletes it with its finding', async () => {
    const { vault, finding, target } = await setup();
    await addEvidence(vault, target, image('IMG-A'), 'cap');
    const copy = await duplicateFinding(vault, finding);
    const copied = await listEvidence(vault, copy.id);
    expect(copied.map((e) => e.caption)).toEqual(['cap']);
    expect(text(await getEvidenceBytes(vault, copied[0]?.id ?? ''))).toBe('IMG-A');

    await deleteFinding(vault, finding.id);
    expect(await listEvidence(vault, finding.id)).toEqual([]);
    expect(await listEvidence(vault, copy.id)).toHaveLength(1);
    vault.close();
  });
});

describe('moveItem', () => {
  it('moves within bounds and ignores moves outside', () => {
    expect(moveItem([1, 2, 3], 0, 2)).toEqual([2, 3, 1]);
    expect(moveItem([1, 2, 3], 0, -1)).toEqual([1, 2, 3]);
    expect(moveItem([1, 2, 3], 2, 3)).toEqual([1, 2, 3]);
  });
});
