import { useEffect, useMemo, useState } from 'preact/hooks';
import type { Finding } from '../findings/model';
import { listFindings } from '../findings/repository';
import { type SaveStatus, useAutosave } from '../findings/useAutosave';
import type { Vault } from '../storage/vault';
import { RichTextField } from '../ui/fields';
import { FindingPicker } from './FindingPicker';
import { findingStep, type Scenario, scenarioProblems, scenarioRef, techniqueStep } from './model';
import { RatingFields } from './RatingFields';
import { deleteScenario, getScenario, newStepId, saveScenario } from './repository';
import { DeleteScenarioDialog } from './ScenariosPage';
import { ScenarioPreview } from './ScenarioPreview';
import { StepList } from './StepList';

const SAVE_TEXT: Record<SaveStatus, string> = {
  saved: 'All changes saved',
  unsaved: 'Unsaved changes…',
  saving: 'Saving…',
  error: 'Could not save. Your changes are still on screen; try again.',
};

export function ScenarioEditorPage({ vault, id }: { vault: Vault; id: string }) {
  const [scenario, setScenario] = useState<Scenario | null | undefined>(undefined);
  const [findings, setFindings] = useState<Finding[] | null>(null);
  useEffect(() => {
    void getScenario(vault, id).then(async (s) => {
      setScenario(s ?? null);
      if (s) setFindings(await listFindings(vault, s.projectId));
    });
  }, [vault, id]);

  if (scenario === undefined || (scenario && !findings)) return <p aria-busy="true">Loading…</p>;
  if (scenario === null) {
    return (
      <div class="panel" role="alert">
        <h2>Scenario not found</h2>
        <p>
          It may have been deleted. <a href="#/scenarios">Back to scenarios</a>
        </p>
      </div>
    );
  }
  return (
    <ScenarioEditor key={scenario.id} vault={vault} initial={scenario} findings={findings ?? []} />
  );
}

function ScenarioEditor({
  vault,
  initial,
  findings,
}: {
  vault: Vault;
  initial: Scenario;
  findings: Finding[];
}) {
  const [s, setS] = useState(initial);
  const [askDelete, setAskDelete] = useState(false);
  const autosave = useAutosave(s, (value) => saveScenario(vault, value));
  const update = (patch: Partial<Scenario>) => setS((prev) => ({ ...prev, ...patch }));
  const byId = useMemo(() => new Map(findings.map((f) => [f.id, f])), [findings]);
  const problems = scenarioProblems(s, byId);
  const sorted = useMemo(() => [...findings].sort((a, b) => a.number - b.number), [findings]);

  return (
    <div class="editor-layout">
      <article class="editor" aria-labelledby="scenario-heading">
        <header class="editor-head">
          <p class="row spread">
            <a href="#/scenarios">← Scenarios</a>
            <button type="button" class="small danger" onClick={() => setAskDelete(true)}>
              Delete scenario
            </button>
          </p>
          <h2 id="scenario-heading">
            <span class="ref">{scenarioRef(s.number)}</span> {s.title || 'Untitled scenario'}
          </h2>
          <p class="muted" role="status" data-testid="save-status">
            {SAVE_TEXT[autosave.status]}
          </p>
        </header>

        <div class="field">
          <label for="s-title">Title</label>
          <input
            id="s-title"
            type="text"
            placeholder="e.g. From the guest Wi-Fi to domain admin"
            value={s.title}
            onInput={(e) => update({ title: e.currentTarget.value })}
          />
        </div>
        <div class="field">
          <label for="s-start">Starting position</label>
          <input
            id="s-start"
            type="text"
            placeholder="e.g. Unauthenticated, on the guest Wi-Fi"
            value={s.start}
            onInput={(e) => update({ start: e.currentTarget.value })}
          />
        </div>
        <div class="field">
          <label for="s-goal">Goal</label>
          <input
            id="s-goal"
            type="text"
            placeholder="e.g. Domain admin"
            value={s.goal}
            onInput={(e) => update({ goal: e.currentTarget.value })}
          />
        </div>
        <RichTextField
          id="s-context"
          label="Context"
          rows={3}
          value={s.context}
          onChange={(context) => update({ context })}
        />

        <fieldset class="field">
          <legend>Attack path</legend>
          {s.steps.length === 0 && (
            <p class="muted">
              Add the findings and techniques in the order the attacker uses them.
            </p>
          )}
          <StepList steps={s.steps} findings={byId} onChange={(steps) => update({ steps })} />
          <div class="row add-step">
            <FindingPicker
              findings={sorted}
              onPick={(f) => update({ steps: [...s.steps, findingStep(newStepId(), f.id)] })}
            />
            <button
              type="button"
              class="small"
              onClick={() => update({ steps: [...s.steps, techniqueStep(newStepId())] })}
            >
              + Add technique
            </button>
          </div>
          {problems.length > 0 && (
            <ul class="errors" data-testid="scenario-problems">
              {problems.map((p) => (
                <li key={p}>{p}</li>
              ))}
            </ul>
          )}
        </fieldset>

        <RatingFields scenario={s} findings={byId} onChange={update} />
      </article>
      <aside class="editor-aside">
        <ScenarioPreview vault={vault} scenario={s} findings={findings} />
      </aside>
      {askDelete && (
        <DeleteScenarioDialog
          scenario={s}
          onCancel={() => setAskDelete(false)}
          onConfirm={() => {
            autosave.cancel();
            void deleteScenario(vault, s.id).then(() => {
              location.hash = '#/scenarios';
            });
          }}
        />
      )}
    </div>
  );
}
