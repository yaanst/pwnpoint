import { themeFileObject } from '../slides/themeStore';
import {
  decryptWithPassphrase,
  encryptWithPassphrase,
  PBKDF2_ITERATIONS,
  type PassphraseSealed,
} from '../storage/crypto';
import { unzipStored, zip, type ZipEntry } from '../export/zip';
import { base64ToBytes, bytesToBase64 } from '../util/base64';
import {
  isObj,
  LIMITS,
  MISSION_FORMAT,
  MISSION_VERSION,
  type MissionContent,
  READABLE_VERSIONS,
  validateMission,
} from './validate';

/**
 * Mission file (`.pwnp`): a stored ZIP archive.
 *
 * - `pwnpoint.json`: manifest `{ format, version, encrypted }`, plus the KDF and cipher
 *   parameters when encrypted.
 * - Plain file: `data.json` (projects, findings, image metadata, scenarios, theme) and
 *   `images/<evidence id>.png`, next to the manifest.
 * - Encrypted file: `payload.bin`, the plain archive's `data.json` and images zipped then
 *   encrypted with AES-GCM 256 under a key derived from a passphrase (PBKDF2-SHA256).
 *
 * Reading never executes anything: JSON is parsed, then validated field by field.
 */

export const MISSION_EXTENSION = '.pwnp';
export const MISSION_MIME = 'application/octet-stream';
export const MAX_MISSION_BYTES = 1024 * 1024 * 1024;
/** Upper bound on PBKDF2 iterations accepted from a file, so a crafted file cannot hang the tab. */
const MAX_ITERATIONS = 10_000_000;
/** Binds the ciphertext to the format and version written in the manifest. */
const aad = (version: unknown) => `${MISSION_FORMAT}/${String(version)}`;
const MANIFEST = 'pwnpoint.json';
const DATA = 'data.json';
const PAYLOAD = 'payload.bin';
const MAX_ENTRIES = LIMITS.evidence + 10;

const utf8 = new TextEncoder();
const imagePath = (id: string) => `images/${id}.png`;

function innerEntries(content: MissionContent, appVersion: string, now: number): ZipEntry[] {
  const data = {
    format: MISSION_FORMAT,
    version: MISSION_VERSION,
    scope: content.scope,
    exportedAt: now,
    appVersion,
    projects: content.projects.map((p) => p.project),
    findings: content.projects.flatMap((p) => p.findings),
    evidence: content.projects.flatMap((p) => p.evidence.map((e) => e.meta)),
    scenarios: content.projects.flatMap((p) => p.scenarios),
    recommendations: content.projects.flatMap((p) => p.recommendations),
    theme: content.theme ? themeFileObject(content.theme) : null,
  };
  return [
    { name: DATA, data: utf8.encode(JSON.stringify(data)) },
    ...content.projects.flatMap((p) =>
      p.evidence.map((e) => ({ name: imagePath(e.meta.id), data: e.bytes })),
    ),
  ];
}

const manifest = (extra: object) =>
  utf8.encode(
    JSON.stringify({ format: MISSION_FORMAT, version: MISSION_VERSION, ...extra }, null, 2),
  );

/** Builds the file. With a passphrase, everything except the manifest is encrypted. */
export async function buildMissionFile(
  content: MissionContent,
  options: { passphrase: string | null; appVersion: string; now?: number; iterations?: number },
): Promise<Uint8Array<ArrayBuffer>> {
  const inner = innerEntries(content, options.appVersion, options.now ?? Date.now());
  if (options.passphrase === null) {
    return zip([{ name: MANIFEST, data: manifest({ encrypted: false }) }, ...inner]);
  }
  const sealed = await encryptWithPassphrase(
    zip(inner),
    options.passphrase,
    aad(MISSION_VERSION),
    options.iterations ?? PBKDF2_ITERATIONS,
  );
  const params = {
    encrypted: true,
    kdf: { ...sealed.kdf, salt: bytesToBase64(sealed.kdf.salt) },
    cipher: { ...sealed.cipher, iv: bytesToBase64(sealed.cipher.iv) },
  };
  return zip([
    { name: MANIFEST, data: manifest(params) },
    { name: PAYLOAD, data: sealed.data },
  ]);
}

