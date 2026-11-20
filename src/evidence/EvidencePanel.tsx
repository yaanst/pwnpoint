import { useEffect, useMemo, useRef, useState } from 'preact/hooks';
import type { Finding } from '../findings/model';
import type { Vault } from '../storage/vault';
import { formatBytes, storageUsage, storageWarning } from '../storage/usage';
import { trackSave } from '../findings/pendingSaves';
import { ConfirmDialog } from '../ui/ConfirmDialog';
import { createDebouncer } from '../ui/debounce';
import { ACCEPTED_TYPES, ImageImportError, MAX_WIDTH, processImage } from './image';
import {
  addEvidence,
  deleteEvidence,
  type Evidence,
  getEvidenceBytes,
  listEvidence,
  moveItem,
  saveEvidence,
  saveOrder,
} from './repository';

const isTextField = (el: EventTarget | null) =>
  el instanceof HTMLElement &&
  (el.isContentEditable || ['INPUT', 'TEXTAREA', 'SELECT'].includes(el.tagName));

/**
 * Files from a paste. A copied screenshot is often only exposed as a clipboard *item* (not in
 * `files`), depending on the browser and OS, so read both.
 */
function clipboardFiles(data: DataTransfer | null): File[] {
  if (!data) return [];
  const files = [...data.files];
  if (files.length) return files;
  return [...data.items]
    .filter((item) => item.kind === 'file')
    .map((item) => item.getAsFile())
    .filter((f): f is File => f !== null);
}

