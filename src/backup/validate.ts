import { ENV_METRICS, ENV_ORDER, type EnvMetrics } from '../cvss/environmental';
import { BASE_METRICS, type BaseMetrics, METRIC_ORDER, type Severity } from '../cvss/cvss31';
import type { Evidence } from '../evidence/repository';
import {
  allCategories,
  CATEGORY_CODE,
  type Category,
  DEFAULT_CATEGORIES,
  MAX_CATEGORY_NAME,
} from '../findings/categories';
import {
  type Finding,
  type FindingStatus,
  type Project,
  SEVERITIES,
  STATUSES,
} from '../findings/model';
import { type Level, LEVELS, type Scenario, type ScenarioStep } from '../scenarios/model';
import { validateThemeFile } from '../slides/themeStore';
import type { SlideTheme } from '../slides/theme';

/**
 * Strict validation of a mission file's content. Nothing from the file is trusted: every record
 * is rebuilt field by field from values of the expected type and size, unknown fields are
 * dropped, references between records are checked, and nothing is ever evaluated.
 */

export const MISSION_FORMAT = 'pwnpoint-mission';
/** Version written. 2 added finding categories; version 1 files are still read. */
export const MISSION_VERSION = 2;
export const READABLE_VERSIONS: readonly unknown[] = [1, 2];

export const LIMITS = {
  projects: 1_000,
  findings: 20_000,
  evidence: 20_000,
  scenarios: 5_000,
  categories: 100,
  steps: 200,
  listItems: 1_000,
  shortText: 1_000,
  longText: 100_000,
  imageBytes: 50 * 1024 * 1024,
  errors: 20,
} as const;

export type MissionScope = 'project' | 'all';

/** A project with everything that belongs to it, image bytes included. */
export interface ProjectContent {
  project: Project;
  findings: Finding[];
  evidence: { meta: Evidence; bytes: Uint8Array<ArrayBuffer> }[];
  scenarios: Scenario[];
}

export interface MissionContent {
  scope: MissionScope;
  exportedAt: number;
  appVersion: string;
  projects: ProjectContent[];
  theme?: SlideTheme;
}

export type ValidationResult =
  { ok: true; content: MissionContent } | { ok: false; errors: string[] };

const ID = /^[A-Za-z0-9_-]{1,100}$/;
const PNG_SIGNATURE = [137, 80, 78, 71, 13, 10, 26, 10];

export const isObj = (v: unknown): v is Record<string, unknown> =>
  typeof v === 'object' && v !== null && !Array.isArray(v);

class Checker {
  errors: string[] = [];

  fail(message: string): void {
    if (this.errors.length < LIMITS.errors) this.errors.push(message);
  }

  str(v: unknown, where: string, max: number = LIMITS.shortText): string {
    if (typeof v === 'string' && v.length <= max) return v;
    this.fail(`${where} must be text of at most ${max.toLocaleString('en')} characters.`);
    return '';
  }

  id(v: unknown, where: string): string {
    if (typeof v === 'string' && ID.test(v)) return v;
    this.fail(`${where} has an invalid id.`);
    return '';
  }

  int(v: unknown, where: string, min = 0): number {
    if (typeof v === 'number' && Number.isSafeInteger(v) && v >= min) return v;
    this.fail(`${where} must be a whole number of at least ${min}.`);
    return min;
  }

  time(v: unknown, where: string): number {
    if (typeof v === 'number' && Number.isFinite(v) && v >= 0 && v < 8.64e15) return v;
    this.fail(`${where} has an invalid date.`);
    return 0;
  }

  bool(v: unknown, where: string): boolean {
    if (typeof v === 'boolean') return v;
    this.fail(`${where} must be true or false.`);
    return false;
  }

  oneOf<T extends string>(v: unknown, allowed: readonly T[], where: string): T {
    if (typeof v === 'string' && (allowed as readonly string[]).includes(v)) return v as T;
    this.fail(`${where} must be one of: ${allowed.join(', ')}.`);
    return allowed[0] as T;
  }

  list(v: unknown, where: string, max: number): unknown[] {
    if (Array.isArray(v) && v.length <= max) return v;
    this.fail(`${where} must be a list of at most ${max.toLocaleString('en')} items.`);
    return [];
  }

