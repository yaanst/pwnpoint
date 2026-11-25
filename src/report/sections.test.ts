import { describe, expect, it } from 'vitest';
import { type Finding, newFinding, type Project } from '../findings/model';
import { newRecommendation, type Recommendation } from '../recommendations/model';
import { findingStep, newScenario, type Scenario } from '../scenarios/model';
import type { Slide, TextElement } from '../slides/layout';
import { fakeMeasure } from '../slides/testing';
import { DEFAULT_THEME } from '../slides/theme';
import { buildReportDeck } from './deck';
import { EMPTY_MISSION } from './mission';

const project: Project = {
  id: 'p',
  name: 'ACME',
  nextFindingNumber: 3,
  createdAt: 0,
  mission: { ...EMPTY_MISSION, client: 'ACME Corp', product: 'Portal' },
};
const f1: Finding = {
  ...newFinding('f1', 'p', 1, 0, 'PHY'),
  title: 'Unlocked server room',
  status: 'validated',
  description: 'Seen during the visit:\n- door open\n- no badge reader',
  cvss: { AV: 'P', AC: 'L', PR: 'N', UI: 'R', S: 'C', C: 'H', I: 'H', A: 'H' },
};
const f2: Finding = { ...newFinding('f2', 'p', 2, 0), title: 'Draft only' };
const recs: Recommendation[] = [
  {
    ...newRecommendation('r1', 'p', 1, 0, 'PHY'),
    title: 'Lock the server room',
    findingIds: ['f1'],
    complexity: 1,
    workload: 1,
    cost: 1,
    priority: 3,
  },
  {
    ...newRecommendation('r2', 'p', 1, 0, 'ORG'),
    title: 'Awareness',
    findingIds: ['f1'],
    priority: 1,
  },
];
const scenarios: Scenario[] = [
  {
    ...newScenario('s1', 'p', 1, 0),
    title: 'Physical intrusion',
    context: 'From the street to the server room.',
    exploitability: 4,
    impact: 5,
    steps: [findingStep('st1', 'f1')],
  },
  { ...newScenario('s2', 'p', 2, 0), title: 'Unrated' },
];

const texts = (s: Slide | undefined) =>
  (s?.elements ?? [])
    .filter((e): e is TextElement => e.kind === 'text')
    .map((e) => e.paragraphs.map((p) => p.runs.map((r) => r.text).join('')).join(' / '))
    .join(' | ');
const titleOf = (s: Slide) =>
  s.elements.find((e): e is TextElement => e.kind === 'text' && e.role === 'title')?.paragraphs[0]
    ?.runs[0]?.text ?? '';

function deckWith(extra: Partial<Parameters<typeof buildReportDeck>[0]> = {}) {
  return buildReportDeck(
    {
      project,
      scenarios,
      findings: [f1, f2],
      recommendations: recs,
      evidence: new Map([['f1', [{ id: 'e1', width: 800, height: 600, caption: 'Door' }]]]),
      ...extra,
    },
    DEFAULT_THEME,
    fakeMeasure,
  );
}

describe('report sections', () => {
  const deck = deckWith();
  const titles = deck.slides.map(titleOf);

  it('adds the scenario, vulnerability and recommendation sections in order', () => {
    expect(deck.sections.map((s) => s.section)).toEqual([
      'introduction',
      'summary',
      'scenarios',
      'vulnerabilities',
      'recommendations',
      'appendix',
    ]);
    expect(titles).toContain('Identified attack scenarios');
    expect(titles).toContain('SCN.01 – Physical intrusion');
    expect(titles).toContain('SCN.02 – Unrated');
    expect(titles).toContain('VLN.PHY.01 – Unlocked server room');
    expect(titles.some((t) => t.includes('Draft only'))).toBe(false); // drafts are left out
    expect(titles).toContain('Proposed action plan* to mitigate attack scenarios');
  });

  it('places each rated scenario in its matrix cell and lists the worst first', () => {
    const slide = deck.slides[titles.indexOf('Identified attack scenarios')];
    const refs = slide?.elements.filter(
      (e): e is TextElement => e.kind === 'text' && e.role === 'matrix-ref',
    );
    expect(refs?.map((r) => r.paragraphs.map((p) => p.runs[0]?.text))).toEqual([['SCN.01']]);
    // Likely (row 2 from the top) × Very significant (column 5).
    const cell = refs?.[0];
    expect(cell?.y).toBeCloseTo(1.2 + 0.35 + 0.92 + 0.03, 5);
    const rows = texts(slide);
    expect(rows.indexOf('SCN.01')).toBeLessThan(rows.indexOf('SCN.02'));
    expect(rows).toContain('Severe');
    expect(rows).toContain('Not rated');
  });

  it('shows the scenario detail with its rating and its attack path', () => {
    const slide = deck.slides[titles.indexOf('SCN.01 – Physical intrusion')];
    const t = texts(slide);
    expect(t).toContain('From the street to the server room.');
    expect(t).toContain('Likely');
    expect(t).toContain('Very significant');
    expect(t).toContain('Main scenario');
    expect(t).toContain('VLN.PHY.01');
    expect(slide?.warnings).toEqual([]);
  });

  it('shows the vulnerability with its vector letters, score, evidence and recommendations', () => {
    const slide = deck.slides[titles.indexOf('VLN.PHY.01 – Unlocked server room')];
    const t = texts(slide);
    for (const letter of ['P', 'L', 'N', 'R', 'H', 'C']) expect(t).toContain(` ${letter} `);
    expect(t).toContain('High');
    expect(t).toContain('•  door open');
    expect(t).toContain('REC.PHY.01');
    expect(t).toContain('Lock the server room');
    expect(t).toContain('Organizational');
    expect(slide?.elements.some((e) => e.kind === 'image' && e.source === 'e1')).toBe(true);
  });

  it('puts recommendations in their quadrant and warns about unrated ones', () => {
    const slide = deck.slides[titles.indexOf('Proposed action plan* to mitigate attack scenarios')];
    const quads = slide?.elements.filter(
      (e): e is TextElement => e.kind === 'text' && e.role === 'quadrant-refs',
    );
    expect(quads?.map((q) => q.paragraphs[0]?.runs[0]?.text)).toEqual(['REC.PHY.01']);
    expect(texts(slide)).toContain('should be challenged by ACME Corp’s stakeholders');
    expect(slide?.warnings).toEqual([
      '1 recommendation(s) are not rated and are left out of the quadrants.',
    ]);
  });

  it('continues a long recommendations table on the next slides', () => {
    const many = Array.from({ length: 14 }, (_, i) => ({
      ...newRecommendation(`m${i}`, 'p', i + 1, 0, 'HAR'),
      title: `Hardening action number ${i + 1}`,
      description: 'Apply the vendor hardening guide and check the result.',
      findingIds: ['f1'],
    }));
    const long = deckWith({ recommendations: many });
    const t = long.slides.map(titleOf);
    expect(t).toContain('VLN.PHY.01 – Unlocked server room (continued)');
    const all = long.slides
      .filter((s) => titleOf(s).startsWith('VLN.PHY.01'))
      .map(texts)
      .join(' ');
    for (let i = 1; i <= 14; i++) expect(all).toContain(`REC.HAR.${String(i).padStart(2, '0')}`);
  });

  it('leaves out sections with nothing to show', () => {
    const bare = deckWith({ findings: [f2], recommendations: [], scenarios: [] });
    expect(bare.sections.map((s) => s.section)).toEqual(['introduction', 'summary', 'appendix']);
  });
});
