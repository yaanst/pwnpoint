/**
 * Encryption at rest for everything PwnPoint stores in the browser.
 *
 * Envelope scheme:
 * - A random 256-bit AES-GCM data key encrypts every record.
 * - The data key is stored only wrapped (AES-GCM) by a key derived from the user's
 *   passphrase with PBKDF2-SHA256 (≥ 600,000 iterations, random 16-byte salt).
 * - Changing the passphrase rewraps the data key; records are not re-encrypted.
 * - In memory the data key is a non-extractable CryptoKey: page scripts can use it but
 *   never read its bytes.
 * - Each record is encrypted with a fresh 12-byte IV and bound to its location
 *   (store + id) as additional authenticated data, so ciphertexts can't be swapped.
 */

export const PBKDF2_ITERATIONS = 600_000;
const SALT_BYTES = 16;
const IV_BYTES = 12;

export interface Keyring {
  version: 1;
  kdf: { name: 'PBKDF2'; hash: 'SHA-256'; iterations: number; salt: Uint8Array<ArrayBuffer> };
  wrap: { name: 'AES-GCM'; iv: Uint8Array<ArrayBuffer>; wrappedKey: Uint8Array<ArrayBuffer> };
}

export interface Sealed {
  iv: Uint8Array<ArrayBuffer>;
  data: Uint8Array<ArrayBuffer>;
}

export class WrongPassphraseError extends Error {
  constructor() {
    super('Wrong passphrase.');
    this.name = 'WrongPassphraseError';
  }
}

export class DecryptionError extends Error {
  constructor() {
    super('This data could not be decrypted: it is corrupted or was moved.');
    this.name = 'DecryptionError';
  }
}

const subtle = () => globalThis.crypto.subtle;
const randomBytes = (n: number) => globalThis.crypto.getRandomValues(new Uint8Array(n));
const encoder = new TextEncoder();
const decoder = new TextDecoder();

async function deriveWrappingKey(
  passphrase: string,
  salt: Uint8Array<ArrayBuffer>,
  iterations: number,
): Promise<CryptoKey> {
  const material = await subtle().importKey('raw', encoder.encode(passphrase), 'PBKDF2', false, [
    'deriveKey',
  ]);
  return subtle().deriveKey(
    { name: 'PBKDF2', hash: 'SHA-256', salt, iterations },
    material,
    { name: 'AES-GCM', length: 256 },
    false,
    ['wrapKey', 'unwrapKey'],
  );
}

async function wrapDataKey(
  dataKey: CryptoKey,
  passphrase: string,
  iterations: number,
): Promise<Keyring> {
  const salt = randomBytes(SALT_BYTES);
  const iv = randomBytes(IV_BYTES);
  const wrappingKey = await deriveWrappingKey(passphrase, salt, iterations);
  const wrapped = await subtle().wrapKey('raw', dataKey, wrappingKey, { name: 'AES-GCM', iv });
  return {
    version: 1,
    kdf: { name: 'PBKDF2', hash: 'SHA-256', iterations, salt },
    wrap: { name: 'AES-GCM', iv, wrappedKey: new Uint8Array(wrapped) },
  };
}

async function unwrapDataKey(
  keyring: Keyring,
  passphrase: string,
  extractable: boolean,
): Promise<CryptoKey> {
  const { salt, iterations } = keyring.kdf;
  const wrappingKey = await deriveWrappingKey(passphrase, salt, iterations);
  try {
    return await subtle().unwrapKey(
      'raw',
      keyring.wrap.wrappedKey,
      wrappingKey,
      { name: 'AES-GCM', iv: keyring.wrap.iv },
      { name: 'AES-GCM', length: 256 },
      extractable,
      ['encrypt', 'decrypt'],
    );
  } catch {
    // AES-GCM authentication fails when the wrapping key (i.e. the passphrase) is wrong.
    throw new WrongPassphraseError();
  }
}

/** Creates a new data key protected by `passphrase`. Returns the keyring to store and the key to use. */
export async function createKeyring(
  passphrase: string,
  iterations = PBKDF2_ITERATIONS,
): Promise<{ keyring: Keyring; key: CryptoKey }> {
  const temporary = await subtle().generateKey({ name: 'AES-GCM', length: 256 }, true, [
    'encrypt',
    'decrypt',
  ]);
  const keyring = await wrapDataKey(temporary, passphrase, iterations);
  // Use a non-extractable copy from now on; the extractable one goes out of scope.
  const key = await unwrapDataKey(keyring, passphrase, false);
  return { keyring, key };
}

/** Unlocks the data key. Throws WrongPassphraseError on a wrong passphrase. */
export function unlockKeyring(keyring: Keyring, passphrase: string): Promise<CryptoKey> {
  return unwrapDataKey(keyring, passphrase, false);
}

