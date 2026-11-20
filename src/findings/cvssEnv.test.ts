import { describe, expect, it, vi } from 'vitest';
import { findingMarkdown } from '../export/markdown';
import { buildFindingSlide, vectorLines } from '../slides/layout';
import { fakeMeasure } from '../slides/testing';
import { DEFAULT_THEME } from '../slides/theme';
import {
  cvssSeverity,
  effectiveSeverity,
  type Finding,
  findingCvss,
  newFinding,
  sortForReport,
} from './model';

const flags = vi.hoisted(() => ({ cvssAdvanced: true }));
vi.mock('../flags', () => ({ isEnabled: (f: 'cvssAdvanced') => flags[f] }));

const critical = (id: string, number: number): Finding => ({
  ...newFinding(id, 'p', number, 0),
  title: `Finding ${number}`,
  cvss: { AV: 'N', AC: 'L', PR: 'N', UI: 'N', S: 'U', C: 'H', I: 'H', A: 'H' }, // 9.8
});
const lowered = (f: Finding): Finding => ({ ...f, cvssEnv: { CR: 'L', IR: 'L', AR: 'L' } }); // 8.0

const text = (s: ReturnType<typeof buildFindingSlide>, role: string) =>
  s.elements
    .filter((e) => e.kind === 'text' && e.role === role)
    .flatMap((e) =>
      e.kind === 'text' ? e.lines.map((l) => l.line.map((r) => r.text).join('')) : [],
    );

describe('environmental score precedence', () => {
  it('uses the base score by default and the environmental score once one metric is set', () => {
    flags.cvssAdvanced = true;
    const f = critical('a', 1);
    expect(findingCvss(f)).toMatchObject({ kind: 'base', score: 9.8 });
    expect(findingCvss(lowered(f))).toMatchObject({ kind: 'environmental', score: 8.0 });
    expect(cvssSeverity(lowered(f))).toBe('High');
    expect(effectiveSeverity(lowered(f))).toBe('High');
    // A severity override still wins over both.
    const overridden = {
      ...lowered(f),
      severityOverride: { severity: 'Low' as const, justification: 'Lab only' },
    };
    expect(effectiveSeverity(overridden)).toBe('Low');
  });

  it('sorts by the score in use', () => {
    flags.cvssAdvanced = true;
    const a = lowered(critical('a', 1)); // 8.0
    const b = critical('b', 2); // 9.8
    expect(sortForReport([a, b]).map((f) => f.id)).toEqual(['b', 'a']);
  });

  it('ignores environmental metrics while the feature is off', () => {
    flags.cvssAdvanced = false;
    expect(findingCvss(lowered(critical('a', 1)))).toMatchObject({ kind: 'base', score: 9.8 });
    flags.cvssAdvanced = true;
  });

  it('labels the slide score and puts the environmental metrics on a second vector line', () => {
    flags.cvssAdvanced = true;
    const base = buildFindingSlide(critical('a', 1), [], DEFAULT_THEME, fakeMeasure);
    expect(text(base, 'score')).toEqual(['CVSS 3.1 9.8']);
    expect(text(base, 'vector')).toEqual(['CVSS:3.1/AV:N/AC:L/PR:N/UI:N/S:U/C:H/I:H/A:H']);
    const env = buildFindingSlide(lowered(critical('a', 1)), [], DEFAULT_THEME, fakeMeasure);
    expect(text(env, 'score')).toEqual(['CVSS 3.1 environmental 8.0']);
    expect(text(env, 'vector')).toEqual([
      'CVSS:3.1/AV:N/AC:L/PR:N/UI:N/S:U/C:H/I:H/A:H',
      'CR:L/IR:L/AR:L',
    ]);
    expect(env.warnings).toEqual([]);
    const fr = buildFindingSlide(
      lowered(critical('a', 1)),
      [],
      { ...DEFAULT_THEME, language: 'fr' },
      fakeMeasure,
    );
    expect(text(fr, 'score')).toEqual(['CVSS 3.1 environnemental 8.0']);
  });

  it('splits a vector after the base metrics', () => {
    expect(vectorLines('CVSS:3.1/AV:N/AC:L/PR:N/UI:N/S:U/C:H/I:H/A:H')).toHaveLength(1);
    expect(vectorLines('CVSS:3.1/AV:N/AC:L/PR:N/UI:N/S:U/C:H/I:H/A:H/MAV:A/MA:L')[1]).toBe(
      'MAV:A/MA:L',
    );
  });

  it('writes the environmental score and full vector in Markdown', () => {
    flags.cvssAdvanced = true;
    const md = findingMarkdown(lowered(critical('a', 1)), [], 'en');
    expect(md).toContain(
      '(CVSS 3.1 environmental 8.0, `CVSS:3.1/AV:N/AC:L/PR:N/UI:N/S:U/C:H/I:H/A:H/CR:L/IR:L/AR:L`)',
    );
  });
});
