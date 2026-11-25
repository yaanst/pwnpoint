import { useEffect, useState } from 'preact/hooks';
import { allCategories, type Category } from '../findings/categories';
import { type Finding, findingRef, type Project } from '../findings/model';
import { listFindings } from '../findings/repository';
import { type SaveStatus, useAutosave } from '../findings/useAutosave';
import type { Vault } from '../storage/vault';
import { RichTextField } from '../ui/fields';
import { findingHref } from '../ui/router';
import {
  CRITERIA,
  CRITERION_INFO,
  isScale3,
  QUADRANT_NAMES,
  quadrantOf,
  type Recommendation,
  recommendationProblems,
  recommendationRef,
  SCALE3,
} from './model';
import { DeleteRecommendationDialog } from './RecommendationsPage';
import {
  deleteRecommendation,
  getRecommendation,
  recategorizeRecommendation,
  saveRecommendation,
} from './repository';

const SAVE_TEXT: Record<SaveStatus, string> = {
  saved: 'All changes saved',
  unsaved: 'Unsaved changes…',
  saving: 'Saving…',
  error: 'Could not save. Your changes are still on screen; try again.',
};

/** Loads a recommendation and its project's findings, then shows the editor. */
export function RecommendationEditorPage({ vault, id }: { vault: Vault; id: string }) {
  const [data, setData] = useState<
    { r: Recommendation; findings: Finding[]; categories: Category[] } | null | undefined
  >(undefined);
  useEffect(() => {
    void (async () => {
      const r = await getRecommendation(vault, id);
      if (!r) return setData(null);
      const project = await vault.get<Project>('projects', r.projectId);
      const findings = (await listFindings(vault, r.projectId)).sort((a, b) =>
        findingRef(a).localeCompare(findingRef(b)),
      );
      setData({
        r,
        findings,
        categories: allCategories(project?.recommendationCategories, 'recommendation'),
      });
    })();
  }, [vault, id]);

  if (data === undefined) return <p aria-busy="true">Loading…</p>;
  if (data === null) {
    return (
      <div class="panel" role="alert">
        <h2>Recommendation not found</h2>
        <p>
          It may have been deleted. <a href="#/recommendations">Back to recommendations</a>
        </p>
      </div>
    );
  }
  return <RecommendationEditor key={data.r.id} vault={vault} initial={data.r} {...data} />;
}

