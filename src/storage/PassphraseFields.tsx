import { MIN_PASSPHRASE_LENGTH } from './passphrase';

interface Props {
  idPrefix: string;
  passphrase: string;
  confirmation: string;
  onPassphrase: (v: string) => void;
  onConfirmation: (v: string) => void;
  label?: string;
}

/** New-passphrase and confirmation inputs. */
export function PassphraseFields(p: Props) {
  return (
    <>
      <label for={`${p.idPrefix}-new`}>{p.label ?? 'Passphrase'}</label>
      <input
        id={`${p.idPrefix}-new`}
        type="password"
        autocomplete="new-password"
        minLength={MIN_PASSPHRASE_LENGTH}
        value={p.passphrase}
        onInput={(e) => p.onPassphrase(e.currentTarget.value)}
      />
      <label for={`${p.idPrefix}-confirm`}>Type it again</label>
      <input
        id={`${p.idPrefix}-confirm`}
        type="password"
        autocomplete="new-password"
        value={p.confirmation}
        onInput={(e) => p.onConfirmation(e.currentTarget.value)}
      />
    </>
  );
}

export function Errors({ id, errors }: { id: string; errors: string[] }) {
  return (
    <div id={id} role="alert">
      {errors.length > 0 && (
        <ul class="errors">
          {errors.map((e) => (
            <li key={e}>{e}</li>
          ))}
        </ul>
      )}
    </div>
  );
}
