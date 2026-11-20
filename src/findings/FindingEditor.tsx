import { useEffect, useState } from 'preact/hooks';
import { calculateBaseScore, type Severity } from '../cvss/cvss31';
import { CvssCalculator } from '../cvss/CvssCalculator';
import { EvidencePanel } from '../evidence/EvidencePanel';
import { SlidePreview } from '../slides/SlidePreview';
import type { Vault } from '../storage/vault';
import { LinesField, RichTextField, StepsField } from '../ui/fields';
import {
  cvssSeverity,
  effectiveSeverity,
  type Finding,
  findingProblems,
  findingRef,
  SEVERITIES,
} from './model';
import { DeleteFindingDialog } from './DeleteFindingDialog';
import { deleteFinding, getFinding, saveFinding } from './repository';
import { type SaveStatus, useAutosave } from './useAutosave';

const SAVE_TEXT: Record<SaveStatus, string> = {
  saved: 'All changes saved',
  unsaved: 'Unsaved changes…',
  saving: 'Saving…',
  error: 'Could not save. Your changes are still on screen; try again.',
};

/** Loads a finding, then shows the editor. */
export function FindingEditorPage({ vault, id }: { vault: Vault; id: string }) {
  const [finding, setFinding] = useState<Finding | null | undefined>(undefined);
  useEffect(() => {
    void getFinding(vault, id).then((f) => setFinding(f ?? null));
  }, [vault, id]);

  if (finding === undefined) return <p aria-busy="true">Loading…</p>;
  if (finding === null) {
    return (
      <div class="panel" role="alert">
        <h2>Finding not found</h2>
        <p>
          It may have been deleted. <a href="#/findings">Back to findings</a>
        </p>
      </div>
    );
  }
  return <FindingEditor key={finding.id} vault={vault} initial={finding} />;
}

function FindingEditor({ vault, initial }: { vault: Vault; initial: Finding }) {
  const [f, setF] = useState(initial);
  const [statusProblems, setStatusProblems] = useState<string[]>([]);
  const [askDelete, setAskDelete] = useState(false);
  const autosave = useAutosave(f, (value) => saveFinding(vault, value));
  const status = autosave.status;
  const update = (patch: Partial<Finding>) => setF((prev) => ({ ...prev, ...patch }));

  const score = calculateBaseScore(f.cvss).score;
  const severity = effectiveSeverity(f);
  const override = f.severityOverride;

  const setStatus = (next: Finding['status']) => {
    const problems = next === 'validated' ? findingProblems(f) : [];
    setStatusProblems(problems);
    if (!problems.length) update({ status: next });
  };

  return (
    <div class="editor-layout">
      <article class="editor" aria-labelledby="finding-heading">
        <header class="editor-head">
          <p class="row spread">
            <a href="#/findings">← Findings</a>
            <button type="button" class="small danger" onClick={() => setAskDelete(true)}>
              Delete finding
            </button>
          </p>
          <h2 id="finding-heading">
            <span class="ref">{findingRef(f.number)}</span> {f.title || 'Untitled finding'}
          </h2>
          <p class="row">
            <span class={`badge sev-${severity.toLowerCase()}`} data-testid="finding-severity">
              {severity}
            </span>
            <span>CVSS {score.toFixed(1)}</span>
            <span class="muted" role="status" data-testid="save-status">
              {SAVE_TEXT[status]}
            </span>
          </p>
        </header>

        <div class="field">
          <label for="f-title">Title</label>
          <input
            id="f-title"
            type="text"
            value={f.title}
            onInput={(e) => update({ title: e.currentTarget.value })}
          />
        </div>

        <div class="field">
          <label for="f-status">Status</label>
          <select
            id="f-status"
            value={f.status}
            aria-describedby="f-status-errors"
            onChange={(e) => setStatus(e.currentTarget.value as Finding['status'])}
          >
            <option value="draft">Draft</option>
            <option value="validated">Validated</option>
          </select>
          <ul id="f-status-errors" class="errors" role="alert">
            {statusProblems.map((p) => (
              <li key={p}>{p}</li>
            ))}
          </ul>
        </div>

        <LinesField
          id="f-assets"
          label="Affected assets"
          hint="One per line: hosts, URLs, applications."
          value={f.assets}
          onChange={(assets) => update({ assets })}
        />
        <RichTextField
          id="f-description"
          label="Description"
          value={f.description}
          onChange={(description) => update({ description })}
        />
        <RichTextField
          id="f-impact"
          label="Impact"
          value={f.impact}
          onChange={(impact) => update({ impact })}
        />
        <StepsField value={f.steps} onChange={(steps) => update({ steps })} />
        <RichTextField
          id="f-recommendation"
          label="Recommendation"
          value={f.recommendation}
          onChange={(recommendation) => update({ recommendation })}
        />
        <LinesField
          id="f-references"
          label="References"
          hint="One per line. Links are stored as text and never opened by PwnPoint."
          value={f.references}
          onChange={(references) => update({ references })}
        />

        <EvidencePanel vault={vault} finding={f} />

        <CvssCalculator value={f.cvss} onChange={(cvss) => update({ cvss })} />

        <fieldset class="field">
          <legend>Severity</legend>
          <p>
            From CVSS: <strong>{cvssSeverity(f)}</strong>
          </p>
          <label class="checkbox">
            <input
              type="checkbox"
              checked={!!override}
              onChange={(e) => {
                const next = { ...f };
                if (e.currentTarget.checked) {
                  next.severityOverride = { severity: cvssSeverity(f), justification: '' };
                } else {
                  delete next.severityOverride;
                }
                setF(next);
              }}
            />
            Override the severity
          </label>
          {override && (
            <div class="stack narrow">
              <label for="f-override-severity">Severity shown on slides</label>
              <select
                id="f-override-severity"
                value={override.severity}
                onChange={(e) =>
                  update({
                    severityOverride: { ...override, severity: e.currentTarget.value as Severity },
                  })
                }
              >
                {SEVERITIES.map((s) => (
                  <option key={s} value={s}>
                    {s}
                  </option>
                ))}
              </select>
              <label for="f-override-why">Justification (required)</label>
              <textarea
                id="f-override-why"
                rows={2}
                value={override.justification}
                aria-invalid={!override.justification.trim()}
                aria-describedby="f-override-why-hint"
                onInput={(e) =>
                  update({
                    severityOverride: { ...override, justification: e.currentTarget.value },
                  })
                }
              />
              <p
                id="f-override-why-hint"
                class={override.justification.trim() ? 'hint' : 'hint warning'}
              >
                {override.justification.trim()
                  ? 'The override is applied.'
                  : 'The override is ignored until you explain it.'}
              </p>
            </div>
          )}
        </fieldset>

        {askDelete && (
          <DeleteFindingDialog
            finding={f}
            onCancel={() => setAskDelete(false)}
            onConfirm={() => {
              autosave.cancel(); // otherwise the pending save would bring it back
              void deleteFinding(vault, f.id).then(() => {
                location.hash = '#/findings';
              });
            }}
          />
        )}
      </article>
      <aside class="editor-aside">
        <SlidePreview vault={vault} finding={f} />
      </aside>
    </div>
  );
}
