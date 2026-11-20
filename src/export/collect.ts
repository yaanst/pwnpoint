import { getEvidenceBytes, listEvidence } from '../evidence/repository';
import { type Finding, type Project, sortForReport } from '../findings/model';
import { layoutScenario, type ScenarioLayout } from '../scenarios/layout';
import { type Scenario, scenarioRef } from '../scenarios/model';
import { buildCoverSlide, buildFindingSlide, type Slide } from '../slides/layout';
import type { SlideTheme } from '../slides/theme';
import type { Measure } from '../slides/wrap';
import type { Vault } from '../storage/vault';

export interface SlideBundle {
  slides: Slide[];
  /** PNG bytes by image source (evidence id, 'logo'). */
  images: Record<string, Uint8Array<ArrayBuffer>>;
  /** Evidence captions per finding id, in order (for Markdown). */
  captions: Map<string, string[]>;
}

async function addFinding(
  bundle: SlideBundle,
  vault: Vault,
  finding: Finding,
  theme: SlideTheme,
  measure: Measure,
) {
  const evidence = await listEvidence(vault, finding.id);
  bundle.captions.set(
    finding.id,
    evidence.map((e) => e.caption),
  );
  for (const e of evidence.slice(0, 2)) {
    const bytes = await getEvidenceBytes(vault, e.id);
    if (bytes) bundle.images[e.id] = bytes;
  }
  bundle.slides.push(buildFindingSlide(finding, evidence, theme, measure));
}

const emptyBundle = (theme: SlideTheme): SlideBundle => ({
  slides: [],
  images: theme.logo ? { logo: theme.logo.bytes } : {},
  captions: new Map(),
});

/** One finding's slide with its images. */
export async function findingBundle(
  vault: Vault,
  finding: Finding,
  theme: SlideTheme,
  measure: Measure,
): Promise<SlideBundle> {
  const bundle = emptyBundle(theme);
  await addFinding(bundle, vault, finding, theme, measure);
  return bundle;
}

/**
 * A project deck: a cover, one slide per finding in report order (severity, score), then the
 * attack scenarios. Scenarios that do not fit on two slides are left out and listed in `skipped`.
 */
export async function projectBundle(
  vault: Vault,
  project: Project,
  findings: Finding[],
  theme: SlideTheme,
  measure: Measure,
  date: string,
  scenarios: Scenario[] = [],
  allFindings: Finding[] = findings,
): Promise<SlideBundle & { ordered: Finding[]; skipped: string[] }> {
  const ordered = sortForReport(findings);
  const bundle = emptyBundle(theme);
  bundle.slides.push(buildCoverSlide(project.name, date, ordered.length, theme, measure));
  for (const f of ordered) await addFinding(bundle, vault, f, theme, measure);
  const byId = new Map(allFindings.map((f) => [f.id, f]));
  const skipped: string[] = [];
  for (const s of scenarios) {
    const layout = layoutScenario(s, byId, theme, measure);
    if (layout.blocked) skipped.push(scenarioRef(s.number));
    else bundle.slides.push(...layout.slides);
  }
  return { ...bundle, ordered, skipped };
}

/** One scenario's slides (one or two) with the logo. */
export function scenarioBundle(
  scenario: Scenario,
  findings: Finding[],
  theme: SlideTheme,
  measure: Measure,
): SlideBundle & { layout: ScenarioLayout } {
  const layout = layoutScenario(scenario, new Map(findings.map((f) => [f.id, f])), theme, measure);
  return { ...emptyBundle(theme), slides: layout.slides, layout };
}

/** A file name safe on every OS: letters, digits, dots and dashes. */
export function safeFileName(name: string, fallback: string): string {
  const clean = name
    .normalize('NFKD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/[^\p{L}\p{N}.]+/gu, '-')
    .replace(/^[-.]+|-+$/g, '')
    .slice(0, 80);
  return clean || fallback;
}

export const PPTX_TYPE =
  'application/vnd.openxmlformats-officedocument.presentationml.presentation';

export function downloadBlob(blob: Blob, fileName: string): void {
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = fileName;
  a.click();
  setTimeout(() => URL.revokeObjectURL(url), 10_000);
}

/** Copies a PNG to the clipboard. Throws with a user-facing message if the browser refuses. */
export async function copyPng(png: Blob): Promise<void> {
  if (typeof ClipboardItem === 'undefined' || !navigator.clipboard?.write) {
    throw new Error('This browser cannot copy images. Download the PNG instead.');
  }
  // Clipboard API, not document.write: no HTML is involved.
  // eslint-disable-next-line no-restricted-syntax
  await navigator.clipboard.write([new ClipboardItem({ 'image/png': png })]);
}

export async function copyText(text: string): Promise<void> {
  if (!navigator.clipboard?.writeText) throw new Error('This browser cannot copy text here.');
  await navigator.clipboard.writeText(text);
}

/** Slides with warnings, as 1-based positions. */
export const slidesWithWarnings = (slides: Slide[]) =>
  slides.flatMap((s, i) => (s.warnings.length ? [i + 1] : []));

export const langTag = (theme: SlideTheme) => (theme.language === 'fr' ? 'fr-FR' : 'en-US');
