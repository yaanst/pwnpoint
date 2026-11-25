import 'fake-indexeddb/auto';
import { openDB } from 'idb';
import { describe, expect, it, vi } from 'vitest';
import { WrongPassphraseError } from './crypto';
import { DB_VERSION, MIGRATIONS, type PwnPointDB, runMigrations } from './schema';
import { Vault, VaultLockedError } from './vault';

const FAST = 1_000; // PBKDF2 iterations for tests only
let n = 0;
const freshName = () => `pwnpoint-test-${++n}`;

async function raw(name: string) {
  return openDB<PwnPointDB>(name, DB_VERSION);
}

describe('schema', () => {
  it('creates every store and index at the latest version', async () => {
    const name = freshName();
    (await Vault.open({ name })).close();
    const db = await raw(name);
    expect(db.version).toBe(2);
    expect([...db.objectStoreNames].sort()).toEqual(
      ['evidence', 'findings', 'meta', 'projects', 'recommendations', 'scenarios', 'themes'].sort(),
    );
    const tx = db.transaction(['findings', 'evidence', 'scenarios', 'recommendations']);
    expect([...tx.objectStore('findings').indexNames]).toEqual(['projectId']);
    expect([...tx.objectStore('evidence').indexNames].sort()).toEqual(['findingId', 'projectId']);
    expect([...tx.objectStore('scenarios').indexNames]).toEqual(['projectId']);
    expect([...tx.objectStore('recommendations').indexNames]).toEqual(['projectId']);
    db.close();
  });

  it('upgrades a version 1 database and keeps its data', async () => {
    const name = freshName();
    const v1 = await openDB<PwnPointDB>(name, 1, {
      upgrade: (db, oldVersion, _n, tx) =>
        runMigrations(db, oldVersion, tx, MIGRATIONS.slice(0, 1)),
    });
    await v1.put('meta', 'plain', 'mode');
    await v1.put('projects', { id: 'p1', updatedAt: 1, payload: { plain: { name: 'Old' } } });
    v1.close();
    const vault = await Vault.open({ name });
    expect(vault.state).toBe('ready');
    expect(await vault.get('projects', 'p1')).toEqual({ name: 'Old' });
    expect(await vault.list('recommendations')).toEqual([]);
    vault.close();
  });

  it('runs only the migrations after the stored version, in order', () => {
    const calls: number[] = [];
    const migrations = [0, 1, 2].map((i) => vi.fn(() => calls.push(i)));
    // @ts-expect-error -- db and tx are not used by these fake migrations
    runMigrations(null, 1, null, migrations);
    expect(calls).toEqual([1, 2]);
  });
});

describe('Vault lifecycle', () => {
  it('starts in setup and refuses reads and writes until set up', async () => {
    const vault = await Vault.open({ name: freshName(), iterations: FAST });
    expect(vault.state).toBe('setup');
    await expect(vault.put('projects', { id: 'p1' }, { name: 'x' })).rejects.toBeInstanceOf(
      VaultLockedError,
    );
    await expect(vault.get('projects', 'p1')).rejects.toBeInstanceOf(VaultLockedError);
    vault.close();
  });

  it('stores, lists by project (newest first) and deletes records in plain mode', async () => {
    const vault = await Vault.open({ name: freshName(), iterations: FAST });
    await vault.setup(null);
    expect(vault.state).toBe('ready');
    expect(vault.encrypted).toBe(false);

    await vault.put('findings', { id: 'f1', projectId: 'p1', updatedAt: 1 }, { title: 'Old' });
    await vault.put('findings', { id: 'f2', projectId: 'p1', updatedAt: 2 }, { title: 'New' });
    await vault.put('findings', { id: 'f3', projectId: 'p2', updatedAt: 3 }, { title: 'Other' });

    expect(await vault.get('findings', 'f1')).toEqual({ title: 'Old' });
    const p1 = await vault.list<{ title: string }>('findings', 'p1');
    expect(p1.map((r) => r.value.title)).toEqual(['New', 'Old']);
    expect(await vault.list('findings')).toHaveLength(3);

    await vault.delete('findings', 'f1');
    expect(await vault.get('findings', 'f1')).toBeUndefined();
    vault.close();
  });
});

