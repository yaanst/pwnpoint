import { ENV_METRICS, ENV_ORDER, type EnvMetrics } from '../cvss/environmental';
import { BASE_METRICS, type BaseMetrics, METRIC_ORDER, type Severity } from '../cvss/cvss31';
import type { Evidence } from '../evidence/repository';
import {
  allCategories,
  CATEGORY_CODE,
  type Category,
  type CategoryKind,
  DEFAULTS,
  MAX_CATEGORY_NAME,
} from '../findings/categories';
import {
  type Finding,
  type FindingStatus,
  type Project,
  SEVERITIES,
  STATUSES,
} from '../findings/model';
import { isScale3, type Recommendation, type Scale3 } from '../recommendations/model';
import { DATE, type MissionDetails } from '../report/mission';
import { type Scenario, type ScenarioStep } from '../scenarios/model';
import { isRating, LEGACY_LEVELS, type Rating } from '../scenarios/rating';
import { validateThemeFile } from '../slides/themeStore';
import type { SlideTheme } from '../slides/theme';

/**
 * Strict validation of a mission file's content. Nothing from the file is trusted: every record
 * is rebuilt field by field from values of the expected type and size, unknown fields are
 * dropped, references between records are checked, and nothing is ever evaluated.
 */

export const MISSION_FORMAT = 'pwnpoint-mission';
/**
 * Version written. 2 added finding categories, 3 the 5-level scenario rating, 4
 * recommendations, 5 mission details. Older versions are still read.
 */
export const MISSION_VERSION = 5;
export const READABLE_VERSIONS: readonly unknown[] = [1, 2, 3, 4, 5];

export const LIMITS = {
  projects: 1_000,
  findings: 20_000,
  evidence: 20_000,
  scenarios: 5_000,
  recommendations: 10_000,
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
  recommendations: Recommendation[];
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
  const categories = categoryList(c, o.categories, 'finding', `${where} category`);
  if (categories) p.categories = categories;
  const counters = counterMap(c, o.categoryCounters, `${where} category`);
  if (counters) p.categoryCounters = counters;
  if (o.nextRecommendationNumber !== undefined) {
    p.nextRecommendationNumber = c.int(
      o.nextRecommendationNumber,
      `${where} recommendation counter`,
      1,
    );
  }
  const recCategories = categoryList(
    c,
    o.recommendationCategories,
    'recommendation',
    `${where} recommendation category`,
  );
  if (recCategories) p.recommendationCategories = recCategories;
  const recCounters = counterMap(c, o.recommendationCounters, `${where} recommendation category`);
  if (recCounters) p.recommendationCounters = recCounters;
  if (o.mission !== undefined) p.mission = mission(c, o.mission, `${where} details`);
  return p;
}

function mission(c: Checker, v: unknown, where: string): MissionDetails {
  const o = c.obj(v, where);
  const text = (k: string, label: string, max: number = LIMITS.shortText) =>
    c.str(o[k] ?? '', `${where}: ${label}`, max);
  const date = (k: string, label: string) => {
    const d = o[k] ?? '';
    if (d === '' || (typeof d === 'string' && DATE.test(d))) return d as string;
    c.fail(`${where}: ${label} must be a date (YYYY-MM-DD).`);
    return '';
  };
  const list = (k: string, label: string) => c.texts(o[k] ?? [], `${where}: ${label}`);
  return {
    client: text('client', 'client'),
    product: text('product', 'product'),
    from: date('from', 'first day'),
    to: date('to', 'last day'),
    version: text('version', 'version', 40),
    leadAuditor: text('leadAuditor', 'lead auditor'),
    auditors: list('auditors', 'auditor'),
    auditType: text('auditType', 'assessment type'),
    scope: text('scope', 'scope', LIMITS.longText),
    infraType: text('infraType', 'infrastructure type'),
    comments: text('comments', 'comments', LIMITS.longText),
    strengths: list('strengths', 'strength'),
    weaknesses: list('weaknesses', 'area of improvement'),
    securityLevelReason: text('securityLevelReason', 'security level reason', LIMITS.longText),
  };
}

/** A project's own categories: valid, unique codes that do not repeat a built-in one. */
function categoryList(
  c: Checker,
  v: unknown,
  kind: CategoryKind,
  where: string,
): Category[] | undefined {
  if (v === undefined) return undefined;
  const codes = new Set(DEFAULTS[kind].map((x) => x.code));
  return c.list(v, `${where} list`, LIMITS.categories).map((item, j): Category => {
    const w = `${where} ${j + 1}`;
    const cat = c.obj(item, w);
    const code = categoryCode(c, cat.code, w);
    if (codes.has(code)) c.fail(`${w} uses the code ${code} twice.`);
    codes.add(code);
    return { code, name: c.str(cat.name, `${w} name`, MAX_CATEGORY_NAME).trim() || code };
  });
}