function RecommendationEditor(props: {
  vault: Vault;
  initial: Recommendation;
  findings: Finding[];
  categories: Category[];
}) {
  const { vault, initial, findings, categories } = props;
  const [r, setR] = useState(initial);
  const [askDelete, setAskDelete] = useState(false);
  const [busy, setBusy] = useState(false);
  const [categoryMessage, setCategoryMessage] = useState('');
  const autosave = useAutosave(r, (value) => saveRecommendation(vault, value));
  const update = (patch: Partial<Recommendation>) => setR((prev) => ({ ...prev, ...patch }));
  const quadrant = quadrantOf(r);
  const problems = recommendationProblems(r);

  const changeCategory = async (code: string) => {
    const before = recommendationRef(r);
    setBusy(true);
    try {
      const next = await recategorizeRecommendation(vault, r, code || undefined, initial);
      setR((prev) => {
        const { category: _old, ...rest } = prev;
        return { ...rest, ...next };
      });
      const after = recommendationRef(next);
      setCategoryMessage(
        after === recommendationRef(initial)
          ? `Back to ${after}.`
          : `Renumbered ${before} → ${after}. ${before} will not be reused.`,
      );
    } finally {
      setBusy(false);
    }
  };

  const toggle = (id: string, on: boolean) =>
    setR((prev) => {
      const ids = prev.findingIds.filter((x) => x !== id);
      return { ...prev, findingIds: on ? [...ids, id] : ids };
    });

  return (
    <article class="panel editor" aria-labelledby="recommendation-heading">
      <header class="editor-head">
        <p class="row spread">
          <a href="#/recommendations">← Recommendations</a>
          <button type="button" class="small danger" onClick={() => setAskDelete(true)}>
            Delete recommendation
          </button>
        </p>
        <h2 id="recommendation-heading">
          <span class="ref">{recommendationRef(r)}</span> {r.title || 'Untitled recommendation'}
        </h2>
        <p class="muted" role="status" data-testid="save-status">
          {SAVE_TEXT[autosave.status]}
        </p>
      </header>

      <div class="field">
        <label for="r-title">Title</label>
        <input
          id="r-title"
          type="text"
          placeholder="e.g. Disable SMBv1 on every server"
          value={r.title}
          onInput={(e) => update({ title: e.currentTarget.value })}
        />
      </div>

      <div class="field">
        <label for="r-category">Category</label>
        <select
          id="r-category"
          value={r.category ?? ''}
          disabled={busy}
          aria-describedby="r-category-hint"
          onChange={(e) => void changeCategory(e.currentTarget.value)}
        >
          <option value="">None (REC.NN)</option>
          {categories.map((c) => (
            <option key={c.code} value={c.code}>
              {c.code}: {c.name}
            </option>
          ))}
        </select>
        <p id="r-category-hint" class="hint">
          Changing the category gives the recommendation the next number in that category.
        </p>
        <p role="status" class="muted" data-testid="category-status">
          {categoryMessage}
        </p>
      </div>

      <RichTextField
        id="r-description"
        label="Description"
        rows={3}
        value={r.description}
        onChange={(description) => update({ description })}
      />

      <fieldset class="field">
        <legend>Action plan</legend>
        <div class="row">
          {CRITERIA.map((key) => (
            <div class="field" key={key}>
              <label for={`r-${key}`}>{CRITERION_INFO[key].name}</label>
              <select
                id={`r-${key}`}
                value={r[key] ?? ''}
                onChange={(e) => {
                  const v = Number(e.currentTarget.value);
                  update({ [key]: isScale3(v) ? v : undefined });
                }}
              >
                <option value="">Not rated</option>
                {SCALE3.map((v) => (
                  <option key={v} value={v}>
                    {v} – {CRITERION_INFO[key].levels[v]}
                  </option>
                ))}
              </select>
            </div>
          ))}
        </div>
        <p>
          Classification:{' '}
          <strong data-testid="quadrant">
            {quadrant ? QUADRANT_NAMES[quadrant] : 'Not rated'}
          </strong>
        </p>
        <p class="hint">
          Effort is complexity + workload + cost: below 6 it is a quick win (priority 3) or a side
          action; from 6 it is a heavy project (priority 3) or can be delayed.
        </p>
      </fieldset>

      <fieldset class="field">
        <legend>Findings addressed</legend>
        {findings.length === 0 ? (
          <p class="muted">This project has no findings yet.</p>
        ) : (
          <ul class="plain-list">
            {findings.map((f) => (
              <li key={f.id} class="row">
                <label class="checkbox">
                  <input
                    type="checkbox"
                    checked={r.findingIds.includes(f.id)}
                    onChange={(e) => toggle(f.id, e.currentTarget.checked)}
                  />
                  <span class="ref">{findingRef(f)}</span> {f.title || 'Untitled finding'}
                </label>{' '}
                <a href={findingHref(f.id)} class="small" aria-label={`Open ${findingRef(f)}`}>
                  Open
                </a>
              </li>
            ))}
          </ul>
        )}
      </fieldset>

      {problems.length > 0 && (
        <div class="hint warning" data-testid="recommendation-problems">
          <p>Before the report:</p>
          <ul>
            {problems.map((p) => (
              <li key={p}>{p}</li>
            ))}
          </ul>
        </div>
      )}

      {askDelete && (
        <DeleteRecommendationDialog
          recommendation={r}
          onCancel={() => setAskDelete(false)}
          onConfirm={() => {
            autosave.cancel();
            void deleteRecommendation(vault, r.id).then(() => {
              location.hash = '#/recommendations';
            });
          }}
        />
      )}
    </article>
  );
}
