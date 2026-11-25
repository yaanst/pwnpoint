import { describe, expect, it } from 'vitest';
import type { Project } from '../findings/model';
import { newScenario, type Scenario } from '../scenarios/model';
import type { Slide, TextElement } from '../slides/layout';
import { fakeMeasure } from '../slides/testing';
import { DEFAULT_REPORT_STYLE, DEFAULT_THEME, type SlideTheme } from '../slides/theme';
import { buildReportDeck } from './deck';
import { EMPTY_MISSION } from './mission';

const project: Project = {
  id: 'p',
  name: 'ACME',
  nextFindingNumber: 1,
  createdAt: 0,
  mission: {
    ...EMPTY_MISSION,
    client: 'ACME Corp',
    product: 'Portal',
    from: '2026-10-12',
    to: '2026-10-16',
    version: '1.0',
    leadAuditor: 'J. Doe',
    strengths: ['MFA everywhere'],
    weaknesses: ['Session management'],
    securityLevelReason: 'one major scenario was found',
  },
};
const major: Scenario = { ...newScenario('s', 'p', 1, 0), exploitability: 4, impact: 3 };

/** Every text of a slide, joined (lines of SVG output, without wrapping concerns). */
const texts = (s: Slide | undefined) =>
  (s?.elements ?? [])
    .filter((e): e is TextElement => e.kind === 'text')
    .map((e) => e.paragraphs.map((p) => p.runs.map((r) => r.text).join('')).join(' '))
    .join(' | ');
const byRole = (s: Slide | undefined, role: string) =>
  (s?.elements ?? []).filter((e): e is TextElement => e.kind === 'text' && e.role === role);

describe('buildReportDeck', () => {
  const deck = buildReportDeck({ project, scenarios: [major] }, DEFAULT_THEME, fakeMeasure);

  it('puts an agenda before each section that has slides, with computed pages', () => {
    // Cover, agenda + modalities, agenda + summary, agenda + scenario matrix + 1 scenario,
    // agenda + 6 appendix slides, closing.
    expect(deck.slides).toHaveLength(16);
    expect(deck.sections).toEqual([
      { section: 'introduction', page: 3 },
      { section: 'summary', page: 5 },
      { section: 'scenarios', page: 7 },
      { section: 'appendix', page: 10 },
    ]);
    const agenda = deck.slides[3];
    expect(byRole(agenda, 'agenda-current').map((e) => e.paragraphs[0]?.runs[0]?.text)).toEqual([
      'Executive summary',
    ]);
    expect(byRole(agenda, 'agenda-page').map((e) => e.paragraphs[0]?.runs[0]?.text)).toEqual([
      'Page 3',
      'Page 5',
      'Page 7',
      'Page 10',
    ]);
  });

  it('numbers every slide but the cover and the closing one', () => {
    const numbers = deck.slides.map(
      (s) => byRole(s, 'page-number')[0]?.paragraphs[0]?.runs[0]?.text,
    );
    expect(numbers[0]).toBeUndefined();
    expect(numbers[1]).toBe('| 2');
    expect(numbers[11]).toBe('| 12');
    expect(numbers[14]).toBe('| 15');
    expect(numbers[15]).toBeUndefined();
  });

  it('fills the cover, the modalities and the executive summary', () => {
    expect(texts(deck.slides[0])).toContain('ACME Corp - Portal');
    expect(texts(deck.slides[0])).toContain('12–16 October 2026 | v1.0 | Confidential');
    const modalities = texts(deck.slides[2]);
    expect(modalities).toContain('Assessment modalities');
    expect(modalities).toContain('12 October 2026');
    expect(modalities).toContain('J. Doe');
    const summary = deck.slides[4];
    expect(texts(summary)).toContain(
      'Portal’s security level is Improvements required, as one major scenario was found.',
    );
    expect(texts(summary)).toContain('✓  MFA everywhere');
    // The tick is on the third level (Improvements required).
    const tick = byRole(summary, 'level-tick')[0];
    const names = byRole(summary, 'level-name');
    expect(names.findIndex((n) => Math.abs(n.y - (tick?.y ?? 0) + 0.15) < 0.01)).toBe(2);
  });

  it('has no layout warnings with ordinary content', () => {
    expect(deck.slides.flatMap((s) => s.warnings)).toEqual([]);
  });

  it('warns when the cover has no client nor product, and when a list does not fit', () => {
    const empty = buildReportDeck(
      {
        project: {
          ...project,
          mission: { ...EMPTY_MISSION, strengths: Array.from({ length: 30 }, () => 'Strength') },
        },
        scenarios: [],
      },
      DEFAULT_THEME,
      fakeMeasure,
    );
    expect(empty.slides[0]?.warnings).toEqual(['Add the client and product on the Report page.']);
    expect(empty.slides.flatMap((s) => s.warnings)).toContain(
      '“Strengths” does not fit. Shorten the list.',
    );
  });

  it('uses the report style: cover image, cover logo, French labels', () => {
    const png = new Uint8Array([1]);
    const theme: SlideTheme = {
      ...DEFAULT_THEME,
      language: 'fr',
      report: {
        ...DEFAULT_REPORT_STYLE,
        cover: { bytes: png, width: 1600, height: 900 },
        coverLogo: { bytes: png, width: 400, height: 100 },
      },
    };
    const fr = buildReportDeck({ project, scenarios: [major] }, theme, fakeMeasure);
    const cover = fr.slides[0];
    const sources = cover?.elements.flatMap((e) => (e.kind === 'image' ? [e.source] : []));
    expect(sources).toEqual(['cover', 'coverLogo']);
    expect(texts(cover)).toContain('Rapport d’audit');
    expect(texts(fr.slides[1])).toContain('SOMMAIRE');
    expect(texts(fr.slides[4])).toContain(
      'Le niveau de sécurité de Portal est Améliorations requises',
    );
    expect(fr.slides.at(-1)?.elements.map((e) => e.kind)).toEqual(['image', 'image']);
  });
});
