export type PersistenceStatus = 'persistent' | 'best-effort' | 'unsupported';

const storage = () => globalThis.navigator?.storage;

/** Current status, read-only: never prompts the user (navigator.storage.persisted). */
export async function persistenceStatus(): Promise<PersistenceStatus> {
  const s = storage();
  if (!s?.persisted) return 'unsupported';
  try {
    return (await s.persisted()) ? 'persistent' : 'best-effort';
  } catch {
    return 'unsupported';
  }
}

/**
 * Asks the browser not to evict PwnPoint's storage (navigator.storage.persist).
 * Firefox shows a permission prompt and only resolves once the user answers it, so callers
 * must not block the UI on this.
 */
export async function requestPersistence(): Promise<PersistenceStatus> {
  const s = storage();
  if (!s?.persist) return 'unsupported';
  try {
    return (await s.persist()) ? 'persistent' : 'best-effort';
  } catch {
    return 'unsupported';
  }
}
