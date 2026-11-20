import { useEffect, useState } from 'preact/hooks';
import { calculateBaseScore } from '../cvss/cvss31';
import type { Vault } from '../storage/vault';
import { findingHref } from '../ui/router';
import { effectiveSeverity, type Finding, findingRef, type Project, sortForReport } from './model';
import { createFinding, createProject, listFindings, listProjects } from './repository';

const CURRENT_PROJECT_KEY = 'pwnpoint.currentProject';

/** UI preference only (an opaque id), so localStorage is fine here. */
function rememberedProject(): string | null {
  try {
    return localStorage.getItem(CURRENT_PROJECT_KEY);
  } catch {
    return null;
  }
}
function rememberProject(id: string): void {
  try {
    localStorage.setItem(CURRENT_PROJECT_KEY, id);
  } catch {
    // Storage blocked: the choice is simply not remembered.
  }
}

export function FindingsPage({ vault }: { vault: Vault }) {
  const [projects, setProjects] = useState<Project[] | null>(null);
  const [projectId, setProjectId] = useState<string | null>(rememberedProject());
  const [findings, setFindings] = useState<Finding[]>([]);

  useEffect(() => {
    void listProjects(vault).then((list) => {
      setProjects(list);
      if (!list.some((p) => p.id === projectId)) setProjectId(list[0]?.id ?? null);
    });
  }, [vault]);

  useEffect(() => {
    if (projectId) {
      rememberProject(projectId);
      void listFindings(vault, projectId).then((list) => setFindings(sortForReport(list)));
    } else {
      setFindings([]);
    }
  }, [vault, projectId]);

  if (!projects) return <p aria-busy="true">Loading…</p>;

  const addFinding = async () => {
    if (!projectId) return;
    const f = await createFinding(vault, projectId);
    location.hash = findingHref(f.id);
  };

  return (
    <section class="panel" aria-labelledby="findings-title">
      <h2 id="findings-title">Findings</h2>
      <div class="row">
        {projects.length > 0 && (
          <>
            <label for="project-select">Project</label>
            <select
              id="project-select"
              value={projectId ?? ''}
              onChange={(e) => setProjectId(e.currentTarget.value)}
            >
              {projects.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.name}
                </option>
              ))}
            </select>
          </>
        )}
        <NewProject
          onCreate={async (name) => {
            const p = await createProject(vault, name);
            setProjects([...projects, p]);
            setProjectId(p.id);
          }}
        />
      </div>

      {projectId ? (
        <>
          <p>
            <button type="button" class="primary" onClick={() => void addFinding()}>
              + New finding
            </button>
          </p>
          {findings.length === 0 ? (
            <p class="muted">No findings in this project yet.</p>
          ) : (
            <ul class="finding-list">
              {findings.map((f) => {
                const severity = effectiveSeverity(f);
                return (
                  <li key={f.id}>
                    <a href={findingHref(f.id)}>
                      <span class="ref">{findingRef(f.number)}</span>{' '}
                      {f.title || <em>Untitled finding</em>}
                    </a>{' '}
                    <span class={`badge sev-${severity.toLowerCase()}`}>{severity}</span>{' '}
                    <span class="muted">
                      CVSS {calculateBaseScore(f.cvss).score.toFixed(1)} · {f.status}
                    </span>
                  </li>
                );
              })}
            </ul>
          )}
        </>
      ) : (
        <p class="muted">Create a project (one per mission) to start adding findings.</p>
      )}
    </section>
  );
}

function NewProject({ onCreate }: { onCreate: (name: string) => Promise<void> }) {
  const [name, setName] = useState('');
  return (
    <form
      class="row"
      onSubmit={(e) => {
        e.preventDefault();
        if (name.trim()) void onCreate(name).then(() => setName(''));
      }}
    >
      <label for="new-project">New project</label>
      <input
        id="new-project"
        type="text"
        placeholder="e.g. ACME internal pentest 2026"
        value={name}
        onInput={(e) => setName(e.currentTarget.value)}
      />
      <button type="submit" disabled={!name.trim()}>
        Create
      </button>
    </form>
  );
}