export function EvidencePanel({ vault, finding }: { vault: Vault; finding: Finding }) {
  const [items, setItems] = useState<Evidence[]>([]);
  const [urls, setUrls] = useState<Record<string, string>>({});
  const [message, setMessage] = useState('');
  const [errors, setErrors] = useState<string[]>([]);
  const [warning, setWarning] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [dragOver, setDragOver] = useState(false);
  const [toDelete, setToDelete] = useState<Evidence | null>(null);
  const dragIndex = useRef<number | null>(null);
  const fileInput = useRef<HTMLInputElement>(null);

  const refresh = async () => setItems(await listEvidence(vault, finding.id));

  useEffect(() => {
    void refresh();
    void storageUsage().then((u) => setWarning(storageWarning(u)));
  }, [vault, finding.id]);

  // Object URLs for thumbnails; revoked when items go away.
  useEffect(() => {
    let cancelled = false;
    const created: string[] = [];
    void (async () => {
      const next: Record<string, string> = {};
      for (const e of items) {
        const bytes = await getEvidenceBytes(vault, e.id);
        if (!bytes || cancelled) continue;
        const url = URL.createObjectURL(new Blob([bytes], { type: 'image/png' }));
        created.push(url);
        next[e.id] = url;
      }
      if (!cancelled) setUrls(next);
    })();
    return () => {
      cancelled = true;
      created.forEach((u) => URL.revokeObjectURL(u));
    };
  }, [vault, items.map((e) => `${e.id}:${e.byteLength}`).join()]);

  const importFiles = async (files: File[]) => {
    const images = files.filter((f) => f.type.startsWith('image/') || f.type === '');
    if (!images.length) return;
    setBusy(true);
    setMessage('');
    const problems: string[] = [];
    let added = 0;
    let scaled = 0;
    for (const file of images) {
      try {
        const img = await processImage(file);
        await addEvidence(vault, { findingId: finding.id, projectId: finding.projectId }, img);
        added++;
        if (img.originalWidth > MAX_WIDTH) scaled++;
      } catch (e) {
        const reason = e instanceof ImageImportError ? e.message : 'It could not be imported.';
        problems.push(`${file.name || 'Pasted image'}: ${reason}`);
      }
    }
    await refresh();
    setErrors(problems);
    setMessage(
      added
        ? `Added ${added} image${added > 1 ? 's' : ''}, metadata removed` +
            (scaled ? `; ${scaled} downscaled to ${MAX_WIDTH} px wide.` : '.')
        : '',
    );
    setWarning(storageWarning(await storageUsage()));
    setBusy(false);
  };

  // Paste anywhere on the editor page, except inside a text field.
  useEffect(() => {
    const onPaste = (e: ClipboardEvent) => {
      if (isTextField(e.target) && !(e.target as HTMLElement).closest('.evidence')) return;
      const files = clipboardFiles(e.clipboardData);
      if (!files.length) return;
      e.preventDefault();
      void importFiles(files);
    };
    document.addEventListener('paste', onPaste);
    return () => document.removeEventListener('paste', onPaste);
  });

  const reorder = async (from: number, to: number) => {
    const next = moveItem(items, from, to);
    if (next !== items) setItems(await saveOrder(vault, next));
  };

  const hasFiles = (e: DragEvent) => !!e.dataTransfer?.types.includes('Files');

  return (
    <section class="field evidence" aria-labelledby="evidence-title">
      <h3 id="evidence-title">Evidence</h3>
      <div
        class={`dropzone${dragOver ? ' over' : ''}`}
        tabIndex={0}
        role="group"
        aria-label="Add evidence: paste, drop or choose images"
        aria-describedby="evidence-help"
        onDragOver={(e) => {
          if (!hasFiles(e)) return;
          e.preventDefault();
          setDragOver(true);
        }}
        onDragLeave={() => setDragOver(false)}
        onDrop={(e) => {
          if (!hasFiles(e)) return;
          e.preventDefault();
          setDragOver(false);
          void importFiles([...(e.dataTransfer?.files ?? [])]);
        }}
      >
        <p id="evidence-help">
          Paste a screenshot (Ctrl/Cmd+V), drop images here, or{' '}
          <button type="button" class="link" onClick={() => fileInput.current?.click()}>
            choose files
          </button>
          . Metadata is removed and images wider than {MAX_WIDTH} px are downscaled.
        </p>
        <input
          ref={fileInput}
          type="file"
          accept={ACCEPTED_TYPES.join(',')}
          multiple
          hidden
          data-testid="evidence-file"
          onChange={(e) => {
            const files = [...(e.currentTarget.files ?? [])];
            e.currentTarget.value = '';
            void importFiles(files);
          }}
        />
      </div>
      <p role="status" class="muted" aria-busy={busy}>
        {busy ? 'Importing…' : message}
      </p>
      <ul class="errors" role="alert">
        {errors.map((e) => (
          <li key={e}>{e}</li>
        ))}
      </ul>
      {warning && (
        <p class="warning" role="alert">
          {warning}
        </p>
      )}

      {items.length > 0 && (
        <ol class="evidence-list">
          {items.map((e, i) => (
            <li
              key={e.id}
              draggable
              data-testid={`evidence-${i + 1}`}
              onDragStart={() => (dragIndex.current = i)}
              onDragOver={(ev) => {
                if (dragIndex.current !== null) ev.preventDefault();
              }}
              onDrop={(ev) => {
                if (dragIndex.current === null) return;
                ev.preventDefault();
                void reorder(dragIndex.current, i);
                dragIndex.current = null;
              }}
              onDragEnd={() => (dragIndex.current = null)}
            >
              {urls[e.id] ? (
                <img
                  src={urls[e.id]}
                  alt={e.caption || `Evidence ${i + 1}`}
                  width={e.width}
                  height={e.height}
                />
              ) : (
                <div class="thumb-placeholder" aria-hidden="true" />
              )}
              <div class="evidence-meta">
                <CaptionInput
                  evidence={e}
                  index={i}
                  onSave={async (caption) => {
                    const next = { ...e, caption };
                    await trackSave(saveEvidence(vault, next));
                    setItems((list) => list.map((x) => (x.id === e.id ? next : x)));
                    setMessage('Caption saved.');
                  }}
                />
                <span class="muted small-text">
                  {e.width} × {e.height} px · {formatBytes(e.byteLength)}
                </span>
                <span class="row">
                  <button
                    type="button"
                    class="small"
                    aria-label={`Move evidence ${i + 1} up`}
                    disabled={i === 0}
                    onClick={() => void reorder(i, i - 1)}
                  >
                    ↑
                  </button>
                  <button
                    type="button"
                    class="small"
                    aria-label={`Move evidence ${i + 1} down`}
                    disabled={i === items.length - 1}
                    onClick={() => void reorder(i, i + 1)}
                  >
                    ↓
                  </button>
                  <button
                    type="button"
                    class="small danger"
                    aria-label={`Delete evidence ${i + 1}`}
                    onClick={() => setToDelete(e)}
                  >
                    Delete
                  </button>
                </span>
              </div>
            </li>
          ))}
        </ol>
      )}

      {toDelete && (
        <ConfirmDialog
          title="Delete this screenshot?"
          confirmLabel="Delete screenshot"
          danger
          onCancel={() => setToDelete(null)}
          onConfirm={() => {
            const target = toDelete;
            setToDelete(null);
            void deleteEvidence(vault, target).then(refresh);
          }}
        >
          <p>
            {toDelete.caption || 'This screenshot'} will be removed from the finding. This cannot be
            undone.
          </p>
        </ConfirmDialog>
      )}
    </section>
  );
}

function CaptionInput(props: {
  evidence: Evidence;
  index: number;
  onSave: (caption: string) => Promise<void>;
}) {
  const [value, setValue] = useState(props.evidence.caption);
  const latest = useRef(value);
  latest.current = value;
  const saved = useRef(props.evidence.caption);
  // Saves 500 ms after typing stops, and at once on blur, Enter or unmount.
  const debouncer = useMemo(
    () =>
      createDebouncer(() => {
        if (latest.current === saved.current) return;
        saved.current = latest.current;
        void props.onSave(latest.current);
      }, 500),
    [],
  );
  useEffect(() => () => debouncer.flush(), [debouncer]);
  const id = `caption-${props.evidence.id}`;
  return (
    <>
      <label for={id} class="visually-hidden">
        Caption for evidence {props.index + 1}
      </label>
      <input
        id={id}
        type="text"
        placeholder="Caption"
        value={value}
        onInput={(e) => {
          setValue(e.currentTarget.value);
          debouncer.schedule();
        }}
        onBlur={() => debouncer.flush()}
        onKeyDown={(e) => {
          if (e.key === 'Enter') e.currentTarget.blur();
        }}
      />
    </>
  );
}
