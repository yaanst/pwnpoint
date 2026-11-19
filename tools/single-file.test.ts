import { createHash } from 'node:crypto';
import { describe, expect, it } from 'vitest';
import { buildCsp, escapeInlineScript, inlineHtml, sha256 } from './single-file';

const html = `<!doctype html><html><head><meta charset="UTF-8" />
<script type="module" crossorigin src="./assets/app.js"></script>
<link rel="stylesheet" crossorigin href="./assets/app.css">
</head><body></body></html>`;
const files: Record<string, string> = {
  'assets/app.js': 'console.log("hi")',
  'assets/app.css': 'a{}',
};
const read = (f: string) => files[f];

describe('single-file inlining', () => {
  it('inlines scripts and styles and leaves no external references', () => {
    const out = inlineHtml(html, read);
    expect(out).toContain('<script type="module">console.log("hi")</script>');
    expect(out).toContain('<style>a{}</style>');
    expect(out).not.toMatch(/src=|href=/);
  });

  it('allows exactly the inlined code by SHA-256 hash', () => {
    const out = inlineHtml(html, read);
    const digest = (t: string) => createHash('sha256').update(t).digest('base64');
    expect(out).toContain(`script-src 'sha256-${digest('console.log("hi")')}'`);
    expect(out).toContain(`style-src 'sha256-${digest('a{}')}'`);
    expect(out).not.toContain("'self'");
    expect(out).not.toContain('unsafe-inline');
  });

  it('puts the CSP right after <meta charset>, before any script', () => {
    const out = inlineHtml(html, read);
    const csp = out.indexOf('Content-Security-Policy');
    expect(csp).toBeGreaterThan(out.indexOf('charset'));
    expect(csp).toBeLessThan(out.indexOf('<script'));
  });

  it('fails on a missing asset', () => {
    expect(() => inlineHtml(html, () => undefined)).toThrow(/missing asset/);
  });

  it('escapes </script so inlined code cannot close its tag', () => {
    expect(escapeInlineScript('s="</script><b>"')).toBe('s="<\\/script><b>"');
    expect(escapeInlineScript('s="</SCRIPT>"')).toBe('s="<\\/SCRIPT>"');
    expect(() => escapeInlineScript('x="<!--"')).toThrow();
  });

  it('builds a CSP that blocks all network access', () => {
    const csp = buildCsp([sha256('a')], []);
    expect(csp).toContain("default-src 'none'");
    expect(csp).toContain("connect-src 'none'");
    expect(csp).toContain("style-src 'none'");
    expect(csp).toContain("form-action 'none'");
  });
});
