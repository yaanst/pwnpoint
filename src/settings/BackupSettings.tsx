import { useState } from 'preact/hooks';
import { OpenMissionButton } from '../backup/OpenMission';
import { SaveMissionDialog } from '../backup/SaveMissionDialog';
import type { Vault } from '../storage/vault';

/** Back up every project (and the theme) to one file, or restore from a mission/backup file. */
export function BackupSettings({ vault }: { vault: Vault }) {
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState('');
  return (
    <section class="panel" aria-labelledby="backup-title">
      <h2 id="backup-title">Backup and mission files</h2>
      <p>
        Browser storage is not a backup: clearing site data, a browser reset or a new computer loses
        it. Save your work to <code>.pwnp</code> files. To save a single project, use{' '}
        <strong>Save mission file…</strong> on the Findings page.
      </p>
      <p class="row">
        <button type="button" onClick={() => setSaving(true)}>
          Back up everything…
        </button>
        <OpenMissionButton
          vault={vault}
          label="Restore from a file…"
          onImported={(_result, text) => setMessage(text)}
        />
      </p>
      <p role="status">{message}</p>
      {saving && (
        <SaveMissionDialog
          vault={vault}
          project={null}
          onClose={(text) => {
            setSaving(false);
            if (text) setMessage(text);
          }}
        />
      )}
    </section>
  );
}
