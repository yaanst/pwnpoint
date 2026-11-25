import { describe, expect, it } from 'vitest';
import { type Finding, newFinding } from '../findings/model';
import { findingMarkdown, projectMarkdown } from './markdown';

const finding = (patch: Partial<Finding> = {}): Finding => ({
  ...newFinding('f1', 'p1', 4, 0),
  title: 'Stored XSS',
  assets: ['app.example.test', ' '],
  description: 'The **comment** field is not encoded.',
  impact: '- Session theft',
  steps: ['Log in', 'Post `<script>`'],
  references: ['OWASP A03'],
  cvss: { AV: 'N', AC: 'L', PR: 'L', UI: 'R', S: 'C', C: 'L', I: 'L', A: 'N' },
  ...patch,
});

describe('findingMarkdown', () => {
  it('writes every section in order, keeping Markdown-lite as is', () => {
    const recs = [
      {
        ref: 'REC.HAR.01',
        category: 'Hardening',
        title: 'Encode output',
        description: 'Encode on output;\nuse a | safe template.',
      },
    ];
    expect(findingMarkdown(finding(), ['Payload stored', ''], 'en', 2, recs)).toBe(
      [
        '## VLN.04 Stored XSS',
        '',
        '**Severity:** Medium (CVSS 3.1 5.4, `CVSS:3.1/AV:N/AC:L/PR:L/UI:R/S:C/C:L/I:L/A:N`)',
        '',
        '### Affected assets',
        '',
        '- app.example.test',
        '',
        '### Description',
        '',
        'The **comment** field is not encoded.',
        '',
        '### Impact',
        '',
        '- Session theft',
        '',
        '### Steps to reproduce',
        '',
        '1. Log in',
        '2. Post `<script>`',
        '',
        '### Recommendations',
        '',
        '| Reference | Category | Recommendation | Description |',
        '| --- | --- | --- | --- |',
        '| REC.HAR.01 | Hardening | Encode output | Encode on output; use a \\| safe template. |',
        '',
        '### References',
        '',
        '- OWASP A03',
        '',
        '### Evidence',
        '',
        '- Figure 1: Payload stored',
        '- Figure 2',
        '',
      ].join('\n'),
    );
  });

  it('skips empty sections and shows a justified override, in French', () => {
    const md = findingMarkdown(
      finding({
        title: '',
        assets: [],
        impact: '',
        steps: [],
        references: [],
        severityOverride: { severity: 'High', justification: 'Exposed\nto the Internet' },
      }),
      [],
      'fr',
    );
    expect(md).toContain('## VLN.04 Vulnérabilité sans titre');
    expect(md).toContain('**Sévérité:** Élevée');
    expect(md).toContain('**Sévérité ajustée:** Exposed to the Internet');
    expect(md).not.toContain('Impact');
    expect(md).not.toContain('Preuves');
  });
});

describe('projectMarkdown', () => {
  it('starts with the project title and count, then each finding', () => {
    const md = projectMarkdown(
      'Acme',
      [
        { finding: finding(), captions: [] },
        { finding: finding({ id: 'f2', number: 5, title: 'Weak TLS' }), captions: [] },
      ],
      'en',
    );
    expect(md.startsWith('# Acme\n\n2 findings\n\n## VLN.04 Stored XSS')).toBe(true);
    expect(md).toContain('\n## VLN.05 Weak TLS');
  });
});
