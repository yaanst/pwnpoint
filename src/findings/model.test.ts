import { describe, expect, it } from 'vitest';
import {
  duplicateOf,
  effectiveSeverity,
  filterFindings,
  type Finding,
  findingProblems,
  findingRef,
  NO_CATEGORY,
  newFinding,
  nextNumberFor,
  type Project,
  sortForReport,
  withNumberTaken,
} from './model';

function finding(number: number, patch: Partial<Finding> = {}): Finding {
  return { ...newFinding(`id-${number}`, 'p1', number, 0), ...patch };
}
// Scores checked against the CVSS module: 9.8 Critical, 9.1 Critical, 6.5 Medium.
const critical = { AV: 'N', AC: 'L', PR: 'N', UI: 'N', S: 'U', C: 'H', I: 'H', A: 'H' } as const;
const critical91 = { ...critical, A: 'N' } as const;
const medium = { ...critical, C: 'L', I: 'L', A: 'N' } as const;

describe('findingRef', () => {
  it('pads to two digits and grows beyond 99', () => {
    expect(findingRef({ number: 1 })).toBe('VLN.01');
    expect(findingRef({ number: 42 })).toBe('VLN.42');
    expect(findingRef({ number: 100 })).toBe('VLN.100');
  });

  it('inserts the category code', () => {
    expect(findingRef({ number: 1, category: 'NET' })).toBe('VLN.NET.01');
    expect(findingRef({ number: 123, category: 'AD' })).toBe('VLN.AD.123');
  });
});

describe('category counters', () => {
  const project: Project = { id: 'p', name: 'P', nextFindingNumber: 5, createdAt: 0 };

  it('counts each category on its own, starting at 1', () => {
    expect(nextNumberFor(project, undefined)).toBe(5);
    expect(nextNumberFor(project, 'NET')).toBe(1);
    const p2 = withNumberTaken(withNumberTaken(project, 'NET', 1), 'NET', 2);
    expect(nextNumberFor(p2, 'NET')).toBe(3);
    expect(nextNumberFor(p2, 'PHY')).toBe(1);
    expect(nextNumberFor(p2, undefined)).toBe(5);
    expect(nextNumberFor(withNumberTaken(p2, undefined, 5), undefined)).toBe(6);
  });

  it('never moves a counter backwards', () => {
    const p = withNumberTaken(project, 'NET', 9);
    expect(nextNumberFor(withNumberTaken(p, 'NET', 3), 'NET')).toBe(10);
    expect(project.categoryCounters).toBeUndefined(); // not mutated
  });
});

describe('severity', () => {
  it('derives severity from the CVSS score', () => {
    expect(effectiveSeverity(finding(1))).toBe('None');
    expect(effectiveSeverity(finding(1, { cvss: { ...critical } }))).toBe('Critical');
    expect(effectiveSeverity(finding(1, { cvss: { ...medium } }))).toBe('Medium');
  });

  it('uses an override only when it has a justification', () => {
    const f = finding(1, {
      cvss: { ...medium },
      severityOverride: { severity: 'High', justification: '' },
    });
    expect(effectiveSeverity(f)).toBe('Medium');
    expect(findingProblems({ ...f, title: 'x' })).toEqual([
      'Explain why the severity differs from the CVSS score, or remove the override.',
    ]);
    const justified = {
      ...f,
      severityOverride: { severity: 'High' as const, justification: 'Exposed to the Internet' },
    };
    expect(effectiveSeverity(justified)).toBe('High');
    expect(findingProblems({ ...justified, title: 'x' })).toEqual([]);
  });

  it('requires a title', () => {
    expect(findingProblems(finding(1))).toContain('Add a title.');
  });
});

describe('duplicateOf', () => {
  it('copies content with a new id and number, back to draft, without sharing arrays', () => {
    const original = finding(3, { title: 'SQLi', status: 'validated', assets: ['app.example'] });
    const copy = duplicateOf(original, 'new', 7, 99);
    expect(copy).toMatchObject({
      id: 'new',
      number: 7,
      title: 'SQLi (copy)',
      status: 'draft',
      createdAt: 99,
    });
    copy.assets.push('other');
    expect(original.assets).toEqual(['app.example']);
  });
});

describe('filterFindings and sortForReport', () => {
  const list = [
    finding(1, { title: 'Weak TLS', cvss: { ...medium }, assets: ['vpn.acme.local'] }),
    finding(2, { title: 'SQL injection', cvss: { ...critical }, status: 'validated' }),
    finding(3, { title: 'Verbose errors', cvss: { ...critical91 } }),
  ];

  it('filters by severity, status and text (reference, title, assets)', () => {
    expect(filterFindings(list, { severity: 'Medium' }).map((f) => f.number)).toEqual([1]);
    expect(filterFindings(list, { status: 'validated' }).map((f) => f.number)).toEqual([2]);
    expect(filterFindings(list, { text: 'VPN.ACME' }).map((f) => f.number)).toEqual([1]);
    expect(filterFindings(list, { text: 'vln.03' }).map((f) => f.number)).toEqual([3]);
    expect(filterFindings(list, {})).toHaveLength(3);
    const net = finding(1, { category: 'NET' });
    expect(filterFindings([...list, net], { category: 'NET' })).toEqual([net]);
    expect(filterFindings([...list, net], { category: NO_CATEGORY })).toHaveLength(3);
    expect(filterFindings([...list, net], { text: 'vln.net.01' })).toEqual([net]);
  });

  it('sorts by severity, then score (9.8 before 9.1), then number', () => {
    expect(sortForReport(list).map((f) => f.number)).toEqual([2, 3, 1]);
    const same = { cvss: { ...critical } };
    const tied = [
      finding(2, { ...same, category: 'PHY' }),
      finding(1, { ...same, category: 'NET' }),
      finding(7, same),
      finding(1, { ...same, category: 'PHY' }),
    ];
    expect(sortForReport(tied).map(findingRef)).toEqual([
      'VLN.07',
      'VLN.NET.01',
      'VLN.PHY.01',
      'VLN.PHY.02',
    ]);
  });
});
