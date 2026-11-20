import { useEffect, useRef, useState } from 'preact/hooks';
import { ImageImportError } from '../evidence/image';
import type { Project } from '../findings/model';
import { Errors } from '../storage/PassphraseFields';
import type { Vault } from '../storage/vault';
import { canvasReencode } from './files';
import {
  MAX_MISSION_BYTES,
  MISSION_EXTENSION,
  type OpenedMission,
  openMissionFile,
} from './mission';
import {
  type ConflictMode,
  existingProjects,
  missionCounts,
  type RestoreResult,
  restoreMission,
} from './repository';
import type { MissionContent } from './validate';

interface ButtonProps {
  vault: Vault;
  label: string;
  class?: string;
  onImported: (result: RestoreResult, message: string) => void;
}

/** A button that opens a `.pwnp` file (native file dialog in every browser) and imports it. */
export function OpenMissionButton({ vault, label, class: className, onImported }: ButtonProps) {
  const input = useRef<HTMLInputElement>(null);
  const [file, setFile] = useState<File | null>(null);
  return (
    <>
      <button type="button" class={className} onClick={() => input.current?.click()}>
        {label}
      </button>
      <input
        ref={input}
        type="file"
        accept={`${MISSION_EXTENSION},application/octet-stream`}
        hidden
        data-testid="mission-file"
        onChange={(e) => {
          const chosen = e.currentTarget.files?.[0] ?? null;
          e.currentTarget.value = '';
          setFile(chosen);
        }}
      />
      {file && (
        <OpenMissionDialog
          key={`${file.name}-${file.lastModified}`}
          vault={vault}
          file={file}
          onClose={(result, message) => {
            setFile(null);
            if (result && message) onImported(result, message);
          }}
        />
      )}
    </>
  );
}

type Step =
  | { name: 'reading' }
  | { name: 'error'; errors: string[] }
  | { name: 'passphrase'; open: (p: string) => Promise<OpenedMission>; errors: string[] }
  | { name: 'review'; content: MissionContent; existing: Project[] }
  | { name: 'importing' };

const plural = (n: number, word: string) => `${n} ${word}${n === 1 ? '' : 's'}`;

function OpenMissionDialog(props: {
  vault: Vault;
  file: File;
  onClose: (result?: RestoreResult, message?: string) => void;
}) {
  const { vault, file, onClose } = props;
  const ref = useRef<HTMLDialogElement>(null);
  const [step, setStep] = useState<Step>({ name: 'reading' });
  const [passphrase, setPassphrase] = useState('');
  const [conflict, setConflict] = useState<ConflictMode>('copy');
  const [withTheme, setWithTheme] = useState(false);
  const [errors, setErrors] = useState<string[]>([]);

  const handle = async (opened: OpenedMission) => {
    if (opened.status === 'error') setStep({ name: 'error', errors: opened.errors });
    else if (opened.status === 'needs-passphrase') {
      setStep({ name: 'passphrase', open: opened.open, errors: [] });
    } else {
      setStep({
        name: 'review',
        content: opened.content,
        existing: await existingProjects(vault, opened.content),
      });
    }
  };

  useEffect(() => {
    ref.current?.showModal();
    if (file.size > MAX_MISSION_BYTES) {
      setStep({ name: 'error', errors: ['This file is larger than 1 GB.'] });
      return;
    }
    void file
      .arrayBuffer()
      .then((buffer) => handle(openMissionFile(new Uint8Array(buffer))))
      .catch(() => setStep({ name: 'error', errors: ['This file could not be read.'] }));
  }, []);

  const unlock = async (event: Event) => {
    event.preventDefault();
    if (step.name !== 'passphrase') return;
    const open = step.open;
    setStep({ name: 'reading' });
    const opened = await open(passphrase);
    if (opened.status === 'error' && /Wrong passphrase/.test(opened.errors[0] ?? '')) {
      setStep({ name: 'passphrase', open, errors: opened.errors });
    } else await handle(opened);
  };

  const importNow = async () => {
    if (step.name !== 'review') return;
    const { content } = step;
    setStep({ name: 'importing' });
    try {
      const result = await restoreMission(vault, content, {
        conflict,
        theme: withTheme,
        reencode: canvasReencode,
      });
      const c = missionCounts(content);
      onClose(
        result,
        `Imported ${plural(c.projects, 'project')} (${plural(c.findings, 'finding')}, ` +
          `${plural(c.images, 'image')}, ${plural(c.scenarios, 'scenario')})` +
          (result.themeRestored ? ' and the slide theme.' : '.'),
      );
    } catch (e) {
      setErrors([
        e instanceof ImageImportError
          ? `An image in the file could not be processed: ${e.message} Nothing was imported.`
          : 'The import failed. Nothing was imported.',
      ]);
      setStep({ name: 'error', errors: [] });
    }
  };

  const busy = step.name === 'reading' || step.name === 'importing';

  return (
    <dialog
      ref={ref}
      class="dialog"
      aria-labelledby="open-mission-title"
      aria-busy={busy}
      onCancel={(e) => {
        e.preventDefault();
        if (step.name !== 'importing') onClose();
      }}
    >
      <h2 id="open-mission-title">Open {file.name}</h2>

      {step.name === 'reading' && <p role="status">Reading the file…</p>}
      {step.name === 'importing' && <p role="status">Importing…</p>}

      {step.name === 'error' && (
        <>
          <p>This file cannot be imported:</p>
          <Errors id="open-mission-errors" errors={[...step.errors, ...errors]} />
          <div class="dialog-actions">
            <button type="button" onClick={() => onClose()}>
              Close
            </button>
          </div>
        </>
      )}

      {step.name === 'passphrase' && (
        <form class="stack" onSubmit={(e) => void unlock(e)} noValidate>
          <p>This file is encrypted. Enter the passphrase it was saved with.</p>
          <label for="open-mission-passphrase">File passphrase</label>
          <input
            id="open-mission-passphrase"
            type="password"
            autocomplete="off"
            autofocus
            value={passphrase}
            onInput={(e) => setPassphrase(e.currentTarget.value)}
          />
          <Errors id="open-mission-errors" errors={step.errors} />
          <div class="dialog-actions">
            <button type="button" onClick={() => onClose()}>
              Cancel
            </button>
            <button type="submit" class="primary" disabled={!passphrase}>
              Unlock
            </button>
          </div>
        </form>
      )}

      {step.name === 'review' && (
        <Review
          content={step.content}
          existing={step.existing}
          conflict={conflict}
          onConflict={setConflict}
          withTheme={withTheme}
          onTheme={setWithTheme}
          onCancel={() => onClose()}
          onImport={() => void importNow()}
        />
      )}
    </dialog>
  );
}

