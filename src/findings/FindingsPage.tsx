import { useEffect, useState } from 'preact/hooks';
import { OpenMissionButton } from '../backup/OpenMission';
import { SaveMissionDialog } from '../backup/SaveMissionDialog';
import type { Severity } from '../cvss/cvss31';
import { ProjectExport } from '../export/ProjectExport';
import type { Vault } from '../storage/vault';
import { rememberedProject, rememberProject } from '../ui/currentProject';
import { EmptyState } from '../ui/EmptyState';
import { OnboardingTip } from '../ui/OnboardingTip';
import { findingHref } from '../ui/router';
import { DeleteFindingDialog } from './DeleteFindingDialog';
import { whenSaved } from './pendingSaves';
import {
  effectiveSeverity,
  findingCvss,
  filterFindings,
  type Finding,
  type FindingFilter,
  findingRef,
  type FindingStatus,
  type Project,
  SEVERITIES,
  sortForReport,
  STATUSES,
} from './model';
import {
  createFinding,
  createProject,
  deleteFinding,
  duplicateFinding,
  listFindings,
  listProjects,
  renameProject,
} from './repository';

export function FindingsPage({ vault }: { vault: Vault }) {
  const [projects, setProjects] = useState<Project[] | null>(null);
  const [projectId, setProjectId] = useState<string | null>(rememberedProject());
  const [findings, setFindings] = useState<Finding[]>([]);
  const [filter, setFilter] = useState<FindingFilter>({});
  const [toDelete, setToDelete] = useState<Finding | null>(null);
  const [message, setMessage] = useState('');
  const [saving, setSaving] = useState(false);

  const reload = async (id: string | null = projectId) => {
    await whenSaved(); // e.g. the editor's last autosave when coming back to the list
    setFindings(id ? sortForReport(await listFindings(vault, id)) : []);
  };

  useEffect(() => {
    void listProjects(vault).then((list) => {
      setProjects(list);
      if (!list.some((p) => p.id === projectId)) setProjectId(list[0]?.id ?? null);
    });
  }, [vault]);

  useEffect(() => {
    if (projectId) rememberProject(projectId);
    void reload(projectId);
  }, [vault, projectId]);

  if (!projects) return <p aria-busy="true">Loading…</p>;
  const project = projects.find((p) => p.id === projectId) ?? null;
  const shown = filterFindings(findings, filter);
  const filtered = !!(filter.severity || filter.status || filter.text?.trim());

  const addFinding = async () => {
    if (!projectId) return;
    const f = await createFinding(vault, projectId);
    location.hash = findingHref(f.id);
  };

  const duplicate = async (f: Finding) => {
    const copy = await duplicateFinding(vault, f);
    await reload();
    setMessage(`${findingRef(f.number)} duplicated as ${findingRef(copy.number)}.`);
  };

  const remove = async (f: Finding) => {
    setToDelete(null);
    await deleteFinding(vault, f.id);
    await reload();
    setMessage(`${findingRef(f.number)} deleted.`);
  };

  return (
    <>
      <OnboardingTip />
      <section class="panel" aria-labelledby="findings-title">
        <h2 id="findings-title">Findings</h2>
        <div class="row">
          {projects.length > 0 && (
            <>
              <label for="project-select">Project</label>
              <select
                id="project-select"
                value={projectId ?? ''}
                onChange={(e) => {
                  setProjectId(e.currentTarget.value);
                  setMessage('');
                }}
              >
                {projects.map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.name}
                  </option>
                ))}
              </select>
              {project && (
                <RenameProject
                  key={project.id}
                  project={project}
                  onRename={async (name) => {
                    const renamed = await renameProject(vault, project, name);
                    setProjects(projects.map((p) => (p.id === renamed.id ? renamed : p)));
                  }}
                />
              )}
            </>
          )}
          <NewProject
            onCreate={async (name) => {
              const p = await createProject(vault, name);
              setProjects([...projects, p]);
              setProjectId(p.id);
            }}
          />
          <OpenMissionButton
            vault={vault}
            label="Open mission file…"
            onImported={(result, text) => {
              void listProjects(vault).then((list) => {
                setProjects(list);
                setProjectId(result.projects[0]?.id ?? projectId);
                setMessage(text);
              });
            }}
          />
        </div>

        {!projectId ? (
          <EmptyState title="Start with a project">
            <p>
              Create a project (one per mission) to start adding findings, or open a mission file
              saved earlier.
            </p>
          </EmptyState>
        ) : (
          <>
            <div class="row toolbar">
              <button type="button" class="primary" onClick={() => void addFinding()}>
                + New finding
              </button>
              <Filters filter={filter} onChange={setFilter} />
              <button type="button" onClick={() => setSaving(true)}>
                Save mission file…
              </button>
            </div>
            <p role="status" class="muted">
              {message}
            </p>

            {findings.length === 0 ? (
              <EmptyState title="No findings in this project yet">
                <p>
                  Add the first one with <strong>+ New finding</strong>. In a finding, paste
                  screenshots with Ctrl/Cmd+V: their metadata is removed and you can redact them.
                </p>
              </EmptyState>
            ) : (
              <>
                <p class="muted" data-testid="findings-count">
                  {filtered
                    ? `Showing ${shown.length} of ${findings.length} findings`
                    : `${findings.length} finding${findings.length > 1 ? 's' : ''}`}
                </p>
                {shown.length === 0 ? (
                  <p>
                    No finding matches these filters.{' '}
                    <button type="button" class="link" onClick={() => setFilter({})}>
                      Clear filters
                    </button>
                  </p>
                ) : (
                  <FindingTable
                    findings={shown}
                    onDuplicate={(f) => void duplicate(f)}
                    onDelete={setToDelete}
                  />
                )}
                {project && <ProjectExport vault={vault} project={project} findings={findings} />}
              </>
            )}
          </>
        )}

        {saving && project && (
          <SaveMissionDialog
            vault={vault}
            project={project}
            onClose={(text) => {
              setSaving(false);
              if (text) setMessage(text);
            }}
          />
        )}

        {toDelete && (
          <DeleteFindingDialog
            finding={toDelete}
            onCancel={() => setToDelete(null)}
            onConfirm={() => void remove(toDelete)}
          />
        )}
      </section>
    </>
  );
}

