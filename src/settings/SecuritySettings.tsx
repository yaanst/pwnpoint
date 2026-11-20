import { useEffect, useState } from 'preact/hooks';
import { WrongPassphraseError } from '../storage/crypto';
import { passphraseProblems } from '../storage/passphrase';
import { Errors, PassphraseFields } from '../storage/PassphraseFields';
import {
  type PersistenceStatus,
  persistenceStatus,
  requestPersistence,
} from '../storage/persistence';
import type { Vault } from '../storage/vault';
import { notifyVaultChanged } from '../storage/VaultGate';
import { PlainStorageRisk, RiskDialog } from '../ui/RiskDialog';

const PERSISTENCE_TEXT: Record<PersistenceStatus, string> = {
  persistent: 'Persistent: the browser will not delete PwnPoint data to free up space.',
  'best-effort':
    'Best effort: the browser may delete PwnPoint data when disk space runs low. Save mission files to keep copies.',
  unsupported: 'Unknown: this browser does not report whether storage is persistent.',
};

export function SecuritySettings({ vault }: { vault: Vault }) {
  const [persistence, setPersistence] = useState<PersistenceStatus | null>(null);
  const [asking, setAsking] = useState(false);
  const [encrypted, setEncrypted] = useState(vault.encrypted);
  const [askDisable, setAskDisable] = useState(false);
  const [message, setMessage] = useState('');

  useEffect(() => {
    void persistenceStatus().then(setPersistence);
  }, []);

  const disable = async () => {
    setAskDisable(false);
    await vault.disableEncryption();
    setEncrypted(false);
    setMessage('Encryption is off. Your data is now stored in clear.');
  };

  return (
    <section class="panel" aria-labelledby="security-title">
      <h2 id="security-title">Security and storage</h2>

      <h3>Encryption at rest</h3>
      {encrypted ? (
        <>
          <p data-testid="encryption-status">
            ✅ <strong>On.</strong> Everything stored in this browser is encrypted with your
            passphrase (AES-GCM 256, key derived with PBKDF2-SHA256).
          </p>
          <p class="row">
            <button
              type="button"
              onClick={() => {
                vault.lock();
                notifyVaultChanged();
              }}
            >
              Lock now
            </button>
            <button type="button" class="danger" onClick={() => setAskDisable(true)}>
              Turn off encryption…
            </button>
          </p>
          <ChangePassphrase vault={vault} />
        </>
      ) : (
        <>
          <p data-testid="encryption-status" class="warning">
            ⚠️ <strong>Off.</strong> Your data is stored in clear in this browser.
          </p>
          <PlainStorageRisk />
          <EnableEncryption
            vault={vault}
            onDone={() => {
              setEncrypted(true);
              setMessage('Encryption is on.');
            }}
          />
        </>
      )}
      <p role="status">{message}</p>

      <h3>Storage persistence</h3>
      <p data-testid="persistence-status">
        {persistence ? PERSISTENCE_TEXT[persistence] : 'Checking…'}
      </p>
      {persistence === 'best-effort' && (
        <p class="row">
          <button
            type="button"
            disabled={asking}
            onClick={() => {
              setAsking(true);
              void requestPersistence().then((status) => {
                setPersistence(status);
                setAsking(false);
              });
            }}
          >
            {asking
              ? 'Waiting for your answer in the browser…'
              : 'Ask the browser to keep this data'}
          </button>
        </p>
      )}

      {askDisable && (
        <RiskDialog
          title="Turn off encryption?"
          confirmLabel="Turn off encryption"
          onCancel={() => setAskDisable(false)}
          onConfirm={() => void disable()}
        >
          <PlainStorageRisk />
        </RiskDialog>
      )}
    </section>
  );
}

function EnableEncryption({ vault, onDone }: { vault: Vault; onDone: () => void }) {
  const [passphrase, setPassphrase] = useState('');
  const [confirmation, setConfirmation] = useState('');
  const [errors, setErrors] = useState<string[]>([]);

  const submit = async (event: Event) => {
    event.preventDefault();
    const problems = passphraseProblems(passphrase, confirmation);
    setErrors(problems);
    if (problems.length) return;
    await vault.enableEncryption(passphrase);
    onDone();
  };

  return (
    <form class="stack narrow" onSubmit={(e) => void submit(e)} noValidate>
      <PassphraseFields
        idPrefix="enable"
        label="New passphrase"
        passphrase={passphrase}
        confirmation={confirmation}
        onPassphrase={setPassphrase}
        onConfirmation={setConfirmation}
      />
      <Errors id="enable-errors" errors={errors} />
      <button type="submit" class="primary">
        Turn on encryption
      </button>
    </form>
  );
}

function ChangePassphrase({ vault }: { vault: Vault }) {
  const [current, setCurrent] = useState('');
  const [passphrase, setPassphrase] = useState('');
  const [confirmation, setConfirmation] = useState('');
  const [errors, setErrors] = useState<string[]>([]);
  const [done, setDone] = useState(false);

  const submit = async (event: Event) => {
    event.preventDefault();
    setDone(false);
    const problems = passphraseProblems(passphrase, confirmation);
    setErrors(problems);
    if (problems.length) return;
    try {
      await vault.changePassphrase(current, passphrase);
      setCurrent('');
      setPassphrase('');
      setConfirmation('');
      setDone(true);
    } catch (e) {
      setErrors([
        e instanceof WrongPassphraseError ? 'The current passphrase is wrong.' : String(e),
      ]);
    }
  };

  return (
    <details>
      <summary>Change passphrase</summary>
      <form class="stack narrow" onSubmit={(e) => void submit(e)} noValidate>
        <label for="change-current">Current passphrase</label>
        <input
          id="change-current"
          type="password"
          autocomplete="current-password"
          value={current}
          onInput={(e) => setCurrent(e.currentTarget.value)}
        />
        <PassphraseFields
          idPrefix="change"
          label="New passphrase"
          passphrase={passphrase}
          confirmation={confirmation}
          onPassphrase={setPassphrase}
          onConfirmation={setConfirmation}
        />
        <Errors id="change-errors" errors={errors} />
        <button type="submit">Change passphrase</button>
        {done && <p role="status">Passphrase changed.</p>}
      </form>
    </details>
  );
}
