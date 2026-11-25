import { useEffect, useRef, useState } from 'preact/hooks';
import { safeFileName } from '../export/collect';
import type { Project } from '../findings/model';
import { passphraseProblems } from '../storage/passphrase';
import { Errors, PassphraseFields } from '../storage/PassphraseFields';
import type { Vault } from '../storage/vault';
import { chooseSaveTarget, hasNativeSaveDialog, today, writeToTarget } from './files';
import { buildMissionFile, MISSION_EXTENSION } from './mission';
import { collectMission, missionCounts } from './repository';

interface Props {
  vault: Vault;
  /** One project (a mission file), or null for a backup of everything. */
  project: Project | null;
  onClose: (message?: string) => void;
}

const plural = (n: number, word: string) => `${n} ${word}${n === 1 ? '' : 's'}`;

/** Saves one project, or everything, to a `.pwnp` file. Encrypted by default. */
export function SaveMissionDialog({ vault, project, onClose }: Props) {
  const ref = useRef<HTMLDialogElement>(null);
  const [encrypt, setEncrypt] = useState(true);
  const [passphrase, setPassphrase] = useState('');
  const [confirmation, setConfirmation] = useState('');
  const [errors, setErrors] = useState<string[]>([]);
  const [busy, setBusy] = useState(false);

  useEffect(() => ref.current?.showModal(), []);

  const title = project ? 'Save mission file' : 'Back up everything';
  const fileName =
    (project ? safeFileName(project.name, 'mission') : `pwnpoint-backup-${today()}`) +
    MISSION_EXTENSION;

  const save = async (event: Event) => {
    event.preventDefault();
    const problems = encrypt ? passphraseProblems(passphrase, confirmation) : [];
    setErrors(problems);
    if (problems.length) return;
    // Ask for the destination first: the save dialog needs the click's user gesture.
    const target = await chooseSaveTarget(fileName);
    if (!target) return;
    setBusy(true);
    try {
      const content = await collectMission(vault, project ? { projectId: project.id } : 'all');
      const bytes = await buildMissionFile(content, {
        passphrase: encrypt ? passphrase : null,
        appVersion: __APP_VERSION__,
      });
      await writeToTarget(target, bytes);
      const c = missionCounts(content);
      const what = project
        ? `${plural(c.findings, 'finding')}, ${plural(c.images, 'image')}, ${plural(c.scenarios, 'scenario')}` +
          (c.recommendations ? `, ${plural(c.recommendations, 'recommendation')}` : '')
        : `${plural(c.projects, 'project')}, ${plural(c.findings, 'finding')}`;
      const verb = target.kind === 'download' ? 'downloaded' : 'saved';
      onClose(
        `${encrypt ? 'Encrypted file' : 'File'} ${verb}: ${target.name} (${what}).` +
          (encrypt ? ' Keep the passphrase: without it the file cannot be opened.' : ''),
      );
    } catch (e) {
      setErrors([e instanceof Error ? e.message : 'The file could not be saved.']);
      setBusy(false);
    }
  };

  return (
    <dialog
      ref={ref}
      class="dialog"
      aria-labelledby="save-mission-title"
      onCancel={(e) => {
        e.preventDefault();
        if (!busy) onClose();
      }}
    >
      <h2 id="save-mission-title">{title}</h2>
      <form class="stack" onSubmit={(e) => void save(e)} noValidate>
        <p>
          {project ? (
            <>
              Saves <strong>{project.name}</strong> (findings, screenshots and scenarios) to a{' '}
              <code>{MISSION_EXTENSION}</code> file you can keep, move to another computer and open
              again.
            </>
          ) : (
            <>
              Saves every project and the slide theme to one <code>{MISSION_EXTENSION}</code> file.
              Use it to move PwnPoint to another browser or to keep a copy.
            </>
          )}
        </p>
        <label class="checkbox">
          <input
            type="checkbox"
            checked={encrypt}
            onChange={(e) => setEncrypt(e.currentTarget.checked)}
          />
          Encrypt the file with a passphrase
        </label>
        {encrypt ? (
          <>
            <PassphraseFields
              idPrefix="mission"
              label="File passphrase"
              passphrase={passphrase}
              confirmation={confirmation}
              onPassphrase={setPassphrase}
              onConfirmation={setConfirmation}
            />
            <p class="muted">
              AES-GCM 256, key derived with PBKDF2-SHA256. It can be your PwnPoint passphrase or
              another one, for example one shared with a colleague.
            </p>
          </>
        ) : (
          <p class="warning" data-testid="plain-file-warning">
            ⚠️ Without encryption, anyone who gets this file can read every finding and screenshot
            in it.
          </p>
        )}
        <Errors id="mission-save-errors" errors={errors} />
        <p class="muted">
          {hasNativeSaveDialog()
            ? 'You will choose where to save the file.'
            : 'The file goes to your downloads folder.'}
        </p>
        <div class="dialog-actions">
          <button type="button" disabled={busy} onClick={() => onClose()}>
            Cancel
          </button>
          <button type="submit" class="primary" disabled={busy} aria-busy={busy}>
            {busy ? 'Saving…' : 'Save…'}
          </button>
        </div>
      </form>
    </dialog>
  );
}
