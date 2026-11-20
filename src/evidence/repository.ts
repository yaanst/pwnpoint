import type { Vault } from '../storage/vault';

/** Metadata of one evidence image. The PNG bytes are stored (sealed) next to it. */
export interface Evidence {
  id: string;
  findingId: string;
  projectId: string;
  caption: string;
  /** Position in the finding's evidence list (0-based). */
  order: number;
  width: number;
  height: number;
  byteLength: number;
  createdAt: number;
}

const newId = () => globalThis.crypto.randomUUID();

const meta = (e: Evidence) => ({ id: e.id, projectId: e.projectId, findingId: e.findingId });

export async function listEvidence(vault: Vault, findingId: string): Promise<Evidence[]> {
  const rows = await vault.listByFinding<Evidence>(findingId);
  return rows.map((r) => r.value).sort((a, b) => a.order - b.order || a.createdAt - b.createdAt);
}

export async function addEvidence(
  vault: Vault,
  target: { findingId: string; projectId: string },
  image: { bytes: Uint8Array<ArrayBuffer>; width: number; height: number },
  caption = '',
): Promise<Evidence> {
  const existing = await listEvidence(vault, target.findingId);
  const evidence: Evidence = {
    id: newId(),
    findingId: target.findingId,
    projectId: target.projectId,
    caption,
    order: existing.length,
    width: image.width,
    height: image.height,
    byteLength: image.bytes.byteLength,
    createdAt: Date.now(),
  };
  await vault.put('evidence', meta(evidence), evidence, image.bytes);
  return evidence;
}

export function getEvidenceBytes(vault: Vault, id: string) {
  return vault.getBytes('evidence', id);
}

/** Saves metadata only (caption, order); the image bytes are kept as they are. */
export function saveEvidence(vault: Vault, evidence: Evidence): Promise<void> {
  return vault.put('evidence', meta(evidence), evidence);
}

/** Replaces the image of an evidence (e.g. after redaction). */
export function replaceEvidenceImage(
  vault: Vault,
  evidence: Evidence,
  image: { bytes: Uint8Array<ArrayBuffer>; width: number; height: number },
): Promise<Evidence> {
  const next = {
    ...evidence,
    width: image.width,
    height: image.height,
    byteLength: image.bytes.byteLength,
  };
  return vault.put('evidence', meta(next), next, image.bytes).then(() => next);
}

/** Writes the given order (index in the array) for every item whose position changed. */
export async function saveOrder(vault: Vault, items: Evidence[]): Promise<Evidence[]> {
  const next = items.map((e, order) => ({ ...e, order }));
  await Promise.all(
    next.filter((e, i) => items[i]?.order !== e.order).map((e) => saveEvidence(vault, e)),
  );
  return next;
}

export async function deleteEvidence(vault: Vault, evidence: Evidence): Promise<void> {
  await vault.delete('evidence', evidence.id);
  const rest = await listEvidence(vault, evidence.findingId);
  await saveOrder(vault, rest);
}

export async function deleteEvidenceOf(vault: Vault, findingId: string): Promise<void> {
  for (const e of await listEvidence(vault, findingId)) await vault.delete('evidence', e.id);
}

export async function copyEvidence(
  vault: Vault,
  fromFindingId: string,
  to: { id: string; projectId: string },
) {
  for (const e of await listEvidence(vault, fromFindingId)) {
    const bytes = await getEvidenceBytes(vault, e.id);
    if (!bytes) continue;
    const copy: Evidence = { ...e, id: newId(), findingId: to.id, projectId: to.projectId };
    await vault.put('evidence', meta(copy), copy, bytes);
  }
}

export function moveItem<T>(items: T[], from: number, to: number): T[] {
  if (to < 0 || to >= items.length || from === to) return items;
  const next = [...items];
  const [item] = next.splice(from, 1);
  if (item !== undefined) next.splice(to, 0, item);
  return next;
}
