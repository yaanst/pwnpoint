import { useEffect, useState } from 'preact/hooks';
import type { Project } from '../findings/model';
import { whenSaved } from '../findings/pendingSaves';
import { listProjects } from '../findings/repository';
import { type SaveStatus, useAutosave } from '../findings/useAutosave';
import type { Scenario } from '../scenarios/model';
import { scenarioSeverity } from '../scenarios/rating';
import { listScenarios } from '../scenarios/repository';
import { scenarioRef } from '../scenarios/model';
import type { Vault } from '../storage/vault';
import { rememberedProject, rememberProject } from '../ui/currentProject';
import { EmptyState } from '../ui/EmptyState';
import { LinesField, RichTextField } from '../ui/fields';
import { scenarioHref } from '../ui/router';
import {
  EMPTY_MISSION,
  type MissionDetails,
  missionProblems,
  type SecurityLevel,
  SECURITY_LEVEL_RULES,
  securitySentence,
  securityStatus,
} from './mission';
import { isEnabled } from '../flags';
import { ReportExport } from './ReportExport';
import { saveMission } from './repository';

const SAVE_TEXT: Record<SaveStatus, string> = {
  saved: 'All changes saved',
  unsaved: 'Unsaved changes…',
  saving: 'Saving…',
  error: 'Could not save. Your changes are still on screen; try again.',
};

const LEVEL_CLASS: Record<SecurityLevel, string> = {
  Satisfactory: 'sev-low',
  Pass: 'sev-medium',
  'Improvements required': 'sev-high',
  Unsatisfactory: 'sev-critical',
};

/** The report of the current project: mission details and executive summary. */
export function ReportPage({ vault }: { vault: Vault }) {
  const [projects, setProjects] = useState<Project[] | null>(null);
  const [projectId, setProjectId] = useState<string | null>(rememberedProject());
  const [scenarios, setScenarios] = useState<Scenario[] | null>(null);

  useEffect(() => {
    void whenSaved().then(() =>
      listProjects(vault).then((list) => {
        setProjects(list);
        if (!list.some((p) => p.id === projectId)) setProjectId(list[0]?.id ?? null);
      }),
    );
  }, [vault]);

  useEffect(() => {
    if (!projectId) return;
    rememberProject(projectId);
    setScenarios(null);
    void listScenarios(vault, projectId).then(setScenarios);
  }, [vault, projectId]);

  if (!projects) return <p aria-busy="true">Loading…</p>;
  const project = projects.find((p) => p.id === projectId) ?? null;

  return (
    <section class="panel" aria-labelledby="report-title">
      <h2 id="report-title">Report</h2>
      <p class="muted">
        Details of the assessment and the executive summary, for the report's first slides.
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
            <label for="report-project">Project</label>
            <select
              id="report-project"
              value={project.id}
              onChange={(e) => setProjectId(e.currentTarget.value)}
            >
              {projects.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.name}
                </option>
              ))}
            </select>
          </div>
          {scenarios ? (
            <MissionEditor
              key={project.id}
              vault={vault}
              project={project}
              scenarios={scenarios}
              onSaved={(p) => setProjects(projects.map((x) => (x.id === p.id ? p : x)))}
            />
          ) : (
            <p aria-busy="true">Loading…</p>
          )}
        </>
      )}
    </section>
  );
}