  texts(v: unknown, where: string): string[] {
    return this.list(v, where, LIMITS.listItems).map((s, i) =>
      this.str(s, `${where} ${i + 1}`, LIMITS.longText),
    );
  }

  obj(v: unknown, where: string): Record<string, unknown> {
    if (isObj(v)) return v;
    this.fail(`${where} is malformed.`);
    return {};
  }
}

function project(c: Checker, v: unknown, i: number): Project {
  const where = `Project ${i + 1}`;
  const o = c.obj(v, where);
  const p: Project = {
    id: c.id(o.id, where),
    name: c.str(o.name, `${where} name`).trim() || 'Imported project',
    nextFindingNumber: c.int(o.nextFindingNumber, `${where} finding counter`, 1),
    createdAt: c.time(o.createdAt, where),
  };
  if (o.nextScenarioNumber !== undefined) {
    p.nextScenarioNumber = c.int(o.nextScenarioNumber, `${where} scenario counter`, 1);
  }
  if (o.categories !== undefined) {
    const codes = new Set(DEFAULT_CATEGORIES.map((x) => x.code));
    p.categories = c
      .list(o.categories, `${where} categories`, LIMITS.categories)
      .map((v, j): Category => {
        const w = `${where} category ${j + 1}`;
        const cat = c.obj(v, w);
        const code = categoryCode(c, cat.code, w);
        if (codes.has(code)) c.fail(`${w} uses the code ${code} twice.`);
        codes.add(code);
        return { code, name: c.str(cat.name, `${w} name`, MAX_CATEGORY_NAME).trim() || code };
      });
  }
  if (o.categoryCounters !== undefined) {
    const counters = c.obj(o.categoryCounters, `${where} category counters`);
    const entries = Object.entries(counters);
    if (entries.length > LIMITS.categories * 2) c.fail(`${where} has too many category counters.`);
    p.categoryCounters = Object.fromEntries(
      entries
        .slice(0, LIMITS.categories * 2)
        .map(([k, v]) => [
          categoryCode(c, k, `${where} category counter`),
          c.int(v, `${where} counter of ${k}`, 1),
        ]),
    );
  }
  return p;
}

function categoryCode(c: Checker, v: unknown, where: string): string {
  if (typeof v === 'string' && CATEGORY_CODE.test(v)) return v;
  c.fail(`${where} has an invalid category code.`);
  return '';
}

function cvss(c: Checker, v: unknown, where: string): BaseMetrics {
  const o = c.obj(v, `${where} CVSS`);
  const out: Record<string, string> = {};
  for (const key of METRIC_ORDER) {
    out[key] = c.oneOf(o[key], BASE_METRICS[key], `${where} CVSS ${key}`);
  }
  return out as BaseMetrics;
}

function finding(c: Checker, v: unknown, i: number): Finding {
  const where = `Finding ${i + 1}`;
  const o = c.obj(v, where);
  const text = (k: string, label: string) => c.str(o[k], `${where} ${label}`, LIMITS.longText);
  const f: Finding = {
    id: c.id(o.id, where),
    projectId: c.id(o.projectId, `${where} project`),
    number: c.int(o.number, `${where} number`, 1),
    title: c.str(o.title, `${where} title`),
    assets: c.texts(o.assets, `${where} asset`),
    description: text('description', 'description'),
    impact: text('impact', 'impact'),
    steps: c.texts(o.steps, `${where} step`),
    recommendation: text('recommendation', 'recommendation'),
    references: c.texts(o.references, `${where} reference`),
    status: c.oneOf<FindingStatus>(o.status, STATUSES, `${where} status`),
    cvss: cvss(c, o.cvss, where),
    createdAt: c.time(o.createdAt, where),
    updatedAt: c.time(o.updatedAt, where),
  };
  if (o.category !== undefined) f.category = categoryCode(c, o.category, where);
  if (o.cvssEnv !== undefined) {
    const e = c.obj(o.cvssEnv, `${where} environmental metrics`);
    const env: Record<string, string> = {};
    for (const key of ENV_ORDER) {
      if (e[key] === undefined) continue;
      env[key] = c.oneOf(e[key], ENV_METRICS[key], `${where} CVSS ${key}`);
    }
    if (Object.keys(env).length) f.cvssEnv = env as EnvMetrics;
  }
  if (o.severityOverride !== undefined) {
    const s = c.obj(o.severityOverride, `${where} severity override`);
    f.severityOverride = {
      severity: c.oneOf<Severity>(s.severity, SEVERITIES, `${where} severity override`),
      justification: c.str(s.justification, `${where} override justification`, LIMITS.longText),
    };
  }
  return f;
}

