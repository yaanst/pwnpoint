import { describe, expect, it } from 'vitest';
import {
  type BaseMetrics,
  calculateBaseScore,
  parseVector,
  roundUp,
  severityOf,
  toVector,
} from './cvss31';

/**
 * Reference vectors: every example in FIRST's "CVSS v3.1 Examples" document
 * (https://www.first.org/cvss/v3.1/examples, retrieved 2026-11-20). Each vector was rebuilt
 * from the metric table of the example and the expected score is the "CVSS v3.1 Base Score"
 * printed in that document.
 */
const FIRST_EXAMPLES: [cve: string, name: string, vector: string, score: number][] = [
  [
    'CVE-2013-0375',
    'MySQL Stored SQL Injection',
    'CVSS:3.1/AV:N/AC:L/PR:L/UI:N/S:C/C:L/I:L/A:N',
    6.4,
  ],
  [
    'CVE-2014-3566',
    'SSLv3 POODLE Vulnerability',
    'CVSS:3.1/AV:N/AC:H/PR:N/UI:R/S:U/C:L/I:N/A:N',
    3.1,
  ],
  [
    'CVE-2012-1516',
    'VMware Guest to Host Escape Vulnerability',
    'CVSS:3.1/AV:N/AC:L/PR:L/UI:N/S:C/C:H/I:H/A:H',
    9.9,
  ],
  [
    'CVE-2009-0783',
    'Apache Tomcat XML Parser Vulnerability',
    'CVSS:3.1/AV:L/AC:L/PR:H/UI:N/S:U/C:L/I:L/A:L',
    4.2,
  ],
  [
    'CVE-2012-0384',
    'Cisco IOS Arbitrary Command Execution Vulnerability',
    'CVSS:3.1/AV:N/AC:L/PR:H/UI:N/S:U/C:H/I:H/A:H',
    7.2,
  ],
  [
    'CVE-2015-1098',
    'Apple iWork Denial of Service Vulnerability',
    'CVSS:3.1/AV:L/AC:L/PR:N/UI:R/S:U/C:H/I:H/A:H',
    7.8,
  ],
  [
    'CVE-2014-0160',
    'OpenSSL Heartbleed Vulnerability',
    'CVSS:3.1/AV:N/AC:L/PR:N/UI:N/S:U/C:H/I:N/A:N',
    7.5,
  ],
  [
    'CVE-2014-6271',
    "GNU Bourne-Again Shell (Bash) 'Shellshock' Vulnerability",
    'CVSS:3.1/AV:N/AC:L/PR:N/UI:N/S:U/C:H/I:H/A:H',
    9.8,
  ],
  ['CVE-2008-1447', 'DNS Kaminsky Bug', 'CVSS:3.1/AV:N/AC:H/PR:N/UI:N/S:C/C:N/I:H/A:N', 6.8],
  [
    'CVE-2014-2005',
    'Sophos Login Screen Bypass Vulnerability',
    'CVSS:3.1/AV:P/AC:L/PR:N/UI:N/S:U/C:H/I:H/A:H',
    6.8,
  ],
  [
    'CVE-2010-0467',
    'Joomla Directory Traversal Vulnerability',
    'CVSS:3.1/AV:N/AC:L/PR:N/UI:N/S:C/C:L/I:N/A:N',
    5.8,
  ],
  [
    'CVE-2012-1342',
    'Cisco Access Control Bypass Vulnerability',
    'CVSS:3.1/AV:N/AC:L/PR:N/UI:N/S:C/C:N/I:L/A:N',
    5.8,
  ],
  [
    'CVE-2013-6014',
    'Juniper Proxy ARP Denial of Service Vulnerability',
    'CVSS:3.1/AV:A/AC:L/PR:N/UI:N/S:C/C:H/I:N/A:H',
    9.3,
  ],
  [
    'CVE-2019-7551',
    'Cantemo Portal Stored Cross-site Scripting Vulnerability',
    'CVSS:3.1/AV:N/AC:L/PR:L/UI:R/S:C/C:H/I:H/A:H',
    9.0,
  ],
  [
    'CVE-2009-0658',
    'Adobe Acrobat Buffer Overflow Vulnerability',
    'CVSS:3.1/AV:L/AC:L/PR:N/UI:R/S:U/C:H/I:H/A:H',
    7.8,
  ],
  [
    'CVE-2011-1265',
    'Microsoft Windows Bluetooth Remote Code Execution Vulnerability',
    'CVSS:3.1/AV:A/AC:L/PR:N/UI:N/S:U/C:H/I:H/A:H',
    8.8,
  ],
  [
    'CVE-2014-2019',
    'Apple iOS Security Control Bypass Vulnerability',
    'CVSS:3.1/AV:P/AC:L/PR:N/UI:N/S:U/C:N/I:H/A:N',
    4.6,
  ],
  [
    'CVE-2015-0970',
    'SearchBlox Cross-Site Request Forgery Vulnerability',
    'CVSS:3.1/AV:N/AC:L/PR:N/UI:R/S:U/C:H/I:H/A:H',
    8.8,
  ],
  [
    'CVE-2014-0224',
    'SSL/TLS MITM Vulnerability',
    'CVSS:3.1/AV:N/AC:H/PR:N/UI:N/S:U/C:H/I:H/A:N',
    7.4,
  ],
  [
    'CVE-2012-5376',
    'Google Chrome Sandbox Bypass vulnerability',
    'CVSS:3.1/AV:N/AC:L/PR:N/UI:R/S:C/C:H/I:H/A:H',
    9.6,
  ],
  [
    'CVE-2016-1645',
    'Google Chrome PDFium JPEG 2000 Remote Code Execution Vulnerability',
    'CVSS:3.1/AV:N/AC:L/PR:N/UI:R/S:U/C:H/I:H/A:H',
    8.8,
  ],
  [
    'CVE-2016-0128, CVE-2016-2118',
    'SAMR/LSAD Privilege Escalation via Protocol Downgrade Vulnerability ("Badlock")',
    'CVSS:3.1/AV:N/AC:H/PR:N/UI:R/S:U/C:H/I:H/A:N',
    6.8,
  ],
  [
    'CVE-2017-5942',
    'WordPress Mail Plugin Reflected Cross-site Scripting Vulnerability',
    'CVSS:3.1/AV:N/AC:L/PR:N/UI:R/S:C/C:L/I:L/A:N',
    6.1,
  ],
  [
    'CVE-2018-18913',
    'Opera DLL search order hijacking',
    'CVSS:3.1/AV:L/AC:L/PR:N/UI:R/S:U/C:H/I:H/A:H',
    7.8,
  ],
  [
    'CVE-2016-5558',
    'Remote Code Execution in Oracle Outside in Technology',
    'CVSS:3.1/AV:N/AC:L/PR:N/UI:N/S:U/C:H/I:L/A:L',
    8.6,
  ],
  ['CVE-2016-5729', 'Lenovo ThnkPwn Exploit', 'CVSS:3.1/AV:L/AC:L/PR:H/UI:N/S:C/C:H/I:H/A:H', 8.2],
  [
    'CVE-2015-2890',
    'Failure to Lock Flash on Resume from sleep',
    'CVSS:3.1/AV:L/AC:L/PR:H/UI:N/S:U/C:N/I:H/A:H',
    6.0,
  ],
  ['CVE-2018-3652', 'Intel DCI Issue', 'CVSS:3.1/AV:P/AC:L/PR:N/UI:N/S:C/C:H/I:H/A:H', 7.6],
];

