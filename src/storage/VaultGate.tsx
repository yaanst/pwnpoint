import type { ComponentChildren } from 'preact';
import { useEffect, useState } from 'preact/hooks';
import { PlainStorageRisk, RiskDialog } from '../ui/RiskDialog';
import { WrongPassphraseError } from './crypto';
import { passphraseProblems } from './passphrase';
import { Errors, PassphraseFields } from './PassphraseFields';
import { requestPersistence } from './persistence';
import { Vault } from './vault';

/** Opens the vault, then shows setup, unlock or the app depending on its state. */
export function VaultGate({ children }: { children: (vault: Vault) => ComponentChildren }) {
  const [vault, setVault] = useState<Vault | null>(null);
  const [failure, setFailure] = useState<string | null>(null);
  const [, refresh] = useState(0);
  const rerender = () => refresh((n) => n + 1);

  useEffect(() => {
    Vault.open()
      .then(setVault)
      .catch((e: unknown) => setFailure(e instanceof Error ? e.message : String(e)));
    // Settings can lock the vault; re-render so the unlock screen shows.
    addEventListener(VAULT_CHANGED, rerender);
    return () => removeEventListener(VAULT_CHANGED, rerender);
  }, []);

  if (failure) {
    return (
      <div class="panel" role="alert">
        <h2>Browser storage is not available</h2>
        <p>PwnPoint could not open its database: {failure}</p>
        <p>Private browsing windows and some privacy settings block storage.</p>
      </div>
    );
  }
  if (!vault) return <p aria-busy="true">Opening your local data…</p>;
  if (vault.state === 'setup') return <SetupScreen vault={vault} onDone={rerender} />;
  if (vault.state === 'locked') return <UnlockScreen vault={vault} onDone={rerender} />;
  return <>{children(vault)}</>;
}

const VAULT_CHANGED = 'pwnpoint:vault-changed';

/** Tells the gate the vault state changed outside it (e.g. "Lock now" in Settings). */
export function notifyVaultChanged(): void {
  dispatchEvent(new Event(VAULT_CHANGED));
}

function SetupScreen({ vault, onDone }: { vault: Vault; onDone: () => void }) {
  const [passphrase, setPassphrase] = useState('');
  const [confirmation, setConfirmation] = useState('');
  const [errors, setErrors] = useState<string[]>([]);
  const [busy, setBusy] = useState(false);
  const [askPlain, setAskPlain] = useState(false);

  const finish = async (choice: string | null) => {
    setBusy(true);
    await vault.setup(choice);
    void requestPersistence();
    onDone();
  };

  const submit = (event: Event) => {
    event.preventDefault();
    const problems = passphraseProblems(passphrase, confirmation);
    setErrors(problems);
    if (!problems.length) void finish(passphrase);
  };

  return (
    <section class="panel narrow" aria-labelledby="setup-title">
      <h2 id="setup-title">Protect your data</h2>
      <p>
        PwnPoint encrypts everything it stores in this browser with a passphrase. You will enter it
        each time you open PwnPoint.
      </p>
      <p>
        <strong>There is no recovery.</strong> If you forget the passphrase, the data stored in this
        browser is lost.
      </p>
      <form class="stack" onSubmit={submit} noValidate>
        <PassphraseFields
          idPrefix="setup"
          passphrase={passphrase}
          confirmation={confirmation}
          onPassphrase={setPassphrase}
          onConfirmation={setConfirmation}
        />
        <Errors id="setup-errors" errors={errors} />
        <button type="submit" class="primary" disabled={busy}>
          {busy ? 'Encrypting…' : 'Encrypt and continue'}
        </button>
      </form>
      <p>
        <button type="button" class="link" onClick={() => setAskPlain(true)}>
          Continue without encryption…
        </button>
      </p>
      {askPlain && (
        <RiskDialog
          title="Store data without encryption?"
          confirmLabel="Continue without encryption"
          onCancel={() => setAskPlain(false)}
          onConfirm={() => void finish(null)}
        >
          <PlainStorageRisk />
        </RiskDialog>
      )}
    </section>
  );
}

function UnlockScreen({ vault, onDone }: { vault: Vault; onDone: () => void }) {
  const [passphrase, setPassphrase] = useState('');
  const [error, setError] = useState<string[]>([]);
  const [busy, setBusy] = useState(false);

  const submit = async (event: Event) => {
    event.preventDefault();
    setBusy(true);
    try {
      await vault.unlock(passphrase);
      onDone();
    } catch (e) {
      setError([e instanceof WrongPassphraseError ? 'Wrong passphrase. Try again.' : String(e)]);
      setBusy(false);
    }
  };

  return (
    <section class="panel narrow" aria-labelledby="unlock-title">
      <h2 id="unlock-title">🔒 Unlock PwnPoint</h2>
      <form class="stack" onSubmit={(e) => void submit(e)} noValidate>
        <label for="unlock-passphrase">Passphrase</label>
        <input
          id="unlock-passphrase"
          type="password"
          autocomplete="current-password"
          autofocus
          value={passphrase}
          aria-invalid={error.length > 0}
          aria-describedby="unlock-errors"
          onInput={(e) => setPassphrase(e.currentTarget.value)}
        />
        <Errors id="unlock-errors" errors={error} />
        <button type="submit" class="primary" disabled={busy}>
          {busy ? 'Unlocking…' : 'Unlock'}
        </button>
      </form>
    </section>
  );
}