function evidence(c: Checker, v: unknown, i: number): Evidence {
  const where = `Image ${i + 1}`;
  const o = c.obj(v, where);
  return {
    id: c.id(o.id, where),
    findingId: c.id(o.findingId, `${where} finding`),
    projectId: c.id(o.projectId, `${where} project`),
    caption: c.str(o.caption, `${where} caption`),
    order: c.int(o.order, `${where} order`),
    // Size fields are replaced with the re-encoded image's real values on import.
    width: c.int(o.width, `${where} width`, 1),
    height: c.int(o.height, `${where} height`, 1),
    byteLength: c.int(o.byteLength, `${where} size`),
    createdAt: c.time(o.createdAt, where),
  };
}

function step(c: Checker, v: unknown, where: string): ScenarioStep {
  const o = c.obj(v, where);
  const kind = c.oneOf<ScenarioStep['kind']>(o.kind, ['finding', 'technique'], `${where} kind`);
  const s: ScenarioStep = {
    id: c.id(o.id, where),
    kind,
    gains: c.str(o.gains, `${where} gains`),
    note: c.str(o.note, `${where} note`, LIMITS.longText),
    chainBreaker: c.bool(o.chainBreaker, `${where} chain breaker`),
  };
  if (kind === 'finding') s.findingId = c.id(o.findingId, `${where} finding`);
  else s.technique = c.str(o.technique, `${where} technique`);
  if (o.mitreId !== undefined) s.mitreId = c.str(o.mitreId, `${where} MITRE id`, 20);
  if (o.next !== undefined) {
    s.next = c.list(o.next, `${where} links`, LIMITS.steps).map((id) => c.id(id, `${where} link`));
  }
  return s;
}

function scenario(c: Checker, v: unknown, i: number): Scenario {
  const where = `Scenario ${i + 1}`;
  const o = c.obj(v, where);
  return {
    id: c.id(o.id, where),
    projectId: c.id(o.projectId, `${where} project`),
    number: c.int(o.number, `${where} number`, 1),
    title: c.str(o.title, `${where} title`),
    start: c.str(o.start, `${where} start`),
    goal: c.str(o.goal, `${where} goal`),
    context: c.str(o.context, `${where} context`, LIMITS.longText),
    impact: c.oneOf<Level>(o.impact, LEVELS, `${where} impact`),
    likelihood: c.oneOf<Level>(o.likelihood, LEVELS, `${where} likelihood`),
    steps: c
      .list(o.steps, `${where} steps`, LIMITS.steps)
      .map((s, j) => step(c, s, `${where} step ${j + 1}`)),
    createdAt: c.time(o.createdAt, where),
    updatedAt: c.time(o.updatedAt, where),
  };
}

const isPng = (b: Uint8Array) => PNG_SIGNATURE.every((x, i) => b[i] === x);

/**
 * Validates `data.json` (already parsed) and the image files of a mission archive.
 * `images` maps an evidence id to its PNG bytes.
 */