/** Rewraps the same data key under a new passphrase (fresh salt and IV). */
export async function changePassphrase(
  keyring: Keyring,
  oldPassphrase: string,
  newPassphrase: string,
  iterations = Math.max(keyring.kdf.iterations, PBKDF2_ITERATIONS),
): Promise<Keyring> {
  const dataKey = await unwrapDataKey(keyring, oldPassphrase, true);
  return wrapDataKey(dataKey, newPassphrase, iterations);
}

/** Encrypts bytes bound to `context` (e.g. "findings/abc"), with a fresh random IV. */
export async function seal(
  key: CryptoKey,
  plaintext: Uint8Array<ArrayBuffer>,
  context: string,
): Promise<Sealed> {
  const iv = randomBytes(IV_BYTES);
  const data = await subtle().encrypt(
    { name: 'AES-GCM', iv, additionalData: encoder.encode(context) },
    key,
    plaintext,
  );
  return { iv, data: new Uint8Array(data) };
}

/** Decrypts bytes sealed with the same key and context. Throws DecryptionError otherwise. */
export async function open(
  key: CryptoKey,
  sealed: Sealed,
  context: string,
): Promise<Uint8Array<ArrayBuffer>> {
  try {
    const data = await subtle().decrypt(
      { name: 'AES-GCM', iv: sealed.iv, additionalData: encoder.encode(context) },
      key,
      sealed.data,
    );
    return new Uint8Array(data);
  } catch {
    throw new DecryptionError();
  }
}

export function sealJson(key: CryptoKey, value: unknown, context: string): Promise<Sealed> {
  return seal(key, encoder.encode(JSON.stringify(value)), context);
}

export async function openJson(key: CryptoKey, sealed: Sealed, context: string): Promise<unknown> {
  return JSON.parse(decoder.decode(await open(key, sealed, context))) as unknown;
}

/** Bytes encrypted with a key derived from a passphrase (for files that leave the browser). */
export interface PassphraseSealed {
  kdf: { name: 'PBKDF2'; hash: 'SHA-256'; iterations: number; salt: Uint8Array<ArrayBuffer> };
  cipher: { name: 'AES-GCM'; iv: Uint8Array<ArrayBuffer> };
  data: Uint8Array<ArrayBuffer>;
}

async function derivePassphraseKey(
  passphrase: string,
  salt: Uint8Array<ArrayBuffer>,
  iterations: number,
): Promise<CryptoKey> {
  const material = await subtle().importKey('raw', encoder.encode(passphrase), 'PBKDF2', false, [
    'deriveKey',
  ]);
  return subtle().deriveKey(
    { name: 'PBKDF2', hash: 'SHA-256', salt, iterations },
    material,
    { name: 'AES-GCM', length: 256 },
    false,
    ['encrypt', 'decrypt'],
  );
}

/**
 * Encrypts bytes with AES-GCM 256 under a key derived from `passphrase` (PBKDF2-SHA256, fresh
 * 16-byte salt and 12-byte IV). `context` is bound as additional authenticated data.
 */
export async function encryptWithPassphrase(
  plaintext: Uint8Array<ArrayBuffer>,
  passphrase: string,
  context: string,
  iterations = PBKDF2_ITERATIONS,
): Promise<PassphraseSealed> {
  const salt = randomBytes(SALT_BYTES);
  const iv = randomBytes(IV_BYTES);
  const key = await derivePassphraseKey(passphrase, salt, iterations);
  const data = await subtle().encrypt(
    { name: 'AES-GCM', iv, additionalData: encoder.encode(context) },
    key,
    plaintext,
  );
  return {
    kdf: { name: 'PBKDF2', hash: 'SHA-256', iterations, salt },
    cipher: { name: 'AES-GCM', iv },
    data: new Uint8Array(data),
  };
}

/** Decrypts `encryptWithPassphrase` output. Throws WrongPassphraseError when it fails. */
export async function decryptWithPassphrase(
  sealed: PassphraseSealed,
  passphrase: string,
  context: string,
): Promise<Uint8Array<ArrayBuffer>> {
  const key = await derivePassphraseKey(passphrase, sealed.kdf.salt, sealed.kdf.iterations);
  try {
    const data = await subtle().decrypt(
      { name: 'AES-GCM', iv: sealed.cipher.iv, additionalData: encoder.encode(context) },
      key,
      sealed.data,
    );
    return new Uint8Array(data);
  } catch {
    // GCM cannot tell a wrong passphrase from a modified file: both fail authentication.
    throw new WrongPassphraseError();
  }
}
