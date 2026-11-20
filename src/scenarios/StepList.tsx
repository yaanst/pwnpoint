import { useState } from 'preact/hooks';
import type { Finding } from '../findings/model';
import { findingHref } from '../ui/router';
import { isEnabled } from '../flags';
import { cleanLinks, successors } from './graph';
import { moveStep, type ScenarioStep, stepView, validMitreId } from './model';

/**
 * Ordered scenario steps. Reorder by dragging a step's handle, with the ↑/↓ buttons, or with
 * Alt+Arrow keys anywhere in a step. Each move is announced to screen readers.
 */
export function StepList({
  steps,
  findings,
  onChange,
}: {
  steps: ScenarioStep[];
  findings: Map<string, Finding>;
  onChange: (steps: ScenarioStep[]) => void;
}) {
  const [dragging, setDragging] = useState<number | null>(null);
  const [announce, setAnnounce] = useState('');

  const move = (from: number, to: number) => {
    if (to < 0 || to >= steps.length || from === to) return;
    onChange(cleanLinks(moveStep(steps, from, to)));
    setAnnounce(`Step ${from + 1} moved to position ${to + 1} of ${steps.length}.`);
  };
  const patch = (i: number, p: Partial<ScenarioStep>) =>
    onChange(steps.map((s, j) => (j === i ? { ...s, ...p } : s)));
  const branches = isEnabled('scenarioBranches');
  const succ = successors(steps, branches);
  const label = (j: number) => {
    const st = steps[j];
    const v = st && stepView(st, findings);
    const name =
      !st || !v || v.missing ? 'missing finding' : [v.tag, v.title].filter(Boolean).join(' ');
    return `Step ${j + 1}${name ? `: ${name}` : ''}`;
  };

  return (
    <>
      <ol class="scenario-steps" aria-label="Steps">
        {steps.map((step, i) => {
          const v = stepView(step, findings);
          const f = step.findingId ? findings.get(step.findingId) : undefined;
          const n = i + 1;
          return (
            <li
              key={step.id}
              class={`scenario-step${dragging === i ? ' dragging' : ''}${step.chainBreaker ? ' breaker' : ''}`}
              data-testid={`step-${n}`}
              onDragOver={(e) => {
                if (dragging === null) return;
                e.preventDefault();
                if (e.dataTransfer) e.dataTransfer.dropEffect = 'move';
              }}
              onDrop={(e) => {
                e.preventDefault();
                if (dragging !== null) move(dragging, i);
                setDragging(null);
              }}
              onKeyDown={(e) => {
                if (!e.altKey || (e.key !== 'ArrowUp' && e.key !== 'ArrowDown')) return;
                e.preventDefault();
                move(i, e.key === 'ArrowUp' ? i - 1 : i + 1);
              }}
            >
              <div class="step-head">
                <span
                  class="drag-handle"
                  draggable
                  title="Drag to reorder (or Alt+↑/↓)"
                  aria-hidden="true"
                  onDragStart={(e) => {
                    setDragging(i);
                    // Firefox only starts a drag when data is set.
                    e.dataTransfer?.setData('text/plain', step.id);
                    if (e.dataTransfer) e.dataTransfer.effectAllowed = 'move';
                  }}
                  onDragEnd={() => setDragging(null)}
                >
                  ⠿
                </span>
                <strong>Step {n}</strong>
                {step.kind === 'finding' ? (
                  v.missing ? (
                    <span class="missing" role="note">
                      Missing finding (deleted). Remove this step or replace it.
                    </span>
                  ) : (
                    <span>
                      <a href={findingHref(f?.id ?? '')}>
                        <span class="ref">{v.tag}</span> {v.title || 'Untitled finding'}
                      </a>{' '}
                      {v.severity && (
                        <span class={`badge sev-${v.severity.toLowerCase()}`}>{v.severity}</span>
                      )}
                    </span>
                  )
                ) : (
                  <span class="muted">Technique</span>
                )}
                <span class="row step-actions">
                  <button
                    type="button"
                    class="small"
                    aria-label={`Move step ${n} up`}
                    disabled={i === 0}
                    onClick={() => move(i, i - 1)}
                  >
                    ↑
                  </button>
                  <button
                    type="button"
                    class="small"
                    aria-label={`Move step ${n} down`}
                    disabled={i === steps.length - 1}
                    onClick={() => move(i, i + 1)}
                  >
                    ↓
                  </button>
                  <button
                    type="button"
                    class="small"
                    aria-label={`Remove step ${n}`}
                    onClick={() => {
                      onChange(cleanLinks(steps.filter((_, j) => j !== i)));
                      setAnnounce(`Step ${n} removed.`);
                    }}
                  >
                    ✕
                  </button>
                </span>
              </div>
              {step.kind === 'technique' && (
                <div class="row">
                  <div class="field grow">
                    <label for={`st-tech-${step.id}`}>Technique (step {n})</label>
                    <input
                      id={`st-tech-${step.id}`}
                      type="text"
                      placeholder="e.g. Password spraying"
                      value={step.technique ?? ''}
                      onInput={(e) => patch(i, { technique: e.currentTarget.value })}
                    />
                  </div>
                  <div class="field">
                    <label for={`st-mitre-${step.id}`}>MITRE ATT&CK id (step {n})</label>
                    <input
                      id={`st-mitre-${step.id}`}
                      type="text"
                      class="mono"
                      size={10}
                      placeholder="T1110.003"
                      spellcheck={false}
                      aria-invalid={!validMitreId(step.mitreId)}
                      value={step.mitreId ?? ''}
                      onInput={(e) => patch(i, { mitreId: e.currentTarget.value.toUpperCase() })}
                    />
                  </div>
                </div>
              )}
              <div class="field">
                <label for={`st-gains-${step.id}`}>Attacker gains (step {n})</label>
                <input
                  id={`st-gains-${step.id}`}
                  type="text"
                  placeholder="e.g. Domain user credentials"
                  value={step.gains}
                  onInput={(e) => patch(i, { gains: e.currentTarget.value })}
                />
              </div>
              <div class="field">
                <label for={`st-note-${step.id}`}>Note (step {n})</label>
                <textarea
                  id={`st-note-${step.id}`}
                  rows={2}
                  value={step.note}
                  aria-describedby={`st-note-hint-${step.id}`}
                  onInput={(e) => patch(i, { note: e.currentTarget.value })}
                />
                <p class="hint" id={`st-note-hint-${step.id}`}>
                  For a chain breaker, the note is the fix shown under “Break the chain”
                  {step.kind === 'finding' ? ' (empty: the finding’s recommendation)' : ''}.
                </p>
              </div>
              {branches && (
                <LeadsTo
                  n={n}
                  later={steps.slice(i + 1).map((s, k) => ({ id: s.id, label: label(i + 1 + k) }))}
                  selected={(succ[i] ?? []).map((j) => steps[j]?.id ?? '')}
                  onChange={(next) => patch(i, { next })}
                />
              )}
              <label class="checkbox">
                <input
                  type="checkbox"
                  checked={step.chainBreaker}
                  onChange={(e) => patch(i, { chainBreaker: e.currentTarget.checked })}
                />{' '}
                Chain breaker (step {n}): fixing it stops the attack
              </label>
            </li>
          );
        })}
      </ol>
      <p class="visually-hidden" role="status" aria-live="polite">
        {announce}
      </p>
    </>
  );
}

/**
 * Branching scenarios: the later steps this one leads to. Only later steps can be chosen, so the
 * graph never loops. Nothing checked: the step reaches the goal.
 */
function LeadsTo(p: {
  n: number;
  later: { id: string; label: string }[];
  selected: string[];
  onChange: (next: string[]) => void;
}) {
  if (!p.later.length) return <p class="muted">Step {p.n} leads to the goal.</p>;
  const toggle = (id: string, on: boolean) => {
    const set = new Set(p.selected);
    if (on) set.add(id);
    else set.delete(id);
    p.onChange(p.later.map((l) => l.id).filter((l) => set.has(l)));
  };
  return (
    <fieldset class="choices leads-to">
      <legend>Step {p.n} leads to</legend>
      {p.later.map((l) => (
        <label key={l.id} class="checkbox">
          <input
            type="checkbox"
            checked={p.selected.includes(l.id)}
            onChange={(e) => toggle(l.id, e.currentTarget.checked)}
          />
          {l.label}
        </label>
      ))}
      {!p.selected.length && <p class="muted">Nothing checked: this step reaches the goal.</p>}
    </fieldset>
  );
}