function MissionEditor(props: {
  vault: Vault;
  project: Project;
  scenarios: Scenario[];
  onSaved: (p: Project) => void;
}) {
  const { vault, project, scenarios } = props;
  const [m, setM] = useState<MissionDetails>({ ...EMPTY_MISSION, ...project.mission });
  const autosave = useAutosave(m, async (value) =>
    props.onSaved(await saveMission(vault, project.id, value)),
  );
  const update = (patch: Partial<MissionDetails>) => setM((prev) => ({ ...prev, ...patch }));
  const status = securityStatus(scenarios);
  const problems = missionProblems(m, status);

  const text = (key: keyof MissionDetails, label: string, placeholder = '') => (
    <div class="field">
      <label for={`m-${key}`}>{label}</label>
      <input
        id={`m-${key}`}
        type="text"
        placeholder={placeholder}
        value={m[key] as string}
        onInput={(e) => update({ [key]: e.currentTarget.value })}
      />
    </div>
  );
  const date = (key: 'from' | 'to', label: string) => (
    <div class="field">
      <label for={`m-${key}`}>{label}</label>
      <input
        id={`m-${key}`}
        type="date"
        value={m[key]}
        onInput={(e) => update({ [key]: e.currentTarget.value })}
      />
    </div>
  );

  return (
    <div class="stack">
      <p class="muted" role="status" data-testid="save-status">
        {SAVE_TEXT[autosave.status]}
      </p>

      <fieldset class="field">
        <legend>Assessment details</legend>
        <div class="row">
          {text('client', 'Client')}
          {text('product', 'Product or system', 'e.g. Customer portal')}
          {text('version', 'Report version', '1.0')}
        </div>
        <div class="row">
          {date('from', 'First day')}
          {date('to', 'Last day')}
        </div>
        <div class="row">
          {text('leadAuditor', 'Lead auditor')}
          {text('auditType', 'Assessment type', 'e.g. Internal penetration test')}
          {text('infraType', 'Infrastructure type', 'e.g. On-premises, cloud, hybrid')}
        </div>
        <LinesField
          id="m-auditors"
          label="Auditors"
          hint="One per line."
          value={m.auditors}
          onChange={(auditors) => update({ auditors })}
        />
        <div class="field">
          <label for="m-scope">Scope</label>
          <textarea
            id="m-scope"
            rows={2}
            value={m.scope}
            onInput={(e) => update({ scope: e.currentTarget.value })}
          />
        </div>
        <RichTextField
          id="m-comments"
          label="Comments"
          rows={3}
          value={m.comments}
          onChange={(comments) => update({ comments })}
        />
      </fieldset>

      <fieldset class="field">
        <legend>Executive summary</legend>
        <p>
          Security status:{' '}
          <span class={`badge ${LEVEL_CLASS[status.level]}`} data-testid="security-level">
            {status.level}
          </span>{' '}
          <span class="muted">({SECURITY_LEVEL_RULES[status.level]})</span>
        </p>
        <p class="hint" data-testid="security-basis">
          {status.worst.length ? (
            <>
              Set by{' '}
              {status.worst.map((s, i) => (
                <span key={s.id}>
                  {i > 0 && ', '}
                  <a href={scenarioHref(s.id)}>{scenarioRef(s.number)}</a>
                  {s.exploitability && s.impact
                    ? ` (${scenarioSeverity(s.exploitability, s.impact)})`
                    : ''}
                </span>
              ))}
              , the worst rated attack scenario{status.worst.length > 1 ? 's' : ''}.
            </>
          ) : (
            'No rated attack scenario yet.'
          )}
        </p>
        <div class="field">
          <label for="m-reason">Why (completes the sentence below)</label>
          <textarea
            id="m-reason"
            rows={2}
            placeholder="e.g. an attacker on the guest Wi-Fi can become domain admin"
            value={m.securityLevelReason}
            onInput={(e) => update({ securityLevelReason: e.currentTarget.value })}
          />
        </div>
        <p data-testid="security-sentence">
          <em>{securitySentence(m, status.level)}</em>
        </p>
        <LinesField
          id="m-strengths"
          label="Strengths"
          hint="One per line."
          value={m.strengths}
          onChange={(strengths) => update({ strengths })}
        />
        <LinesField
          id="m-weaknesses"
          label="Areas of improvement"
          hint="One per line."
          value={m.weaknesses}
          onChange={(weaknesses) => update({ weaknesses })}
        />
      </fieldset>

      {problems.length > 0 && (
        <div class="hint warning" data-testid="report-problems">
          <p>Before the report:</p>
          <ul>
            {problems.map((p) => (
              <li key={p}>{p}</li>
            ))}
          </ul>
        </div>
      )}
      {isEnabled('reportDeck') && (
        <ReportExport vault={vault} project={{ ...project, mission: m }} scenarios={scenarios} />
      )}
    </div>
  );
}
