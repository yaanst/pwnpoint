import { describe, expect, it } from 'vitest';
import { passphraseProblems } from './passphrase';

describe('passphraseProblems', () => {
  it('accepts a long passphrase typed twice', () => {
    expect(passphraseProblems('correct horse battery', 'correct horse battery')).toEqual([]);
  });

  it('requires at least 12 characters, counting emoji as one', () => {
    expect(passphraseProblems('short', 'short')[0]).toMatch(/at least 12/);
    expect(passphraseProblems('🔒'.repeat(11), '🔒'.repeat(11))[0]).toMatch(/at least 12/);
  });

  it('flags leading or trailing spaces', () => {
    expect(passphraseProblems(' correct horse battery', ' correct horse battery')).toEqual([
      'Remove spaces at the start or end: they are easy to forget.',
    ]);
  });

  it('requires the confirmation to match', () => {
    expect(passphraseProblems('correct horse battery', 'correct horse batery')).toEqual([
      'The two passphrases do not match.',
    ]);
  });
});