export type OpenedMission =
  | { status: 'ok'; content: MissionContent }
  | { status: 'needs-passphrase'; open: (passphrase: string) => Promise<OpenedMission> }
  | { status: 'error'; errors: string[] };

const error = (...errors: string[]): OpenedMission => ({ status: 'error', errors });

function parseJson(bytes: Uint8Array | undefined): unknown {
  if (!bytes) return undefined;
  try {
    return JSON.parse(new TextDecoder('utf-8', { fatal: true }).decode(bytes)) as unknown;
  } catch {
    return undefined;
  }
}

function readContent(files: Map<string, Uint8Array>): OpenedMission {
  const data = parseJson(files.get(DATA));
  if (data === undefined) return error('The file is damaged: its data could not be read.');
  const images = new Map<string, Uint8Array<ArrayBuffer>>();
  for (const [name, bytes] of files) {
    const m = /^images\/([A-Za-z0-9_-]{1,100})\.png$/.exec(name);
    if (m?.[1]) images.set(m[1], new Uint8Array(bytes)); // copy: detach from the archive buffer
  }
  const result = validateMission(data, images);
  return result.ok ? { status: 'ok', content: result.content } : error(...result.errors);
}

function sealedFrom(m: Record<string, unknown>, data: Uint8Array): PassphraseSealed | null {
  const kdf = isObj(m.kdf) ? m.kdf : {};
  const cipher = isObj(m.cipher) ? m.cipher : {};
  const it = kdf.iterations;
  if (
    kdf.name !== 'PBKDF2' ||
    kdf.hash !== 'SHA-256' ||
    typeof it !== 'number' ||
    !Number.isSafeInteger(it) ||
    it < PBKDF2_ITERATIONS ||
    it > MAX_ITERATIONS ||
    cipher.name !== 'AES-GCM' ||
    typeof kdf.salt !== 'string' ||
    typeof cipher.iv !== 'string'
  ) {
    return null;
  }
  try {
    const salt = base64ToBytes(kdf.salt);
    const iv = base64ToBytes(cipher.iv);
    if (salt.length < 16 || iv.length !== 12) return null;
    return {
      kdf: { name: 'PBKDF2', hash: 'SHA-256', iterations: it, salt },
      cipher: { name: 'AES-GCM', iv },
      data: new Uint8Array(data),
    };
  } catch {
    return null;
  }
}

/** Reads and validates a mission file. Encrypted files ask for the passphrase first. */
export function openMissionFile(bytes: Uint8Array): OpenedMission {
  if (bytes.length > MAX_MISSION_BYTES) return error('This file is larger than 1 GB.');
  let files: Map<string, Uint8Array>;
  try {
    files = unzipStored(bytes, { maxEntries: MAX_ENTRIES });
  } catch {
    return error('This is not a PwnPoint mission file, or it is damaged.');
  }
  const m = parseJson(files.get(MANIFEST));
  if (!isObj(m) || m.format !== MISSION_FORMAT) {
    return error('This is not a PwnPoint mission file.');
  }
  if (!READABLE_VERSIONS.includes(m.version)) {
    return error(
      'This mission file was made by a newer version of PwnPoint. Update PwnPoint first.',
    );
  }
  if (m.encrypted !== true) return readContent(files);

  const payload = files.get(PAYLOAD);
  const sealed = payload ? sealedFrom(m, payload) : null;
  if (!sealed) return error('The file is damaged: its encryption settings are invalid.');
  const open = async (passphrase: string): Promise<OpenedMission> => {
    let inner: Uint8Array;
    try {
      inner = await decryptWithPassphrase(sealed, passphrase, aad(m.version));
    } catch {
      return error('Wrong passphrase, or the file was modified.');
    }
    try {
      return readContent(unzipStored(inner, { maxEntries: MAX_ENTRIES }));
    } catch {
      return error('The file is damaged: its content could not be read.');
    }
  };
  return { status: 'needs-passphrase', open };
}
