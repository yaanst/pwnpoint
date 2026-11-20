import type { ComponentChildren } from 'preact';
import { useEffect, useRef, useState } from 'preact/hooks';

interface Props {
  title: string;
  confirmLabel: string;
  onConfirm: () => void;
  onCancel: () => void;
  children: ComponentChildren;
}

/** Modal dialog that only allows confirming after the user ticks "I understand the risk". */
export function RiskDialog({ title, confirmLabel, onConfirm, onCancel, children }: Props) {
  const ref = useRef<HTMLDialogElement>(null);
  const [understood, setUnderstood] = useState(false);

  useEffect(() => {
    ref.current?.showModal();
  }, []);

  return (
    <dialog
      ref={ref}
      class="dialog"
      aria-labelledby="risk-title"
      onCancel={(e) => {
        e.preventDefault();
        onCancel();
      }}
    >
      <h2 id="risk-title">⚠️ {title}</h2>
      <div class="dialog-body">{children}</div>
      <label class="checkbox">
        <input
          type="checkbox"
          checked={understood}
          onChange={(e) => setUnderstood(e.currentTarget.checked)}
        />
        I understand the risk
      </label>
      <div class="dialog-actions">
        <button type="button" onClick={onCancel}>
          Cancel
        </button>
        <button type="button" class="danger" disabled={!understood} onClick={onConfirm}>
          {confirmLabel}
        </button>
      </div>
    </dialog>
  );
}

export function PlainStorageRisk() {
  return (
    <>
      <p>
        Without encryption, your findings and screenshots are stored <strong>in clear</strong> in
        this browser's storage.
      </p>
      <ul>
        <li>
          Any other HTML file you open from disk in this browser can read them: browsers share
          storage between all local files.
        </li>
        <li>Anyone with access to your browser profile or a backup of it can read them.</li>
      </ul>
      <p>Only do this on a device and browser profile dedicated to this work.</p>
    </>
  );
}
