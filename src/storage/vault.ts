import { type IDBPDatabase, openDB } from 'idb';
import {
  changePassphrase as rewrap,
  createKeyring,
  type Keyring,
  openJson,
  sealJson,
  unlockKeyring,
} from './crypto';
import {
  CONTENT_STORES,
  type ContentStore,
  DB_NAME,
  DB_VERSION,
  type PwnPointDB,
  runMigrations,
  type StorageMode,
  type StoredRecord,
} from './schema';

/**
 * - `setup`: first run, the user must choose a passphrase (or opt out of encryption).
 * - `locked`: data is encrypted and the passphrase has not been entered yet.
 * - `ready`: reads and writes work.
 */
export type VaultState = 'setup' | 'locked' | 'ready';

/** Clear-text fields kept next to the sealed payload, for indexes and sorting. */
export interface RecordMeta {
  id: string;
  projectId?: string;
  findingId?: string;
  updatedAt?: number;
}

export class VaultLockedError extends Error {
  constructor() {
    super('The vault is locked. Enter your passphrase first.');
    this.name = 'VaultLockedError';
  }
}

export class Vault {
  private key: CryptoKey | null = null;

  private constructor(
    private readonly db: IDBPDatabase<PwnPointDB>,
    private mode: StorageMode | undefined,
    private iterations: number | undefined,
  ) {}

  /** Opens (and migrates) the database. `iterations` overrides PBKDF2 cost, for tests only. */
  static async open(options: { name?: string; iterations?: number } = {}): Promise<Vault> {
    const db = await openDB<PwnPointDB>(options.name ?? DB_NAME, DB_VERSION, {
      upgrade: (database, oldVersion, _newVersion, tx) => runMigrations(database, oldVersion, tx),
    });
    const mode = (await db.get('meta', 'mode')) as StorageMode | undefined;
    return new Vault(db, mode, options.iterations);
  }

  get state(): VaultState {
    if (!this.mode) return 'setup';
    if (this.mode === 'encrypted' && !this.key) return 'locked';
    return 'ready';
  }

  get encrypted(): boolean {
    return this.mode === 'encrypted';
  }

  close(): void {
    this.key = null;
    this.db.close();
  }

  /** Forgets the key. The passphrase is needed again to read anything. */
  lock(): void {
    this.key = null;
  }

  async unlock(passphrase: string): Promise<void> {
    const keyring = await this.keyring();
    this.key = await unlockKeyring(keyring, passphrase);
  }

  /** First-run choice. `null` means "no encryption" (the UI must have shown the risk). */
  async setup(passphrase: string | null): Promise<void> {
    if (this.mode) throw new Error('The vault is already set up.');
    if (passphrase === null) {
      await this.db.put('meta', 'plain', 'mode');
      this.mode = 'plain';
    } else {
      await this.enableEncryption(passphrase);
    }
  }

  /** Turns encryption on and re-encrypts every record in one transaction. */
  async enableEncryption(passphrase: string): Promise<void> {
    if (this.mode === 'encrypted') throw new Error('Encryption is already on.');
    const { keyring, key } = await createKeyring(passphrase, this.iterations);
    const records = await this.readAllDecoded();
    const sealed = await Promise.all(
      records.map(async ([store, r]) => [store, await encode(key, store, r)] as const),
    );
    const tx = this.db.transaction(['meta', ...CONTENT_STORES], 'readwrite');
    await Promise.all([
      ...sealed.map(([store, r]) => tx.objectStore(store).put(r)),
      tx.objectStore('meta').put(keyring, 'keyring'),
      tx.objectStore('meta').put('encrypted', 'mode'),
      tx.done,
    ]);
    this.mode = 'encrypted';
    this.key = key;
  }

