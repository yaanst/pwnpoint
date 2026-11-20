export type PersistenceStatus = 'persistent' | 'best-effort' | 'unsupported';

/**
 * Asks the browser not to evict PwnPoint's storage under pressure (navigator.storage.persist).
 * Browsers may refuse silently; the result is shown in Settings.
 */
export async function requestPersistence(): Promise<PersistenceStatus> {
  const storage = globalThis.navigator?.storage;
  if (!storage?.persist) return 'unsupported';
  try {
    if (await storage.persisted()) return 'persistent';
    return (await storage.persist()) ? 'persistent' : 'best-effort';
  } catch {
    return 'unsupported';
  }
}