describe('Vault encryption at rest', () => {
  it('never writes content in clear when encrypted', async () => {
    const name = freshName();
    const vault = await Vault.open({ name, iterations: FAST });
    await vault.setup('passphrase');
    await vault.put(
      'findings',
      { id: 'f1', projectId: 'p1' },
      { title: 'Admin password: hunter2' },
    );
    vault.close();

    const db = await raw(name);
    const stored = await db.get('findings', 'f1');
    expect(stored?.projectId).toBe('p1');
    expect(stored?.payload).toHaveProperty('sealed');
    expect(JSON.stringify(stored)).not.toContain('hunter2');
    const blob = new TextDecoder().decode(
      (stored?.payload as { sealed: { data: Uint8Array } }).sealed.data,
    );
    expect(blob).not.toContain('hunter2');
    db.close();
  });

  it('is locked after reopening and needs the right passphrase', async () => {
    const name = freshName();
    const first = await Vault.open({ name, iterations: FAST });
    await first.setup('right');
    await first.put('projects', { id: 'p1' }, { name: 'ACME' });
    first.close();

    const vault = await Vault.open({ name, iterations: FAST });
    expect(vault.state).toBe('locked');
    await expect(vault.get('projects', 'p1')).rejects.toBeInstanceOf(VaultLockedError);
    await expect(vault.unlock('wrong')).rejects.toBeInstanceOf(WrongPassphraseError);
    expect(vault.state).toBe('locked');
    await vault.unlock('right');
    expect(await vault.get('projects', 'p1')).toEqual({ name: 'ACME' });

    vault.lock();
    expect(vault.state).toBe('locked');
    await expect(vault.list('projects')).rejects.toBeInstanceOf(VaultLockedError);
    vault.close();
  });

  it('encrypts existing records when encryption is turned on later', async () => {
    const name = freshName();
    const vault = await Vault.open({ name, iterations: FAST });
    await vault.setup(null);
    await vault.put('findings', { id: 'f1', projectId: 'p1' }, { title: 'secret-finding' });
    await vault.enableEncryption('pass');
    expect(vault.encrypted).toBe(true);
    expect(await vault.get('findings', 'f1')).toEqual({ title: 'secret-finding' });
    vault.close();

    const db = await raw(name);
    expect(JSON.stringify(await db.get('findings', 'f1'))).not.toContain('secret-finding');
    db.close();
  });

  it('decrypts every record and removes the keyring when encryption is turned off', async () => {
    const name = freshName();
    const vault = await Vault.open({ name, iterations: FAST });
    await vault.setup('pass');
    await vault.put('scenarios', { id: 's1', projectId: 'p1' }, { title: 'To DA' });
    await vault.disableEncryption();
    vault.close();

    const db = await raw(name);
    expect(await db.get('meta', 'keyring')).toBeUndefined();
    expect((await db.get('scenarios', 's1'))?.payload).toEqual({ plain: { title: 'To DA' } });
    db.close();

    const reopened = await Vault.open({ name, iterations: FAST });
    expect(reopened.state).toBe('ready');
    expect(await reopened.get('scenarios', 's1')).toEqual({ title: 'To DA' });
    reopened.close();
  });

  it('changes the passphrase and keeps data readable', async () => {
    const name = freshName();
    const vault = await Vault.open({ name, iterations: FAST });
    await vault.setup('old');
    await vault.put('projects', { id: 'p1' }, { name: 'ACME' });
    await expect(vault.changePassphrase('nope', 'new')).rejects.toBeInstanceOf(
      WrongPassphraseError,
    );
    await vault.changePassphrase('old', 'new');
    vault.close();

    const reopened = await Vault.open({ name, iterations: FAST });
    await expect(reopened.unlock('old')).rejects.toBeInstanceOf(WrongPassphraseError);
    await reopened.unlock('new');
    expect(await reopened.get('projects', 'p1')).toEqual({ name: 'ACME' });
    reopened.close();
  });

  it('refuses to set up twice', async () => {
    const vault = await Vault.open({ name: freshName(), iterations: FAST });
    await vault.setup(null);
    await expect(vault.setup('x')).rejects.toThrow(/already set up/);
    vault.close();
  });
});