  /** Turns encryption off (the vault must be unlocked) and stores every record in clear. */
  async disableEncryption(): Promise<void> {
    if (this.mode !== 'encrypted') throw new Error('Encryption is already off.');
    const records = await this.readAllDecoded();
    const plain = await Promise.all(
      records.map(async ([store, r]) => [store, await encode(null, store, r)] as const),
    );
    const tx = this.db.transaction(['meta', ...CONTENT_STORES], 'readwrite');
    await Promise.all([
      ...plain.map(([store, r]) => tx.objectStore(store).put(r)),
      tx.objectStore('meta').delete('keyring'),
      tx.objectStore('meta').put('plain', 'mode'),
      tx.done,
    ]);
    this.mode = 'plain';
    this.key = null;
  }

  async changePassphrase(oldPassphrase: string, newPassphrase: string): Promise<void> {
    const keyring = await rewrap(
      await this.keyring(),
      oldPassphrase,
      newPassphrase,
      this.iterations,
    );
    await this.db.put('meta', keyring, 'keyring');
  }

  async put<T>(store: ContentStore, meta: RecordMeta, value: T): Promise<void> {
    const record = { ...meta, updatedAt: meta.updatedAt ?? Date.now(), value };
    await this.db.put(store, await encode(this.activeKey(), store, record));
  }

  async get<T>(store: ContentStore, id: string): Promise<T | undefined> {
    const key = this.activeKey(); // check the lock before touching the database
    const stored = await this.db.get(store, id);
    return stored ? ((await decode(key, store, stored)).value as T) : undefined;
  }

  /** All values of a store, optionally only those with the given projectId. Newest first. */
  async list<T>(store: ContentStore, projectId?: string): Promise<(RecordMeta & { value: T })[]> {
    const key = this.activeKey();
    const stored =
      projectId !== undefined && store !== 'projects' && store !== 'themes'
        ? await this.db.getAllFromIndex(store, 'projectId', projectId)
        : await this.db.getAll(store);
    const decoded = await Promise.all(stored.map((s) => decode(key, store, s)));
    return decoded
      .sort((a, b) => b.updatedAt - a.updatedAt)
      .map((d) => ({ ...d, value: d.value as T }));
  }

  async delete(store: ContentStore, id: string): Promise<void> {
    this.activeKey();
    await this.db.delete(store, id);
  }

  private async keyring(): Promise<Keyring> {
    const keyring = (await this.db.get('meta', 'keyring')) as Keyring | undefined;
    if (!keyring) throw new Error('No keyring: encryption is not set up.');
    return keyring;
  }

  /** The key to use for records: null in plain mode. Throws while setup or locked. */
  private activeKey(): CryptoKey | null {
    if (this.state !== 'ready') throw new VaultLockedError();
    return this.key;
  }

  private async readAllDecoded(): Promise<[ContentStore, Decoded][]> {
    const key = this.mode === 'encrypted' ? this.activeKey() : null;
    const out: [ContentStore, Decoded][] = [];
    for (const store of CONTENT_STORES) {
      for (const stored of await this.db.getAll(store)) {
        out.push([store, await decode(key, store, stored)]);
      }
    }
    return out;
  }
}

type Decoded = Required<Pick<RecordMeta, 'id' | 'updatedAt'>> & RecordMeta & { value: unknown };

const context = (store: ContentStore, id: string) => `${store}/${id}`;

async function encode(
  key: CryptoKey | null,
  store: ContentStore,
  r: Decoded,
): Promise<StoredRecord> {
  const { value, ...meta } = r;
  const clean: StoredRecord = { id: meta.id, updatedAt: meta.updatedAt, payload: { plain: value } };
  if (meta.projectId !== undefined) clean.projectId = meta.projectId;
  if (meta.findingId !== undefined) clean.findingId = meta.findingId;
  if (key) clean.payload = { sealed: await sealJson(key, value, context(store, meta.id)) };
  return clean;
}

async function decode(
  key: CryptoKey | null,
  store: ContentStore,
  s: StoredRecord,
): Promise<Decoded> {
  const { payload, ...meta } = s;
  if ('plain' in payload) return { ...meta, value: payload.plain };
  if (!key) throw new VaultLockedError();
  return { ...meta, value: await openJson(key, payload.sealed, context(store, s.id)) };
}