function metrics(vector: string): BaseMetrics {
  const result = parseVector(vector);
  if (!result.ok) throw new Error(result.errors.join(' '));
  return result.metrics;
}

describe('FIRST CVSS v3.1 examples', () => {
  it('covers at least 15 reference vectors', () => {
    expect(FIRST_EXAMPLES.length).toBeGreaterThanOrEqual(15);
  });

  it.each(FIRST_EXAMPLES)('%s %s → %s = %d', (_cve, _name, vector, expected) => {
    expect(calculateBaseScore(metrics(vector)).score).toBe(expected);
  });
});

describe('calculateBaseScore edge cases', () => {
  it('scores 0.0 / None when there is no impact, whatever the scope', () => {
    for (const s of ['U', 'C']) {
      const r = calculateBaseScore(metrics(`CVSS:3.1/AV:N/AC:L/PR:N/UI:N/S:${s}/C:N/I:N/A:N`));
      expect(r).toMatchObject({ score: 0, severity: 'None', impact: 0 });
    }
  });

  it('caps the score at 10.0 when Scope is Changed', () => {
    // 1.08 × (6.05 + 3.89) ≈ 10.7 before the cap.
    expect(calculateBaseScore(metrics('CVSS:3.1/AV:N/AC:L/PR:N/UI:N/S:C/C:H/I:H/A:H'))).toEqual({
      score: 10,
      severity: 'Critical',
      impact: 6.0,
      exploitability: 3.9,
    });
  });

  it('uses the higher PR weights when Scope is Changed', () => {
    const score = (pr: string, s: string) =>
      calculateBaseScore(metrics(`CVSS:3.1/AV:N/AC:L/PR:${pr}/UI:N/S:${s}/C:H/I:H/A:H`)).score;
    expect(score('L', 'U')).toBe(8.8); // PR:L = 0.62
    expect(score('L', 'C')).toBe(9.9); // PR:L = 0.68
    expect(score('H', 'U')).toBe(7.2); // PR:H = 0.27
    expect(score('H', 'C')).toBe(9.1); // PR:H = 0.50
  });

  it('reports sub-scores rounded to one decimal', () => {
    // Heartbleed: impact 6.42 × 0.56 = 3.5952, exploitability 8.22 × 0.85 × 0.77 × 0.85 × 0.85 ≈ 3.887.
    const r = calculateBaseScore(metrics('CVSS:3.1/AV:N/AC:L/PR:N/UI:N/S:U/C:H/I:N/A:N'));
    expect(r).toEqual({ score: 7.5, severity: 'High', impact: 3.6, exploitability: 3.9 });
  });
});

