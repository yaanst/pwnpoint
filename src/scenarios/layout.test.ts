import { describe, expect, it } from 'vitest';
import { type Finding, newFinding } from '../findings/model';
import type { RectElement, Slide, TextElement } from '../slides/layout';
import { SLIDE_H, SLIDE_W } from '../slides/layout';
import { fakeMeasure } from '../slides/testing';
import { DEFAULT_THEME } from '../slides/theme';
import { lineText } from '../slides/wrap';
import { layoutScenario, mix, snakeCell } from './layout';
import { findingStep, newScenario, type Scenario, techniqueStep } from './model';

const high = { AV: 'N', AC: 'L', PR: 'N', UI: 'N', S: 'U', C: 'H', I: 'N', A: 'N' } as const;
const findings = new Map<string, Finding>(
  Array.from({ length: 20 }, (_, i) => {
    const f = {
      ...newFinding(`f${i}`, 'p', i + 1, 0),
      title: `Finding ${i + 1}`,
      cvss: { ...high },
    };
    return [f.id, f];
  }),
);

function scenario(n: number, title = (i: number) => `Step ${i + 1}`, gains = 'Foothold'): Scenario {
  return {
    ...newScenario('s', 'p', 2, 0),
    title: 'From guest Wi-Fi to domain admin',
    start: 'Guest Wi-Fi',
    goal: 'Domain admin',
    context: 'Internal test, **two days**.',
    steps: Array.from({ length: n }, (_, i) => {
      const step =
        i % 2 === 0
          ? findingStep(`st${i}`, `f${i}`)
          : { ...techniqueStep(`st${i}`), technique: title(i), mitreId: 'T1110.003' };
      return { ...step, gains, chainBreaker: i === 0 };
    }),
  };
}

const nodes = (s: Slide) =>
  s.elements.filter((e): e is RectElement => e.kind === 'rect' && !!e.stroke);
const texts = (s: Slide, role: string) =>
  s.elements.filter((e): e is TextElement => e.kind === 'text' && e.role === role);
const textOf = (e: TextElement | undefined) =>
  e?.lines.map((l) => lineText(l.line)).join(' ') ?? '';
const inside = (s: Slide) =>
  s.elements.every((e) =>
    e.kind === 'line'
      ? Math.max(e.x1, e.x2) <= SLIDE_W && Math.max(e.y1, e.y2) <= SLIDE_H
      : e.x >= 0 && e.y >= 0 && e.x + e.w <= SLIDE_W + 1e-6 && e.y + e.h <= SLIDE_H + 1e-6,
  );
const overlap = (a: RectElement, b: RectElement) =>
  a.x < b.x + b.w && b.x < a.x + a.w && a.y < b.y + b.h && b.y < a.y + a.h;

describe('snakeCell', () => {
  it('fills rows left to right, then right to left', () => {
    expect([0, 1, 2, 3, 4, 5, 6].map((i) => snakeCell(i, 3))).toEqual([
      { row: 0, col: 0 },
      { row: 0, col: 1 },
      { row: 0, col: 2 },
      { row: 1, col: 2 },
      { row: 1, col: 1 },
      { row: 1, col: 0 },
      { row: 2, col: 0 },
    ]);
  });
});

