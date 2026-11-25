import { useEffect, useState } from 'preact/hooks';
import { allCategories } from '../findings/categories';
import { CategoriesDialog } from '../findings/CategoriesDialog';
import { type Finding, findingRef, type Project } from '../findings/model';
import { whenSaved } from '../findings/pendingSaves';
import { listFindings, listProjects } from '../findings/repository';
import type { Vault } from '../storage/vault';
import { ConfirmDialog } from '../ui/ConfirmDialog';
import { rememberedProject, rememberProject } from '../ui/currentProject';
import { EmptyState } from '../ui/EmptyState';
import { recommendationHref } from '../ui/router';
import {
  CRITERION_INFO,
  QUADRANT_NAMES,
  quadrantOf,
  type Recommendation,
  recommendationRef,
  sortForPlan,
} from './model';
import { createRecommendation, deleteRecommendation, listRecommendations } from './repository';

/** Recommendations of the current project, in action-plan order. */
export function RecommendationsPage({ vault }: { vault: Vault }) {
  const [projects, setProjects] = useState<Project[] | null>(null);
  const [projectId, setProjectId] = useState<string | null>(rememberedProject());
  const [recs, setRecs] = useState<Recommendation[]>([]);
  const [findings, setFindings] = useState<Map<string, Finding>>(new Map());
  const [newCategory, setNewCategory] = useState('');
  const [editCategories, setEditCategories] = useState(false);
  const [toDelete, setToDelete] = useState<Recommendation | null>(null);
  const [message, setMessage] = useState('');

  useEffect(() => {
    void listProjects(vault).then((list) => {
      setProjects(list);
      if (!list.some((p) => p.id === projectId)) setProjectId(list[0]?.id ?? null);
    });
  }, [vault]);

  useEffect(() => {
    if (!projectId) return;
    rememberProject(projectId);
    void whenSaved().then(async () => {
      setRecs(sortForPlan(await listRecommendations(vault, projectId)));
      setFindings(new Map((await listFindings(vault, projectId)).map((f) => [f.id, f])));
    });
  }, [vault, projectId]);

  if (!projects) return <p aria-busy="true">Loading…</p>;
  const project = projects.find((p) => p.id === projectId) ?? null;
  const categories = allCategories(project?.recommendationCategories, 'recommendation');

  const add = async () => {
    if (!projectId) return;
    const r = await createRecommendation(
      vault,
      projectId,
      newCategory ? { category: newCategory } : {},
    );
    location.hash = recommendationHref(r.id);
  };
  const remove = async (r: Recommendation) => {
    await deleteRecommendation(vault, r.id);
    setToDelete(null);
    setRecs(recs.filter((x) => x.id !== r.id));
    setMessage(`${recommendationRef(r)} deleted.`);
  };

  return (
    <section class="panel" aria-labelledby="recommendations-title">
      <h2 id="recommendations-title">Recommendations</h2>
      <p class="muted">
        Remediation actions, each linked to the findings it addresses and rated for the action plan.
      </p>
      {!project ? (
        <EmptyState title="No project yet">
          <p>
            Create a project on the <a href="#/findings">Findings</a> page first.
          </p>
        </EmptyState>
      ) : (
        <>
          <div class="row toolbar">
            <label for="recommendation-project">Project</label>
            <select
              id="recommendation-project"
              value={project.id}
              onChange={(e) => {
                setProjectId(e.currentTarget.value);
                setNewCategory('');
                setMessage('');
              }}
            >
              {projects.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.name}
                </option>
              ))}
            </select>
            <label for="new-recommendation-category">Category for new recommendations</label>
            <select
              id="new-recommendation-category"
              value={newCategory}
              onChange={(e) => setNewCategory(e.currentTarget.value)}
            >
              <option value="">None</option>
              {categories.map((c) => (
                <option key={c.code} value={c.code}>
                  {c.code}: {c.name}
                </option>
              ))}
            </select>
            <button type="button" class="primary" onClick={() => void add()}>
              + New recommendation
            </button>
            <button type="button" class="small" onClick={() => setEditCategories(true)}>
              Categories…
            </button>
          </div>
          <p role="status" class="muted">
            {message}
          </p>
          {recs.length === 0 ? (
            <EmptyState title="No recommendations in this project yet">
              <p>
                Add one with <strong>+ New recommendation</strong>, or from a finding's editor. Rate
                its complexity, workload, cost and priority to place it in the action plan.
              </p>
            </EmptyState>
          ) : (
            <table class="findings-table">
              <thead>
                <tr>
                  <th scope="col">Ref</th>
                  <th scope="col">Title</th>
                  <th scope="col">Findings</th>
                  <th scope="col">Priority</th>
                  <th scope="col">Action plan</th>
                  <th scope="col">
                    <span class="visually-hidden">Actions</span>
                  </th>
                </tr>
              </thead>
              <tbody>
                {recs.map((r) => {
                  const ref = recommendationRef(r);
                  const q = quadrantOf(r);
                  const refs = r.findingIds
                    .map((id) => findings.get(id))
                    .filter((f): f is Finding => !!f)
                    .map(findingRef)
                    .sort();
                  return (
                    <tr key={r.id} data-testid={`row-${ref}`}>
                      <td class="ref">{ref}</td>
                      <td>
                        <a href={recommendationHref(r.id)}>
                          {r.title || <em>Untitled recommendation</em>}
                        </a>
                      </td>
                      <td class="ref">{refs.join(', ') || '—'}</td>
                      <td>
                        {r.priority
                          ? `${r.priority} – ${CRITERION_INFO.priority.levels[r.priority]}`
                          : '—'}
                      </td>
                      <td>{q ? QUADRANT_NAMES[q] : <span class="muted">Not rated</span>}</td>
                      <td class="actions">
                        <button
                          type="button"
                          class="small danger"
                          aria-label={`Delete ${ref}`}
                          onClick={() => setToDelete(r)}
                        >
                          Delete
                        </button>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          )}
          {editCategories && (
            <CategoriesDialog
              vault={vault}
              project={project}
              items={recs}
              kind="recommendation"
              onChange={(next) => {
                setProjects(projects.map((p) => (p.id === next.id ? next : p)));
                const codes = allCategories(next.recommendationCategories, 'recommendation');
                if (newCategory && !codes.some((c) => c.code === newCategory)) setNewCategory('');
              }}
              onClose={() => setEditCategories(false)}
            />
          )}
        </>
      )}
      {toDelete && (
        <DeleteRecommendationDialog
          recommendation={toDelete}
          onCancel={() => setToDelete(null)}
          onConfirm={() => void remove(toDelete)}
        />
      )}
    </section>
  );
}

export function DeleteRecommendationDialog(props: {
  recommendation: Recommendation;
  onConfirm: () => void;
  onCancel: () => void;
}) {
  const ref = recommendationRef(props.recommendation);
  return (
    <ConfirmDialog
      title={`Delete ${ref}?`}
      confirmLabel="Delete recommendation"
      danger
      onConfirm={props.onConfirm}
      onCancel={props.onCancel}
    >
      <p>
        <strong>{props.recommendation.title || 'Untitled recommendation'}</strong> will be deleted
        from this browser. The findings it addresses are kept. This cannot be undone.
      </p>
      <p>The number {ref} will not be reused.</p>
    </ConfirmDialog>
  );
}