function Review(p: {
  content: MissionContent;
  existing: Project[];
  conflict: ConflictMode;
  onConflict: (c: ConflictMode) => void;
  withTheme: boolean;
  onTheme: (v: boolean) => void;
  onCancel: () => void;
  onImport: () => void;
}) {
  const { content, existing } = p;
  const saved = content.exportedAt ? new Date(content.exportedAt).toLocaleString() : 'unknown';
  return (
    <div class="stack">
      <p>
        {content.scope === 'all' ? 'Full backup' : 'Mission file'} saved {saved}
        {content.appVersion && ` with PwnPoint v${content.appVersion}`}. It contains:
      </p>
      <ul data-testid="mission-contents">
        {content.projects.map(({ project, findings, evidence, scenarios }) => (
          <li key={project.id}>
            <strong>{project.name}</strong>: {plural(findings.length, 'finding')},{' '}
            {plural(evidence.length, 'image')}, {plural(scenarios.length, 'scenario')}
          </li>
        ))}
        {content.theme && <li>The slide theme “{content.theme.name}”</li>}
      </ul>

      {existing.length > 0 && (
        <fieldset>
          <legend>
            Already in this browser: {existing.map((e) => e.name).join(', ')}. What should happen?
          </legend>
          <label class="checkbox">
            <input
              type="radio"
              name="conflict"
              checked={p.conflict === 'copy'}
              onChange={() => p.onConflict('copy')}
            />
            Keep both (import as a copy)
          </label>
          <label class="checkbox">
            <input
              type="radio"
              name="conflict"
              checked={p.conflict === 'replace'}
              onChange={() => p.onConflict('replace')}
            />
            Replace with the file's version
          </label>
          {p.conflict === 'replace' && (
            <p class="warning">
              ⚠️ Changes made in this browser since the file was saved will be lost.
            </p>
          )}
        </fieldset>
      )}

      {content.theme && (
        <label class="checkbox">
          <input
            type="checkbox"
            checked={p.withTheme}
            onChange={(e) => p.onTheme(e.currentTarget.checked)}
          />
          Also use the file's slide theme (replaces the current one)
        </label>
      )}

      <p class="muted">Every screenshot is re-encoded on import; nothing in the file is run.</p>
      <div class="dialog-actions">
        <button type="button" onClick={p.onCancel}>
          Cancel
        </button>
        <button type="button" class="primary" onClick={p.onImport}>
          Import
        </button>
      </div>
    </div>
  );
}
