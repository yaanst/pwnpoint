import type { ComponentChildren } from 'preact';
import { useEffect, useRef } from 'preact/hooks';

interface Props {
  title: string;
  confirmLabel: string;
  danger?: boolean;
  onConfirm: () => void;
  onCancel: () => void;
  children: ComponentChildren;
}

/** Modal confirmation. Focus starts on Cancel so Enter never confirms by accident. */
export function ConfirmDialog({
  title,
  confirmLabel,
  danger,
  onConfirm,
  onCancel,
  children,
}: Props) {
  const ref = useRef<HTMLDialogElement>(null);
  const cancel = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    ref.current?.showModal();
    cancel.current?.focus();
  }, []);

  return (
    <dialog
      ref={ref}
      class="dialog"
      aria-labelledby="confirm-title"
      onCancel={(e) => {
        e.preventDefault();
        onCancel();
      }}
    >
      <h2 id="confirm-title">{title}</h2>
      <div class="dialog-body">{children}</div>
      <div class="dialog-actions">
        <button type="button" ref={cancel} onClick={onCancel}>
          Cancel
        </button>
        <button type="button" class={danger ? 'danger' : 'primary'} onClick={onConfirm}>
          {confirmLabel}
        </button>
      </div>
    </dialog>
  );
}
