import { afterEach, describe, expect, it, vi } from 'vitest';
import { persistenceStatus, requestPersistence } from './persistence';

function stubStorage(persisted: boolean, persist: () => Promise<boolean>) {
  const storage = { persisted: vi.fn(() => Promise.resolve(persisted)), persist: vi.fn(persist) };
  vi.stubGlobal('navigator', { storage });
  return storage;
}

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('persistenceStatus', () => {
  it('reads the status without ever asking (Firefox would show a prompt)', async () => {
    const storage = stubStorage(false, () => new Promise(() => {})); // persist() never resolves
    await expect(persistenceStatus()).resolves.toBe('best-effort');
    expect(storage.persist).not.toHaveBeenCalled();
  });

  it('reports persistent storage', async () => {
    stubStorage(true, () => Promise.resolve(true));
    await expect(persistenceStatus()).resolves.toBe('persistent');
  });

  it('reports unsupported when the API is missing', async () => {
    vi.stubGlobal('navigator', {});
    await expect(persistenceStatus()).resolves.toBe('unsupported');
    await expect(requestPersistence()).resolves.toBe('unsupported');
  });
});

describe('requestPersistence', () => {
  it('returns what the browser granted', async () => {
    stubStorage(false, () => Promise.resolve(true));
    await expect(requestPersistence()).resolves.toBe('persistent');
    stubStorage(false, () => Promise.resolve(false));
    await expect(requestPersistence()).resolves.toBe('best-effort');
  });
});
