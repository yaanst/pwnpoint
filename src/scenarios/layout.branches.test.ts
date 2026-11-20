import { describe, expect, it, vi } from 'vitest';
import type { LineElement, RectElement, Slide } from '../slides/layout';
import { fakeMeasure } from '../slides/testing';
import { DEFAULT_THEME } from '../slides/theme';
import { scenarioMarkdown } from '../export/markdown';
import { layoutScenario } from './layout';
import { newScenario, type Scenario, type ScenarioStep, techniqueStep } from './model';

const flags = vi.hoisted(() => ({ scenarioBranches: true }));
vi.mock('../flags', () => ({ isEnabled: (f: 'scenarioBranches') => flags[f] }));

const step = (id: string, technique: string, next?: string[]): ScenarioStep => ({
  ...techniqueStep(id),
  technique,
  gains: 'Access',
  ...(next ? { next } : {}),
});
const scenario = (steps: ScenarioStep[]): Scenario => ({
  ...newScenario('s', 'p', 1, 0),
  title: 'Two ways in',
  steps,
});
// Node outlines are the rectangles with a stroke; arrows are lines with an arrowhead.
const nodes = (s: Slide) =>
  s.elements.filter((e): e is RectElement => e.kind === 'rect' && e.stroke !== undefined);
const arrows = (s: Slide) =>
  s.elements.filter((e): e is LineElement => e.kind === 'line' && !!e.arrowEnd);

// Phishing → Domain user → Domain admin, and Exposed RDP → Domain admin.
const twoRoutes = () =>
  scenario([
    step('phish', 'Phishing', ['user']),
    step('rdp', 'Exposed RDP', ['admin']),
    step('user', 'Domain user', ['admin']),
    { ...step('admin', 'Domain admin', []), chainBreaker: true },
  ]);

describe('branching scenario layout', () => {
  it('draws the steps in columns, left to right, with one arrow per link', () => {
    flags.scenarioBranches = true;
    const layout = layoutScenario(twoRoutes(), new Map(), DEFAULT_THEME, fakeMeasure);
    expect(layout.blocked).toBe(false);
    expect(layout.slides).toHaveLength(1);
    const slide = layout.slides[0] as Slide;
    const [phish, rdp, user, admin] = nodes(slide);
    expect(phish?.x).toBe(rdp?.x); // both are starting steps
    expect(user?.x).toBeGreaterThan(phish?.x ?? 0);
    expect(admin?.x).toBeGreaterThan(user?.x ?? 0);
    expect(arrows(slide)).toHaveLength(3);
    // RDP → admin skips the "Domain user" column: it goes round that step, never through it.
    const segments = slide.elements.filter((e): e is LineElement => e.kind === 'line');
    for (const l of segments) {
      if (!user) break;
      const crossesX = Math.max(l.x1, l.x2) > user.x && Math.min(l.x1, l.x2) < user.x + user.w;
      const crossesY = Math.max(l.y1, l.y2) > user.y && Math.min(l.y1, l.y2) < user.y + user.h;
      expect(crossesX && crossesY).toBe(false);
    }
    // Every arrow goes from the right edge of a node to the left edge of a later one.
    for (const a of arrows(slide)) expect(a.x2).toBeGreaterThan(a.x1);
    expect(slide.warnings).toEqual([]);
  });

  it('keeps the snake layout for a plain chain, and while the feature is off', () => {
    const chain = scenario([step('a', 'A'), step('b', 'B'), step('c', 'C')]);
    expect(
      arrows(layoutScenario(chain, new Map(), DEFAULT_THEME, fakeMeasure).slides[0] as Slide),
    ).toHaveLength(2);
    flags.scenarioBranches = false;
    const off = layoutScenario(twoRoutes(), new Map(), DEFAULT_THEME, fakeMeasure);
    expect(arrows(off.slides[0] as Slide)).toHaveLength(3); // the 4 steps as a chain
    flags.scenarioBranches = true;
  });

  it('reduces the text, then blocks export when the graph cannot fit on one slide', () => {
    flags.scenarioBranches = true;
    // Twelve alternative first steps stacked in one column cannot fit.
    const wide = scenario([
      ...Array.from({ length: 12 }, (_, i) => step(`s${i}`, `Way in ${i + 1}`, ['goal'])),
      step('goal', 'Domain admin', []),
    ]);
    const layout = layoutScenario(wide, new Map(), DEFAULT_THEME, fakeMeasure);
    expect(layout.blocked).toBe(true);
    expect(layout.fontPt).toBe(DEFAULT_THEME.minFontPt);
    expect(layout.slides[0]?.warnings[0]).toMatch(/does not fit on one slide/);
    // Three ways in fit.
    const three = scenario([
      ...Array.from({ length: 3 }, (_, i) => step(`s${i}`, `Way in ${i + 1}`, ['goal'])),
      step('goal', 'Domain admin', []),
    ]);
    expect(layoutScenario(three, new Map(), DEFAULT_THEME, fakeMeasure).blocked).toBe(false);
  });

  it('says where each step leads in Markdown', () => {
    flags.scenarioBranches = true;
    const md = scenarioMarkdown(twoRoutes(), new Map(), 'en');
    expect(md).toContain('1. **Technique: Phishing** → Gains: Access (leads to: 3)');
    expect(md).toContain('2. **Technique: Exposed RDP** → Gains: Access (leads to: 4)');
    expect(md).toContain('(leads to: goal)');
    expect(scenarioMarkdown(twoRoutes(), new Map(), 'fr')).toContain('(mène à: 3)');
  });
});
