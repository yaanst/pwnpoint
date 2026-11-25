import { type Evidence, getEvidenceBytes } from '../evidence/repository';
import type { Finding, Project } from '../findings/model';
import { listFindings, listProjects } from '../findings/repository';
import type { Recommendation } from '../recommendations/model';
import { listRecommendations } from '../recommendations/repository';
import { listScenarios } from '../scenarios/repository';
import type { Scenario } from '../scenarios/model';
import type { SlideTheme } from '../slides/theme';
import { loadTheme, saveTheme } from '../slides/themeStore';
import type { ContentStore } from '../storage/schema';
import type { Vault } from '../storage/vault';
import type { MissionContent, ProjectContent } from './validate';

/** Re-encodes PNG bytes through a canvas (drops anything but pixels) and reports the real size. */
export type Reencode = (
  png: Uint8Array<ArrayBuffer>,
) => Promise<{ bytes: Uint8Array<ArrayBuffer>; width: number; height: number }>;

async function projectContent(vault: Vault, project: Project): Promise<ProjectContent> {
  const evidence: ProjectContent['evidence'] = [];
  for (const { value } of await vault.list<Evidence>('evidence', project.id)) {
    const bytes = await getEvidenceBytes(vault, value.id);
    if (bytes) evidence.push({ meta: value, bytes });
  }
  return {
    project,
    findings: await listFindings(vault, project.id),
    evidence,
    scenarios: await listScenarios(vault, project.id),
    recommendations: await listRecommendations(vault, project.id),
  };
}

/** Everything to save: one project, or every project plus the slide theme. */
export async function collectMission(
  vault: Vault,
  scope: { projectId: string } | 'all',
): Promise<MissionContent> {
  const all = await listProjects(vault);
  const projects = scope === 'all' ? all : all.filter((p) => p.id === scope.projectId);
  if (projects.length === 0) throw new Error('There is nothing to save yet.');
  const content: MissionContent = {
    scope: scope === 'all' ? 'all' : 'project',
    exportedAt: Date.now(),
    appVersion: '',
    projects: [],
  };
  for (const p of projects.sort((a, b) => a.createdAt - b.createdAt)) {
    content.projects.push(await projectContent(vault, p));
  }
  if (scope === 'all') content.theme = await loadTheme(vault);
  return content;
}

export const missionCounts = (content: MissionContent) => ({
  projects: content.projects.length,
  findings: content.projects.reduce((n, p) => n + p.findings.length, 0),
  images: content.projects.reduce((n, p) => n + p.evidence.length, 0),
  scenarios: content.projects.reduce((n, p) => n + p.scenarios.length, 0),
  recommendations: content.projects.reduce((n, p) => n + p.recommendations.length, 0),
});

/** Projects of the file that already exist in this browser (same id). */
export async function existingProjects(vault: Vault, content: MissionContent): Promise<Project[]> {
  const found = await Promise.all(
    content.projects.map((p) => vault.get<Project>('projects', p.project.id)),
  );
  return found.filter((p): p is Project => !!p);
}

/** `replace`: an existing project with the same id is overwritten. `copy`: it is kept. */
export type ConflictMode = 'replace' | 'copy';

export interface RestoreOptions {
  conflict: ConflictMode;
  /** Also make the file's slide theme the active one. */
  theme: boolean;
  reencode: Reencode;
  newId?: () => string;
}

export interface RestoreResult {
  /** The projects as stored, in file order. */
  projects: Project[];
  replaced: number;
  copied: number;
  themeRestored: boolean;
}

/** Gives every record of a project a fresh id, keeping the links between them. */
function remap(p: ProjectContent, newId: () => string, name: string): ProjectContent {
  const projectId = newId();
  const findingIds = new Map(p.findings.map((f) => [f.id, newId()]));
  const fid = (id: string) => findingIds.get(id) ?? id;
  return {
    project: { ...p.project, id: projectId, name },
    findings: p.findings.map((f) => ({ ...f, id: fid(f.id), projectId })),
    evidence: p.evidence.map((e) => ({
      meta: { ...e.meta, id: newId(), projectId, findingId: fid(e.meta.findingId) },
      bytes: e.bytes,
    })),
    scenarios: p.scenarios.map((s) => ({
      ...s,
      id: newId(),
      projectId,
      steps: s.steps.map((st) =>
        st.findingId
          ? { ...st, id: newId(), findingId: fid(st.findingId) }
          : { ...st, id: newId() },
      ),
    })),
    recommendations: p.recommendations.map((r) => ({
      ...r,
      id: newId(),
      projectId,
      findingIds: r.findingIds.map(fid),
    })),
  };
}