/** Next number per category code. */
function counterMap(c: Checker, v: unknown, where: string): Record<string, number> | undefined {
  if (v === undefined) return undefined;
  const entries = Object.entries(c.obj(v, `${where} counters`));
  if (entries.length > LIMITS.categories * 2) c.fail(`${where} has too many counters.`);
  return Object.fromEntries(
    entries
      .slice(0, LIMITS.categories * 2)
      .map(([k, n]) => [
        categoryCode(c, k, `${where} counter`),
        c.int(n, `${where} counter of ${k}`, 1),
      ]),
  );
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

function recommendation(c: Checker, v: unknown, i: number): Recommendation {
  const where = `Recommendation ${i + 1}`;
  const o = c.obj(v, where);
  const r: Recommendation = {
    id: c.id(o.id, where),
    projectId: c.id(o.projectId, `${where} project`),
    number: c.int(o.number, `${where} number`, 1),
    title: c.str(o.title, `${where} title`),
    description: c.str(o.description, `${where} description`, LIMITS.longText),
    findingIds: c
      .list(o.findingIds, `${where} findings`, LIMITS.listItems)
      .map((id) => c.id(id, `${where} finding`)),
    createdAt: c.time(o.createdAt, where),
    updatedAt: c.time(o.updatedAt, where),
  };
  if (o.category !== undefined) r.category = categoryCode(c, o.category, where);
  for (const key of ['complexity', 'workload', 'cost', 'priority'] as const) {
    if (o[key] === undefined) continue;
    if (isScale3(o[key])) r[key] = o[key] as Scale3;
    else c.fail(`${where} ${key} must be 1, 2 or 3.`);
  }
  return r;
}

/** A 1–5 rating; files before version 3 used Critical, High, Medium, Low (5 to 2). */
function rating(c: Checker, v: unknown, version: unknown, where: string): Rating | undefined {
  if (v === undefined) return undefined;
  if (isRating(v)) return v;
  if (version !== MISSION_VERSION && typeof v === 'string' && LEGACY_LEVELS[v]) {
    return LEGACY_LEVELS[v];
  }
  c.fail(`${where} must be a whole number from 1 to 5.`);
  return undefined;
}

function scenario(c: Checker, v: unknown, i: number, version: unknown): Scenario {
  const where = `Scenario ${i + 1}`;
  const o = c.obj(v, where);
  const s: Scenario = {
    id: c.id(o.id, where),
    projectId: c.id(o.projectId, `${where} project`),
    number: c.int(o.number, `${where} number`, 1),
    title: c.str(o.title, `${where} title`),
    start: c.str(o.start, `${where} start`),
    goal: c.str(o.goal, `${where} goal`),
    context: c.str(o.context, `${where} context`, LIMITS.longText),
    exploitabilityRationale:
      o.exploitabilityRationale === undefined
        ? ''
        : c.str(o.exploitabilityRationale, `${where} exploitability rationale`, LIMITS.longText),
    impactRationale:
      o.impactRationale === undefined
        ? ''
        : c.str(o.impactRationale, `${where} impact rationale`, LIMITS.longText),
    steps: c
      .list(o.steps, `${where} steps`, LIMITS.steps)
      .map((s, j) => step(c, s, `${where} step ${j + 1}`)),
    createdAt: c.time(o.createdAt, where),
    updatedAt: c.time(o.updatedAt, where),
  };
  const exploitability = rating(
    c,
    o.exploitability ?? o.likelihood,
    version,
    `${where} exploitability`,
  );
  const impact = rating(c, o.impact, version, `${where} impact`);
  if (exploitability) s.exploitability = exploitability;
  if (impact) s.impact = impact;
  return s;
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
    .map((v, i) => scenario(c, v, i, data.version));
  const recommendations = c
    .list(data.recommendations ?? [], 'Recommendations', LIMITS.recommendations)
    .map((v, i) => recommendation(c, v, i));
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
  recommendations.forEach((r, i) => unique(r.id, `Recommendation ${i + 1}`));

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
  recommendations.forEach((r, i) => {
    const owner = projectById.get(r.projectId);
    const where = `Recommendation ${i + 1}`;
    if (!owner) {
      c.fail(`${where} belongs to no project in the file.`);
      return;
    }
    const codes = allCategories(owner.recommendationCategories, 'recommendation');
    if (r.category && !codes.some((x) => x.code === r.category)) {
      c.fail(`${where} uses the category ${r.category}, which its project does not have.`);
    }
    if (r.findingIds.some((id) => findingById.get(id)?.projectId !== r.projectId)) {
      c.fail(`${where} is linked to a finding that is not in its project.`);
    }
    if (new Set(r.findingIds).size !== r.findingIds.length) {
      c.fail(`${where} is linked to the same finding twice.`);
    }
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
      const ownRecs = recommendations.filter((r) => r.projectId === p.id);
      const recCounters: Record<string, number> = { ...p.recommendationCounters };
      let nextRec = p.nextRecommendationNumber ?? 1;
      for (const r of ownRecs) {
        if (r.category) {
          recCounters[r.category] = Math.max(recCounters[r.category] ?? 1, r.number + 1);
        } else nextRec = Math.max(nextRec, r.number + 1);
      }
      if (ownRecs.length || p.nextRecommendationNumber) project.nextRecommendationNumber = nextRec;
      if (Object.keys(recCounters).length) project.recommendationCounters = recCounters;
      return {
        project,
        findings: own,
        evidence: withBytes.filter((e) => e.meta.projectId === p.id),
        scenarios: ownScenarios,
        recommendations: ownRecs,
      };
    }),
  };
  if (theme) content.theme = theme;
  return { ok: true, content };
}