function Filters({
  filter,
  onChange,
}: {
  filter: FindingFilter;
  onChange: (f: FindingFilter) => void;
}) {
  const set = (patch: { text?: string; severity?: string; status?: string }) => {
    const merged = { ...filter, ...patch };
    const next: FindingFilter = {};
    if (merged.text) next.text = merged.text;
    if (merged.severity) next.severity = merged.severity as Severity;
    if (merged.status) next.status = merged.status as FindingStatus;
    onChange(next);
  };
  return (
    <div class="row filters" role="search" aria-label="Filter findings">
      <label for="filter-text">Search</label>
      <input
        id="filter-text"
        type="search"
        placeholder="VLN.03, title, asset…"
        value={filter.text ?? ''}
        onInput={(e) => set({ text: e.currentTarget.value })}
      />
      <label for="filter-severity">Severity</label>
      <select
        id="filter-severity"
        value={filter.severity ?? ''}
        onChange={(e) => set({ severity: e.currentTarget.value })}
      >
        <option value="">All</option>
        {SEVERITIES.map((s) => (
          <option key={s} value={s}>
            {s}
          </option>
        ))}
      </select>
      <label for="filter-status">Status</label>
      <select
        id="filter-status"
        value={filter.status ?? ''}
        onChange={(e) => set({ status: e.currentTarget.value })}
      >
        <option value="">All</option>
        {STATUSES.map((s) => (
          <option key={s} value={s}>
            {s === 'draft' ? 'Draft' : 'Validated'}
          </option>
        ))}
      </select>
    </div>
  );
}

function FindingTable(props: {
  findings: Finding[];
  onDuplicate: (f: Finding) => void;
  onDelete: (f: Finding) => void;
}) {
  return (
    <table class="findings-table">
      <thead>
        <tr>
          <th scope="col">Ref</th>
          <th scope="col">Title</th>
          <th scope="col">Severity</th>
          <th scope="col">CVSS</th>
          <th scope="col">Status</th>
          <th scope="col">
            <span class="visually-hidden">Actions</span>
          </th>
        </tr>
      </thead>
      <tbody>
        {props.findings.map((f) => {
          const severity = effectiveSeverity(f);
          const ref = findingRef(f.number);
          return (
            <tr key={f.id} data-testid={`row-${ref}`}>
              <td class="ref">{ref}</td>
              <td>
                <a href={findingHref(f.id)}>{f.title || <em>Untitled finding</em>}</a>
              </td>
              <td>
                <span class={`badge sev-${severity.toLowerCase()}`}>{severity}</span>
              </td>
              <td>{findingCvss(f).score.toFixed(1)}</td>
              <td>{f.status === 'draft' ? 'Draft' : 'Validated'}</td>
              <td class="actions">
                <button
                  type="button"
                  class="small"
                  aria-label={`Duplicate ${ref}`}
                  onClick={() => props.onDuplicate(f)}
                >
                  Duplicate
                </button>
                <button
                  type="button"
                  class="small danger"
                  aria-label={`Delete ${ref}`}
                  onClick={() => props.onDelete(f)}
                >
                  Delete
                </button>
              </td>
            </tr>
          );
        })}
      </tbody>
    </table>
  );
}

function RenameProject({
  project,
  onRename,
}: {
  project: Project;
  onRename: (name: string) => Promise<void>;
}) {
  const [editing, setEditing] = useState(false);
  const [name, setName] = useState(project.name);
  if (!editing) {
    return (
      <button type="button" class="small" onClick={() => setEditing(true)}>
        Rename
      </button>
    );
  }
  return (
    <form
      class="row"
      onSubmit={(e) => {
        e.preventDefault();
        if (name.trim()) void onRename(name).then(() => setEditing(false));
      }}
    >
      <label for="rename-project" class="visually-hidden">
        Project name
      </label>
      <input
        id="rename-project"
        type="text"
        value={name}
        autofocus
        onInput={(e) => setName(e.currentTarget.value)}
      />
      <button type="submit" class="small" disabled={!name.trim()}>
        Save
      </button>
      <button type="button" class="small" onClick={() => setEditing(false)}>
        Cancel
      </button>
    </form>
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
