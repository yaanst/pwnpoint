import { isLinear, successors } from '../scenarios/graph';
import { effectiveSeverity, type Finding, findingRef, findingCvss } from '../findings/model';
import type { Recommendation, RecommendationRow } from '../recommendations/model';
import { type Scenario, scenarioRef, stepView } from '../scenarios/model';
import { scenarioSeverity } from '../scenarios/rating';
import { LABELS, type SlideLabels, type SlideLanguage } from '../slides/theme';

/** Markdown-lite (bold, code, bullets) is a subset of Markdown, so user text is kept as is. */
const block = (title: string, body: string) =>
  body.trim() ? `### ${title}\n\n${body.trim()}\n` : '';
const list = (items: string[], ordered = false) =>
  items
    .map((s) => s.trim())
    .filter(Boolean)
    .map((s, i) => `${ordered ? `${i + 1}.` : '-'} ${s.replace(/\n+/g, ' ')}`)
    .join('\n');

/** Text for a Markdown table cell: one line, pipes escaped. */
const cell = (t: string) => t.replace(/\s+/g, ' ').trim().replace(/\|/g, '\\|') || '—';

/** A finding's linked recommendations as a Markdown table (empty when there are none). */
function recommendationTable(rows: RecommendationRow[], L: SlideLabels): string {
  if (!rows.length) return '';
  return [
    `| ${L.reference} | ${L.category} | ${L.recommendation} | ${L.description} |`,
    '| --- | --- | --- | --- |',
    ...rows.map((r) => `| ${[r.ref, r.category, r.title, r.description].map(cell).join(' | ')} |`),
  ].join('\n');
}

/** One finding as Markdown, labelled in the slide language. */
export function findingMarkdown(
  f: Finding,
  captions: string[],
  language: SlideLanguage,
  headingLevel = 2,
  recommendations: RecommendationRow[] = [],
): string {
  const L = LABELS[language];
  const severity = effectiveSeverity(f);
  const cvss = findingCvss(f);
  const score = cvss.score.toFixed(1);
  const label = cvss.kind === 'environmental' ? L.cvssEnvironmental : L.cvss;
  const title = (f.title.trim() || L.untitled).replace(/\n+/g, ' ');
  const lines = [
    `${'#'.repeat(headingLevel)} ${findingRef(f)} ${title}`,
    '',
    `**${L.severityLabel}:** ${L.severity[severity]} (${label} ${score}, \`${cvss.vector}\`)`,
  ];
  const reason = f.severityOverride?.justification.trim();
  if (reason) lines.push('', `**${L.overrideReason}:** ${reason.replace(/\n+/g, ' ')}`);
  const sections = [
    block(L.assets, list(f.assets)),
    block(L.description, f.description),
    block(L.impact, f.impact),
    block(L.steps, list(f.steps, true)),
    block(L.recommendations, recommendationTable(recommendations, L)),
    block(L.references, list(f.references)),
    block(
      L.evidence,
      list(captions.map((c, i) => `${L.figure} ${i + 1}${c.trim() ? `: ${c.trim()}` : ''}`)),
    ),
  ].filter(Boolean);
  // Sub-headings follow the finding heading level.
  const sub = '#'.repeat(headingLevel + 1);
  return (
    (
      lines.join('\n') +
      '\n\n' +
      sections.map((s) => s.replace(/^### /, `${sub} `)).join('\n')
    ).trimEnd() + '\n'
  );
}

/** A whole project: title, each finding in report order, then the attack scenarios. */
export function projectMarkdown(
  projectName: string,
  findings: { finding: Finding; captions: string[]; recommendations?: RecommendationRow[] }[],
  language: SlideLanguage,
  scenarios: Scenario[] = [],
  allFindings: Map<string, Finding> = new Map(findings.map((x) => [x.finding.id, x.finding])),
  recs: Recommendation[] = [],
): string {
  const L = LABELS[language];
  const head = `# ${projectName.trim() || L.untitled}\n\n${L.findingCount(findings.length)}\n`;
  return [
    head,
    ...findings.map((x) =>
      findingMarkdown(x.finding, x.captions, language, 2, x.recommendations ?? []),
    ),
    ...scenarios.map((s) => scenarioMarkdown(s, allFindings, language, 2, recs)),
  ].join('\n');
}

/** One attack scenario as Markdown: header, ordered path, context and "Break the chain". */
export function scenarioMarkdown(
  s: Scenario,
  findings: Map<string, Finding>,
  language: SlideLanguage,
  headingLevel = 2,
  recs: Recommendation[] = [],
): string {
  const L = LABELS[language];
  const S = L.scenario;
  const h = '#'.repeat(headingLevel);
  const sub = '#'.repeat(headingLevel + 1);
  const one = (t: string) => t.replace(/\s+/g, ' ').trim();
  const views = s.steps.map((st) => stepView(st, findings, recs));
  const name = (i: number) => {
    const v = views[i];
    const st = s.steps[i];
    if (!v || !st || v.missing) return `*${S.missing}*`;
    if (st.kind === 'finding') {
      const sev = v.severity ? ` (${L.severity[v.severity]})` : '';
      return `**${v.tag} ${one(v.title) || L.untitled}**${sev}`;
    }
    return `**${S.technique}: ${one(v.title) || '…'}**${v.tag ? ` (${v.tag})` : ''}`;
  };
  const lines = [
    `${h} ${scenarioRef(s.number)} ${one(s.title) || S.untitled}`,
    '',
    scenarioRatingLine(s, S),
    '',
    `**${S.start}:** ${one(s.start) || '—'}`,
    '',
    `**${S.goal}:** ${one(s.goal) || '—'}`,
  ];
  if (s.context.trim()) lines.push('', `${sub} ${S.context}`, '', s.context.trim());
  if (s.steps.length) {
    lines.push('', `${sub} ${S.path}`, '');
    const succ = successors(s.steps);
    const branching = !isLinear(succ);
    s.steps.forEach((st, i) => {
      const gains = one(st.gains) ? ` → ${S.gains}: ${one(st.gains)}` : '';
      const breaker = st.chainBreaker ? ` · *${S.chainBreaker}*` : '';
      // Branching scenarios say where each step leads (step numbers, or the goal).
      const next = succ[i] ?? [];
      const leads = !branching
        ? ''
        : ` (${S.leadsTo}: ${next.length ? next.map((j) => j + 1).join(', ') : S.goal.toLowerCase()})`;
      lines.push(`${i + 1}. ${name(i)}${gains}${breaker}${leads}`);
      if (st.note.trim()) lines.push(`   ${one(st.note)}`);
    });
  }
  const breakers = s.steps.flatMap((st, i) => {
    if (!st.chainBreaker) return [];
    const advice = one(st.note) || one(views[i]?.recommendation ?? '');
    return [`- ${name(i)}${advice ? `: ${advice}` : ''}`];
  });
  if (breakers.length) lines.push('', `${sub} ${S.breakChain}`, '', ...breakers);
  return lines.join('\n') + '\n';
}

/** "**Severity:** Major · **Exploitability:** Likely · **Impact:** Significant", or "Not rated". */
function scenarioRatingLine(s: Scenario, S: SlideLabels['scenario']): string {
  const e = s.exploitability;
  const i = s.impact;
  const severity = e && i ? S.levels.severity[scenarioSeverity(e, i)] : S.notRated;
  return [
    `**${S.severity}:** ${severity}`,
    `**${S.exploitability}:** ${e ? S.levels.exploitability[e] : S.notRated}`,
    `**${S.impact}:** ${i ? S.levels.impact[i] : S.notRated}`,
  ].join(' · ');
}