export function validateMission(
  data: unknown,
  images: Map<string, Uint8Array<ArrayBuffer>>,
): ValidationResult {
  if (!isObj(data) || data.format !== MISSION_FORMAT) {
    return { ok: false, errors: ['This is not a PwnPoint mission file.'] };
  }
  if (!READABLE_VERSIONS.includes(data.version)) {
    return {
      ok: false,
      errors: ['This mission file was made by a newer version of PwnPoint. Update PwnPoint first.'],
    };
  }
  const c = new Checker();
  const scope = c.oneOf<MissionScope>(data.scope, ['project', 'all'], 'Scope');
  const projects = c
    .list(data.projects, 'Projects', LIMITS.projects)
    .map((v, i) => project(c, v, i));
  const findings = c
    .list(data.findings, 'Findings', LIMITS.findings)
    .map((v, i) => finding(c, v, i));
  const evidenceList = c
    .list(data.evidence, 'Images', LIMITS.evidence)
    .map((v, i) => evidence(c, v, i));
  const scenarios = c
    .list(data.scenarios, 'Scenarios', LIMITS.scenarios)
    .map((v, i) => scenario(c, v, i));
  if (projects.length === 0) c.fail('The file contains no project.');

  // Ids must be unique, and every record must point at something in the file.
  const seen = new Set<string>();
  const unique = (id: string, what: string) => {
    if (id && seen.has(id)) c.fail(`${what} uses an id that appears twice.`);
    seen.add(id);
  };
  projects.forEach((p, i) => unique(p.id, `Project ${i + 1}`));
  findings.forEach((f, i) => unique(f.id, `Finding ${i + 1}`));
  evidenceList.forEach((e, i) => unique(e.id, `Image ${i + 1}`));
  scenarios.forEach((s, i) => unique(s.id, `Scenario ${i + 1}`));

  const projectIds = new Set(projects.map((p) => p.id));
  const findingById = new Map(findings.map((f) => [f.id, f]));
  const projectById = new Map(projects.map((p) => [p.id, p]));
  findings.forEach((f, i) => {
    const owner = projectById.get(f.projectId);
    if (!owner) c.fail(`Finding ${i + 1} belongs to no project in the file.`);
    else if (f.category && !allCategories(owner.categories).some((x) => x.code === f.category)) {
      c.fail(`Finding ${i + 1} uses the category ${f.category}, which its project does not have.`);
    }
  });
  scenarios.forEach((s, i) => {
    if (!projectIds.has(s.projectId))
      c.fail(`Scenario ${i + 1} belongs to no project in the file.`);
  });
  const withBytes: ProjectContent['evidence'] = [];
  evidenceList.forEach((e, i) => {
    const owner = findingById.get(e.findingId);
    if (!owner || owner.projectId !== e.projectId) {
      c.fail(`Image ${i + 1} belongs to no finding in the file.`);
      return;
    }
    const bytes = images.get(e.id);
    if (!bytes) c.fail(`Image ${i + 1} is missing from the file.`);
    else if (bytes.length > LIMITS.imageBytes) c.fail(`Image ${i + 1} is larger than 50 MB.`);
    else if (!isPng(bytes)) c.fail(`Image ${i + 1} is not a PNG image.`);
    else withBytes.push({ meta: e, bytes });
  });

  let theme: SlideTheme | undefined;
  if (data.theme !== undefined && data.theme !== null) {
    const result = validateThemeFile(data.theme);
    if (result.ok) theme = result.theme;
    else result.errors.forEach((e) => c.fail(`Slide theme: ${e}`));
  }

  if (c.errors.length) return { ok: false, errors: c.errors };

  const content: MissionContent = {
    scope,
    exportedAt: typeof data.exportedAt === 'number' ? data.exportedAt : 0,
    appVersion: typeof data.appVersion === 'string' ? data.appVersion.slice(0, 40) : '',
    projects: projects.map((p) => {
      const own = findings.filter((f) => f.projectId === p.id);
      const ownScenarios = scenarios.filter((s) => s.projectId === p.id);
      // Counters must stay ahead of every number in use, or numbers would be handed out twice.
      const maxFinding = Math.max(0, ...own.filter((f) => !f.category).map((f) => f.number));
      const maxScenario = Math.max(0, ...ownScenarios.map((s) => s.number));
      const counters: Record<string, number> = { ...p.categoryCounters };
      for (const f of own) {
        if (f.category) counters[f.category] = Math.max(counters[f.category] ?? 1, f.number + 1);
      }
      const project: Project = {
        ...p,
        nextFindingNumber: Math.max(p.nextFindingNumber, maxFinding + 1),
        nextScenarioNumber: Math.max(p.nextScenarioNumber ?? 1, maxScenario + 1),
      };
      if (Object.keys(counters).length) project.categoryCounters = counters;
      return {
        project,
        findings: own,
        evidence: withBytes.filter((e) => e.meta.projectId === p.id),
        scenarios: ownScenarios,
      };
    }),
  };
  if (theme) content.theme = theme;
  return { ok: true, content };
}
