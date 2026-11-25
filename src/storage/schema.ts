import type { DBSchema, IDBPDatabase, IDBPTransaction, StoreNames } from 'idb';
import type { Keyring, Sealed } from './crypto';

export const DB_NAME = 'pwnpoint';

/** Record stores holding user content. Every record is sealed when encryption is on. */
export const CONTENT_STORES = [
  'projects',
  'findings',
  'evidence',
  'scenarios',
  'themes',
  'recommendations',
] as const;
export type ContentStore = (typeof CONTENT_STORES)[number];

/**
 * What IndexedDB holds for one record. Only `id`, `projectId`, `findingId` and `updatedAt`
 * are in clear (they are needed for indexes and sorting); all content is in `payload`.
 */
export interface StoredRecord {
  id: string;
  projectId?: string;
  findingId?: string;
  updatedAt: number;
  payload: { sealed: Sealed } | { plain: unknown };
  /** Optional binary content (e.g. an evidence image), sealed separately from the JSON payload. */
  bytes?: { sealed: Sealed } | { plain: Uint8Array<ArrayBuffer> };
}

export type StorageMode = 'encrypted' | 'plain';

export interface PwnPointDB extends DBSchema {
  meta: {
    key: 'mode' | 'keyring';
    value: StorageMode | Keyring;
  };
  projects: { key: string; value: StoredRecord };
  findings: { key: string; value: StoredRecord; indexes: { projectId: string } };
  evidence: { key: string; value: StoredRecord; indexes: { projectId: string; findingId: string } };
  scenarios: { key: string; value: StoredRecord; indexes: { projectId: string } };
  themes: { key: string; value: StoredRecord };
  recommendations: { key: string; value: StoredRecord; indexes: { projectId: string } };
}

type UpgradeTx = IDBPTransaction<PwnPointDB, StoreNames<PwnPointDB>[], 'versionchange'>;
type Migration = (db: IDBPDatabase<PwnPointDB>, tx: UpgradeTx) => void;

/**
 * Schema migrations. MIGRATIONS[n] upgrades the database from version n to n + 1.
 * Never edit a released migration: append a new one.
 */
export const MIGRATIONS: readonly Migration[] = [
  // v0 → v1: initial schema.
  (db) => {
    db.createObjectStore('meta');
    db.createObjectStore('projects', { keyPath: 'id' });
    db.createObjectStore('findings', { keyPath: 'id' }).createIndex('projectId', 'projectId');
    const evidence = db.createObjectStore('evidence', { keyPath: 'id' });
    evidence.createIndex('projectId', 'projectId');
    evidence.createIndex('findingId', 'findingId');
    db.createObjectStore('scenarios', { keyPath: 'id' }).createIndex('projectId', 'projectId');
    db.createObjectStore('themes', { keyPath: 'id' });
  },
  // v1 → v2: recommendations.
  (db) => {
    db.createObjectStore('recommendations', { keyPath: 'id' }).createIndex(
      'projectId',
      'projectId',
    );
  },
];

export const DB_VERSION = MIGRATIONS.length;

/** Runs every migration between the stored version and DB_VERSION, in order. */
export function runMigrations(
  db: IDBPDatabase<PwnPointDB>,
  oldVersion: number,
  tx: UpgradeTx,
  migrations: readonly Migration[] = MIGRATIONS,
): void {
  for (let v = oldVersion; v < migrations.length; v++) migrations[v]?.(db, tx);
}
