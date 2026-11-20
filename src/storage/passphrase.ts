export const MIN_PASSPHRASE_LENGTH = 12;

/** Problems with a new passphrase, phrased for the user. Empty when it is acceptable. */
export function passphraseProblems(passphrase: string, confirmation: string): string[] {
  const problems: string[] = [];
  if ([...passphrase].length < MIN_PASSPHRASE_LENGTH) {
    problems.push(
      `Use at least ${MIN_PASSPHRASE_LENGTH} characters. A few random words work well.`,
    );
  }
  if (passphrase.trim() !== passphrase) {
    problems.push('Remove spaces at the start or end: they are easy to forget.');
  }
  if (passphrase !== confirmation) problems.push('The two passphrases do not match.');
  return problems;
}
