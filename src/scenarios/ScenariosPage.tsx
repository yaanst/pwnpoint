import { EmptyState } from '../ui/EmptyState';
import { useEffect, useState } from 'preact/hooks';
import type { Project } from '../findings/model';
import { listProjects } from '../findings/repository';
import type { Vault } from '../storage/vault';
import { ConfirmDialog } from '../ui/ConfirmDialog';
import { rememberedProject, rememberProject } from '../ui/currentProject';
import { scenarioHref } from '../ui/router';
import { type Scenario, scenarioRef } from './model';
import { createScenario, deleteScenario, listScenarios } from './repository';
import { whenSaved } from '../findings/pendingSaves';

/** Attack scenarios of the current project. */
export function ScenariosPage({ vault }: { vault: Vault }) {
  const [projects, setProjects] = useState<Project[] | null>(null);
  const [projectId, setProjectId] = useState<string | null>(rememberedProject());
  const [scenarios, setScenarios] = useState<Scenario[]>([]);
  const [toDelete, setToDelete] = useState<Scenario | null>(null);

  useEffect(() => {
    void listProjects(vault).then((list) => {
      setProjects(list);
      if (!list.some((p) => p.id === projectId)) setProjectId(list[0]?.id ?? null);
    });
  }, [vault]);

  useEffect(() => {
    if (!projectId) return;
    rememberProject(projectId);
    void whenSaved().then(() => listScenarios(vault, projectId).then(setScenarios));
  }, [vault, projectId]);

  if (!projects) return <p aria-busy="true">Loading…</p>;

  const add = async () => {
    if (!projectId) return;
    const s = await createScenario(vault, projectId);
    location.hash = scenarioHref(s.id);
  };
  const remove = async (s: Scenario) => {
    await deleteScenario(vault, s.id);
    setToDelete(null);
    setScenarios(scenarios.filter((x) => x.id !== s.id));
  };

  return (
    <section class="panel" aria-labelledby="scenarios-title">
      <h2 id="scenarios-title">Attack scenarios</h2>
      <p class="muted">
        Chain findings and techniques into the path an attacker would follow, shown as a flow on one
        slide.
      </p>
      {projects.length === 0 || !projectId ? (
        <EmptyState title="No project yet">
          <p>
            Create a project on the <a href="#/findings">Findings</a> page first, then come back to
            chain its findings.
          </p>
        </EmptyState>
      ) : (
        <>
          <div class="row toolbar">
            <label for="scenario-project">Project</label>
            <select
              id="scenario-project"
              value={projectId}
              onChange={(e) => setProjectId(e.currentTarget.value)}
            >
              {projects.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.name}
                </option>
              ))}
            </select>
            <button type="button" class="primary" onClick={() => void add()}>
              + New scenario
            </button>
          </div>
          {scenarios.length === 0 ? (
            <EmptyState title="No scenarios in this project yet">
              <p>
                Start one with <strong>+ New scenario</strong>, then add its steps: findings of this
                project or free techniques (with an optional MITRE ATT&amp;CK id). Mark the steps
                whose fix breaks the chain.
              </p>
            </EmptyState>
          ) : (
            <table class="findings-table">
              <thead>
                <tr>
                  <th scope="col">Ref</th>
                  <th scope="col">Title</th>
                  <th scope="col">Steps</th>
                  <th scope="col">
                    <span class="visually-hidden">Actions</span>
                  </th>
                </tr>
              </thead>
              <tbody>
                {scenarios.map((s) => (
                  <tr key={s.id}>
                    <td class="ref">{scenarioRef(s.number)}</td>
                    <td>
                      <a href={scenarioHref(s.id)}>{s.title || 'Untitled scenario'}</a>
                    </td>
                    <td>{s.steps.length}</td>
                    <td>
                      <button
                        type="button"
                        class="small danger"
                        aria-label={`Delete ${scenarioRef(s.number)}`}
                        onClick={() => setToDelete(s)}
                      >
                        Delete
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </>
      )}
      {toDelete && (
        <DeleteScenarioDialog
          scenario={toDelete}
          onCancel={() => setToDelete(null)}
          onConfirm={() => void remove(toDelete)}
        />
      )}
    </section>
  );
}

export function DeleteScenarioDialog(props: {
  scenario: Scenario;
  onConfirm: () => void;
  onCancel: () => void;
}) {
  const ref = scenarioRef(props.scenario.number);
  return (
    <ConfirmDialog
      title={`Delete ${ref}?`}
      confirmLabel="Delete scenario"
      danger
      onConfirm={props.onConfirm}
      onCancel={props.onCancel}
    >
      <p>
        <strong>{props.scenario.title || 'Untitled scenario'}</strong> will be deleted. Its findings
        are kept. This cannot be undone.
      </p>
    </ConfirmDialog>
  );
}