describe('roundUp (Appendix A)', () => {
  it.each([
    [4.0, 4.0],
    [4.02, 4.1],
    [4.00001, 4.1],
    [0, 0],
    [10, 10],
    [9.81, 9.9],
  ])('roundUp(%d) = %d', (input, expected) => {
    expect(roundUp(input)).toBe(expected);
  });

  it('ignores floating-point noise below 1e-5', () => {
    expect(roundUp(4.000000001)).toBe(4.0);
    expect(roundUp(0.1 + 0.2)).toBe(0.3); // 0.30000000000000004
    // 1.1 × 3 = 3.3000000000000003 in floating point; a naive Math.ceil(x * 10) / 10 gives 3.4.
    expect(roundUp(1.1 * 3)).toBe(3.3);
  });
});

describe('severityOf (specification Table 14)', () => {
  it.each([
    [0, 'None'],
    [0.1, 'Low'],
    [3.9, 'Low'],
    [4.0, 'Medium'],
    [6.9, 'Medium'],
    [7.0, 'High'],
    [8.9, 'High'],
    [9.0, 'Critical'],
    [10, 'Critical'],
  ])('%d → %s', (score, severity) => {
    expect(severityOf(score)).toBe(severity);
  });
});

describe('parseVector', () => {
  it('accepts metrics in any order and serializes them canonically', () => {
    const r = parseVector('  CVSS:3.1/A:N/I:N/C:H/S:U/UI:N/PR:N/AC:L/AV:N ');
    expect(r.ok).toBe(true);
    if (r.ok) expect(toVector(r.metrics)).toBe('CVSS:3.1/AV:N/AC:L/PR:N/UI:N/S:U/C:H/I:N/A:N');
  });

  it('round-trips every FIRST example', () => {
    for (const [, , vector] of FIRST_EXAMPLES) expect(toVector(metrics(vector))).toBe(vector);
  });

  it.each([
    ['', /Paste a vector/],
    ['AV:N/AC:L/PR:N/UI:N/S:U/C:H/I:N/A:N', /must start with "CVSS:3\.1\/"/],
    ['CVSS:3.0/AV:N/AC:L/PR:N/UI:N/S:U/C:H/I:N/A:N', /CVSS 3\.0 vector/],
    ['CVSS:4.0/AV:N/AC:L/AT:N/PR:N/UI:N', /CVSS 4\.0 vector/],
    [
      'CVSS:3.1/AV:X/AC:L/PR:N/UI:N/S:U/C:H/I:N/A:N',
      /AV:X is not valid\. AV must be one of N, A, L, P/,
    ],
    ['CVSS:3.1/AV:N/AV:L/AC:L/PR:N/UI:N/S:U/C:H/I:N/A:N', /AV appears more than once/],
    ['CVSS:3.1/AV:N/AC:L/PR:N/UI:N/S:U/C:H/I:N', /Missing base metric\(s\): A\./],
    ['CVSS:3.1/AV:N/AC:L/PR:N/UI:N/S:U/C:H/I:N/A:N/E:F', /E is a temporal or environmental/],
    ['CVSS:3.1/AV:N/AC:L/PR:N/UI:N/S:U/C:H/I:N/A:N/XX:Y', /XX is not a CVSS 3\.1 base metric/],
    ['CVSS:3.1/AV:N/AC:L/PR:N/UI:N/S:U/C:H/I:N/A:N/', /"" is not a metric/],
    ['CVSS:3.1/av:n/AC:L/PR:N/UI:N/S:U/C:H/I:N/A:N', /av is not a CVSS 3\.1 base metric/],
  ])('rejects %j', (input, message) => {
    const r = parseVector(input);
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.errors.join(' ')).toMatch(message);
  });

  it('reports every problem at once', () => {
    const r = parseVector('CVSS:3.1/AV:X/AC:Q/PR:N');
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.errors).toHaveLength(3);
  });
});