describe('layoutScenario', () => {
  for (const n of [3, 6, 10, 15]) {
    it(`lays out ${n} steps without overlap, inside the slide`, () => {
      const out = layoutScenario(scenario(n), findings, DEFAULT_THEME, fakeMeasure);
      expect(out.blocked).toBe(false);
      expect(out.slides.length).toBeLessThanOrEqual(2);
      expect(out.fontPt).toBeGreaterThanOrEqual(DEFAULT_THEME.minFontPt);
      const all = out.slides.flatMap(nodes);
      expect(all).toHaveLength(n);
      for (const s of out.slides) {
        expect(inside(s)).toBe(true);
        const ns = nodes(s);
        ns.forEach((a, i) => ns.slice(i + 1).forEach((b) => expect(overlap(a, b)).toBe(false)));
        // n - 1 arrows overall, minus the one crossing the slide boundary.
        expect(s.elements.filter((e) => e.kind === 'line' && e.arrowEnd)).toHaveLength(
          Math.max(0, ns.length - 1),
        );
      }
    });
  }

  it('keeps 3 steps on one row at the full font size', () => {
    const out = layoutScenario(scenario(3), findings, DEFAULT_THEME, fakeMeasure);
    expect(out.slides).toHaveLength(1);
    expect(out.fontPt).toBe(12);
    expect(new Set(nodes(out.slides[0] as Slide).map((r) => r.y)).size).toBe(1);
  });

  it('wraps 6 steps as a snake on two rows', () => {
    const out = layoutScenario(scenario(6), findings, DEFAULT_THEME, fakeMeasure);
    const ns = nodes(out.slides[0] as Slide);
    expect(new Set(ns.map((r) => r.y)).size).toBe(2);
    // Step 4 (first of row 2) sits under step 3 (last of row 1).
    expect(ns[3]?.x).toBeCloseTo(ns[2]?.x ?? -1);
  });

  it('shows tags, titles, gains and the chain breaker, and lists it under “Break the chain”', () => {
    const out = layoutScenario(scenario(3), findings, DEFAULT_THEME, fakeMeasure);
    const s = out.slides[0] as Slide;
    expect(textOf(texts(s, 'step-tag')[0])).toBe('1. VLN.01 · High · Chain breaker');
    expect(textOf(texts(s, 'step-tag')[1])).toBe('2. Technique · T1110.003');
    expect(textOf(texts(s, 'step-title')[0])).toBe('Finding 1');
    expect(textOf(texts(s, 'step-gains')[0])).toBe('→ Foothold');
    const sections = texts(s, 'section').map(textOf);
    expect(sections).toContain('Internal test, two days.');
    expect(sections.some((t) => t.startsWith('VLN.01 Finding 1'))).toBe(true);
    expect(textOf(texts(s, 'start')[0])).toBe('Starting position: Guest Wi-Fi');
    expect(s.warnings).toEqual([]);
  });

  it('reduces the font, then splits long labels onto a second slide with markers', () => {
    const long = (i: number) =>
      `A very long technique name number ${i + 1} that wraps on several lines`;
    const out = layoutScenario(
      scenario(12, long, 'Credentials of a privileged service account'),
      findings,
      DEFAULT_THEME,
      fakeMeasure,
    );
    expect(out.blocked).toBe(false);
    expect(out.slides).toHaveLength(2);
    expect(out.fontPt).toBeGreaterThanOrEqual(DEFAULT_THEME.minFontPt);
    const [first, second] = out.slides as [Slide, Slide];
    expect(textOf(texts(first, 'continued-on')[0])).toBe('Continued on the next slide →');
    expect(textOf(texts(second, 'continued-from')[0])).toBe('← Continued from the previous slide');
    expect(textOf(texts(second, 'title')[0])).toBe('From guest Wi-Fi to domain admin');
    // Context and “Break the chain” only on the last slide.
    expect(texts(first, 'section')).toHaveLength(0);
    expect(texts(second, 'section').length).toBeGreaterThan(0);
    // Split at a step boundary: numbering continues on slide 2.
    const firstTag = textOf(texts(second, 'step-tag')[0]);
    expect(firstTag.startsWith(`${(out.splitAt ?? 0) + 1}.`)).toBe(true);
    for (const pt of out.slides.flatMap((s) =>
      s.elements.flatMap((e) => (e.kind === 'text' ? [e.sizePt] : [])),
    )) {
      expect(pt).toBeGreaterThanOrEqual(DEFAULT_THEME.minFontPt);
    }
  });

  it('blocks export when even two slides are not enough', () => {
    const out = layoutScenario(
      scenario(40, (i) => `Technique ${i} `.repeat(6)),
      findings,
      DEFAULT_THEME,
      fakeMeasure,
    );
    expect(out.blocked).toBe(true);
    expect(out.slides).toHaveLength(2);
    expect(out.slides[0]?.warnings[0]).toMatch(/does not fit on 2 slides.*Export is blocked/);
  });

  it('respects a larger theme minimum font size', () => {
    const theme = { ...DEFAULT_THEME, minFontPt: 14 };
    const out = layoutScenario(scenario(6), findings, theme, fakeMeasure);
    const sizes = out.slides.flatMap((s) =>
      s.elements.flatMap((e) => (e.kind === 'text' ? [e.sizePt] : [])),
    );
    expect(Math.min(...sizes)).toBe(14);
  });

  it('shows a deleted finding as a dashed “missing” placeholder and warns', () => {
    const s = scenario(3);
    const out = layoutScenario(
      { ...s, steps: s.steps.map((st, i) => (i === 2 ? { ...st, findingId: 'gone' } : st)) },
      findings,
      DEFAULT_THEME,
      fakeMeasure,
    );
    const slide = out.slides[0] as Slide;
    expect(nodes(slide)[2]?.dashed).toBe(true);
    expect(textOf(texts(slide, 'step-tag')[2])).toBe('3. Missing finding');
    expect(slide.warnings).toContain('Step 3 points to a deleted finding.');
  });

  it('warns when no step is a chain breaker, and handles an empty scenario', () => {
    const s = scenario(2);
    const none = layoutScenario(
      { ...s, steps: s.steps.map((st) => ({ ...st, chainBreaker: false })) },
      findings,
      DEFAULT_THEME,
      fakeMeasure,
    );
    expect(none.slides[0]?.warnings).toContain(
      'No step is marked as a chain breaker: “Break the chain” is empty.',
    );
    const empty = layoutScenario(
      { ...s, steps: [] },
      findings,
      { ...DEFAULT_THEME, language: 'fr' },
      fakeMeasure,
    );
    expect(empty.slides).toHaveLength(1);
    expect(textOf(texts(empty.slides[0] as Slide, 'empty')[0])).toBe(
      'Aucune étape pour l’instant.',
    );
  });
});

describe('mix', () => {
  it('blends two colours', () => {
    expect(mix('#ffffff', '#000000', 0.5)).toBe('#808080');
    expect(mix('#102030', '#102030', 0.3)).toBe('#102030');
  });
});
