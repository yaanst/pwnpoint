import 'fake-indexeddb/auto';
import { describe, expect, it } from 'vitest';
import {
  addCategory,
  createFinding,
  createProject,
  deleteFinding,
  removeCategory,
} from '../findings/repository';
import { Vault } from '../storage/vault';
import { recommendationRef } from './model';
import {
  createRecommendation,
  deleteRecommendation,
  getRecommendation,
  listRecommendations,
  recategorizeRecommendation,
  setLinked,
} from './repository';

let n = 0;
async function readyVault() {
  const vault = await Vault.open({ name: `recommendations-test-${++n}`, iterations: 1_000 });
  await vault.setup('passphrase');
  return vault;
}

describe('recommendation repository', () => {
  it('numbers each category on its own and never reuses a number', async () => {
    const vault = await readyVault();
    const p = await createProject(vault, 'P');
    const refs = [];
    for (const category of ['ACC', 'HAR', 'ACC', undefined]) {
      refs.push(
        recommendationRef(await createRecommendation(vault, p.id, category ? { category } : {})),
      );
    }
    expect(refs).toEqual(['REC.ACC.01', 'REC.HAR.01', 'REC.ACC.02', 'REC.01']);
    const acc2 = (await listRecommendations(vault, p.id)).find((r) => r.number === 2);
    if (!acc2) throw new Error('missing');
    await deleteRecommendation(vault, acc2.id);
    expect(recommendationRef(await createRecommendation(vault, p.id, { category: 'ACC' }))).toBe(
      'REC.ACC.03',
    );
    const moved = await recategorizeRecommendation(vault, acc2, 'HAR', acc2);
    expect(recommendationRef(moved)).toBe('REC.HAR.02');
    expect(await recategorizeRecommendation(vault, acc2, 'ACC', acc2)).toEqual({
      number: 2,
      category: 'ACC',
    });
    vault.close();
  });

  it('links findings, and drops the link when the finding is deleted', async () => {
    const vault = await readyVault();
    const p = await createProject(vault, 'P');
    const f1 = await createFinding(vault, p.id);
    const f2 = await createFinding(vault, p.id);
    let r = await createRecommendation(vault, p.id, { findingIds: [f1.id] });
    r = await setLinked(vault, r, f2.id, true);
    r = await setLinked(vault, r, f2.id, true); // no duplicate
    expect(r.findingIds).toEqual([f1.id, f2.id]);
    await deleteFinding(vault, f1.id);
    expect((await getRecommendation(vault, r.id))?.findingIds).toEqual([f2.id]);
    vault.close();
  });

  it('has its own categories, separate from the finding ones', async () => {
    const vault = await readyVault();
    const p = await createProject(vault, 'P');
    // NET is a finding category, not a recommendation one: it can be added here.
    const added = await addCategory(
      vault,
      p.id,
      { code: 'NET', name: 'Network' },
      'recommendation',
    );
    expect(added.recommendationCategories).toEqual([{ code: 'NET', name: 'Network' }]);
    expect(added.categories).toBeUndefined();
    await expect(
      addCategory(vault, p.id, { code: 'ACC', name: 'x' }, 'recommendation'),
    ).rejects.toThrow(/already exists/);
    await expect(
      addCategory(vault, p.id, { code: 'REC', name: 'x' }, 'recommendation'),
    ).rejects.toThrow(/reserved/);
    await createRecommendation(vault, p.id, { category: 'NET' });
    await expect(removeCategory(vault, p.id, 'NET', 'recommendation')).rejects.toThrow(
      /Recommendations use NET/,
    );
    // The finding category list is untouched and NET (built in) cannot be removed there.
    expect((await removeCategory(vault, p.id, 'CLOUD')).categories).toEqual([]);
    vault.close();
  });
});
