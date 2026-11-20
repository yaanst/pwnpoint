import { describe, expect, it } from 'vitest';
import {
  changePassphrase,
  createKeyring,
  DecryptionError,
  open,
  openJson,
  PBKDF2_ITERATIONS,
  seal,
  sealJson,
  unlockKeyring,
  WrongPassphraseError,
} from './crypto';

// The real default (600k) takes ~0.5 s per derivation; tests use a low count except where
// the default itself is under test.
const FAST = 1_000;
const bytes = (s: string) => new TextEncoder().encode(s);

describe('keyring', () => {
  it('defaults to at least 600,000 PBKDF2-SHA256 iterations with a 16-byte salt', async () => {
    expect(PBKDF2_ITERATIONS).toBeGreaterThanOrEqual(600_000);
    const { keyring } = await createKeyring('correct horse battery staple');
    expect(keyring.kdf).toMatchObject({ name: 'PBKDF2', hash: 'SHA-256', iterations: 600_000 });
    expect(keyring.kdf.salt).toHaveLength(16);
    expect(keyring.wrap.iv).toHaveLength(12);
  });

  it('unlocks with the right passphrase and decrypts what the original key sealed', async () => {
    const { keyring, key } = await createKeyring('s3cret', FAST);
    const sealed = await sealJson(key, { title: 'SQL injection' }, 'findings/1');
    const unlocked = await unlockKeyring(keyring, 's3cret');
    await expect(openJson(unlocked, sealed, 'findings/1')).resolves.toEqual({
      title: 'SQL injection',
    });
  });

  it('rejects a wrong passphrase', async () => {
    const { keyring } = await createKeyring('s3cret', FAST);
    await expect(unlockKeyring(keyring, 'S3cret')).rejects.toBeInstanceOf(WrongPassphraseError);
  });

  it('never exposes the data key bytes', async () => {
    const { keyring, key } = await createKeyring('s3cret', FAST);
    expect(key.extractable).toBe(false);
    expect((await unlockKeyring(keyring, 's3cret')).extractable).toBe(false);
    await expect(globalThis.crypto.subtle.exportKey('raw', key)).rejects.toThrow();
  });

  it('uses a fresh salt for every keyring', async () => {
    const a = await createKeyring('same', FAST);
    const b = await createKeyring('same', FAST);
    expect(a.keyring.kdf.salt).not.toEqual(b.keyring.kdf.salt);
  });

  it('changes the passphrase without re-encrypting data', async () => {
    const { keyring, key } = await createKeyring('old', FAST);
    const sealed = await sealJson(key, [1, 2, 3], 'meta/x');
    const rotated = await changePassphrase(keyring, 'old', 'new', FAST);

    await expect(unlockKeyring(rotated, 'old')).rejects.toBeInstanceOf(WrongPassphraseError);
    const key2 = await unlockKeyring(rotated, 'new');
    await expect(openJson(key2, sealed, 'meta/x')).resolves.toEqual([1, 2, 3]);
    expect(rotated.kdf.salt).not.toEqual(keyring.kdf.salt);
  });

  it('refuses to change the passphrase when the old one is wrong', async () => {
    const { keyring } = await createKeyring('old', FAST);
    await expect(changePassphrase(keyring, 'nope', 'new', FAST)).rejects.toBeInstanceOf(
      WrongPassphraseError,
    );
  });
});

describe('seal / open', () => {
  it('uses a fresh IV each time, so equal plaintexts give different ciphertexts', async () => {
    const { key } = await createKeyring('k', FAST);
    const a = await seal(key, bytes('same'), 'c');
    const b = await seal(key, bytes('same'), 'c');
    expect(a.iv).not.toEqual(b.iv);
    expect(a.data).not.toEqual(b.data);
  });

  it('does not leave the plaintext visible in the ciphertext', async () => {
    const { key } = await createKeyring('k', FAST);
    const sealed = await seal(key, bytes('password=hunter2'), 'c');
    expect(new TextDecoder().decode(sealed.data)).not.toContain('hunter2');
  });

  it('detects tampering', async () => {
    const { key } = await createKeyring('k', FAST);
    const sealed = await seal(key, bytes('evidence'), 'c');
    const first = sealed.data[0] ?? 0;
    sealed.data[0] = first ^ 0xff;
    await expect(open(key, sealed, 'c')).rejects.toBeInstanceOf(DecryptionError);
  });

  it('binds a ciphertext to its context, so records cannot be swapped', async () => {
    const { key } = await createKeyring('k', FAST);
    const sealed = await seal(key, bytes('finding A'), 'findings/A');
    await expect(open(key, sealed, 'findings/B')).rejects.toBeInstanceOf(DecryptionError);
  });

  it('cannot be opened with another data key', async () => {
    const a = await createKeyring('k', FAST);
    const b = await createKeyring('k', FAST);
    const sealed = await seal(a.key, bytes('x'), 'c');
    await expect(open(b.key, sealed, 'c')).rejects.toBeInstanceOf(DecryptionError);
  });
});
