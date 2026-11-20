import { calculateBaseScore, toVector } from '../cvss/cvss31';
import { effectiveSeverity, type Finding, findingRef } from '../findings/model';
import { LABELS, type SlideLanguage } from '../slides/theme';

/** Markdown-lite (bold, code, bullets) is a subset of Markdown, so user text is kept as is. */
const block = (title: string, body: string) =>
  body.trim() ? `### ${title}\n\n${body.trim()}\n` : '';
const list = (items: string[], ordered = false) =>
  items
    .map((s) => s.trim())
    .filter(Boolean)
    .map((s, i) => `${ordered ? `${i + 1}.` : '-'} ${s.replace(/\n+/g, ' ')}`)
    .join('\n');

/** One finding as Markdown, labelled in the slide language. */
export function findingMarkdown(
  f: Finding,
  captions: string[],
  language: SlideLanguage,
  headingLevel = 2,
): string {
  const L = LABELS[language];
  const severity = effectiveSeverity(f);
  const score = calculateBaseScore(f.cvss).score.toFixed(1);
  const title = (f.title.trim() || L.untitled).replace(/\n+/g, ' ');
  const lines = [
    `${'#'.repeat(headingLevel)} ${findingRef(f.number)} ${title}`,
    '',
    `**${L.severityLabel}:** ${L.severity[severity]} (${L.cvss} ${score}, \`${toVector(f.cvss)}\`)`,
  ];
  const reason = f.severityOverride?.justification.trim();
  if (reason) lines.push('', `**${L.overrideReason}:** ${reason.replace(/\n+/g, ' ')}`);
  const sections = [
    block(L.assets, list(f.assets)),
    block(L.description, f.description),
    block(L.impact, f.impact),
    block(L.steps, list(f.steps, true)),
    block(L.recommendation, f.recommendation),
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

/** A whole project: title, then each finding in report order. */
export function projectMarkdown(
  projectName: string,
  findings: { finding: Finding; captions: string[] }[],
  language: SlideLanguage,
): string {
  const L = LABELS[language];
  const head = `# ${projectName.trim() || L.untitled}\n\n${L.findingCount(findings.length)}\n`;
  return [head, ...findings.map((x) => findingMarkdown(x.finding, x.captions, language, 2))].join(
    '\n',
  );
}