/** True when a record id of `p` is already used in this browser by another project. */
async function collides(vault: Vault, p: ProjectContent): Promise<boolean> {
  const check = async (store: ContentStore, id: string) => {
    const r = await vault.get<{ projectId?: string }>(store, id);
    return !!r && r.projectId !== p.project.id;
  };
  const checks = [
    ...p.findings.map((f) => check('findings', f.id)),
    ...p.evidence.map((e) => check('evidence', e.meta.id)),
    ...p.scenarios.map((s) => check('scenarios', s.id)),
    ...p.recommendations.map((r) => check('recommendations', r.id)),
  ];
  return (await Promise.all(checks)).some(Boolean);
}

async function write(vault: Vault, p: ProjectContent): Promise<void> {
  const pid = p.project.id;
  for (const f of p.findings) {
    await vault.put<Finding>('findings', { id: f.id, projectId: pid, updatedAt: f.updatedAt }, f);
  }
  for (const { meta, bytes } of p.evidence) {
    await vault.put<Evidence>(
      'evidence',
      { id: meta.id, projectId: pid, findingId: meta.findingId },
      meta,
      bytes,
    );
  }
  for (const s of p.scenarios) {
    await vault.put<Scenario>('scenarios', { id: s.id, projectId: pid, updatedAt: s.updatedAt }, s);
  }
  for (const r of p.recommendations) {
    await vault.put<Recommendation>(
      'recommendations',
      { id: r.id, projectId: pid, updatedAt: r.updatedAt },
      r,
    );
  }
  await vault.put<Project>('projects', { id: pid }, p.project);
}

/** Deletes the records of a project that are not in `keep` (after a replace). */
async function deleteStale(vault: Vault, p: ProjectContent): Promise<void> {
  const keep = new Set([
    ...p.findings.map((f) => f.id),
    ...p.evidence.map((e) => e.meta.id),
    ...p.scenarios.map((s) => s.id),
    ...p.recommendations.map((r) => r.id),
  ]);
  for (const store of ['evidence', 'findings', 'scenarios', 'recommendations'] as const) {
    for (const r of await vault.list(store, p.project.id)) {
      if (!keep.has(r.id)) await vault.delete(store, r.id);
    }
  }
}

/** The theme with its logo and report images re-encoded through a canvas. */
export async function reencodeTheme(theme: SlideTheme, reencode: Reencode): Promise<SlideTheme> {
  const out: SlideTheme = { ...theme };
  if (theme.logo) out.logo = await reencode(theme.logo.bytes);
  if (theme.report) {
    const report = { ...theme.report };
    if (report.cover) report.cover = await reencode(report.cover.bytes);
    if (report.coverLogo) report.coverLogo = await reencode(report.coverLogo.bytes);
    out.report = report;
  }
  return out;
}

/**
 * Restores a validated mission into the vault. Every image is re-encoded first, so a bad image
 * stops the import before anything is written. A replaced project gets the file's records
 * written over it first, and only then loses the records the file does not have.
 */
export async function restoreMission(
  vault: Vault,
  content: MissionContent,
  options: RestoreOptions,
): Promise<RestoreResult> {
  const newId = options.newId ?? (() => globalThis.crypto.randomUUID());
  const clean: ProjectContent[] = [];
  for (const p of content.projects) {
    const evidence: ProjectContent['evidence'] = [];
    for (const e of p.evidence) {
      const img = await options.reencode(e.bytes);
      evidence.push({
        meta: { ...e.meta, width: img.width, height: img.height, byteLength: img.bytes.byteLength },
        bytes: img.bytes,
      });
    }
    clean.push({ ...p, evidence });
  }
  // Theme images are re-encoded too, before anything is written.
  let theme = content.theme;
  if (options.theme && theme) theme = await reencodeTheme(theme, options.reencode);

  const result: RestoreResult = { projects: [], replaced: 0, copied: 0, themeRestored: false };
  for (const p of clean) {
    const existing = await vault.get<Project>('projects', p.project.id);
    let target = p;
    if (existing && options.conflict === 'copy') {
      target = remap(p, newId, `${p.project.name} (copy)`);
      result.copied++;
    } else if (await collides(vault, p)) {
      // Ids taken by another project (e.g. a file imported twice as a copy): import as new.
      target = remap(p, newId, p.project.name);
    }
    await write(vault, target);
    if (existing && target === p) {
      await deleteStale(vault, target);
      result.replaced++;
    }
    result.projects.push(target.project);
  }
  if (options.theme && theme) {
    await saveTheme(vault, theme);
    result.themeRestored = true;
  }
  return result;
}
