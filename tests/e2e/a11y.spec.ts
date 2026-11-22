import type { Page } from '@playwright/test';
import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { expect, openWithNewVault, test } from './fixtures';

/**
 * Accessibility audit with axe-core (WCAG 2.1 A and AA rules) on every page, in light and dark
 * mode. axe is injected by the test runner; it is never part of the app.
 */
const AXE_SOURCE = readFileSync(
  createRequire(import.meta.url).resolve('axe-core/axe.min.js'),
  'utf8',
);

interface Violation {
  id: string;
  help: string;
  nodes: { target: string[]; failureSummary?: string }[];
}

async function audit(page: Page, where: string) {
  await page.evaluate(AXE_SOURCE);
  const violations = await page.evaluate(async () => {
    const axe = (
      window as unknown as {
        axe: { run: (c: unknown, o: unknown) => Promise<{ violations: Violation[] }> };
      }
    ).axe;
    const r = await axe.run(document, {
      runOnly: { type: 'tag', values: ['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa'] },
    });
    return r.violations.map((v) => ({
      id: v.id,
      help: v.help,
      nodes: v.nodes.map((n) => ({ target: n.target, failureSummary: n.failureSummary })),
    }));
  });
  const report = violations.map(
    (v) =>
      `${where}: ${v.id} (${v.help})\n${v.nodes.map((n) => `  - ${n.target.join(' ')}: ${n.failureSummary ?? ''}`).join('\n')}`,
  );
  expect(report, report.join('\n')).toEqual([]);
}

async function pasteImage(page: Page) {
  await page.evaluate(async () => {
    const c = document.createElement('canvas');
    c.width = 320;
    c.height = 200;
    const ctx = c.getContext('2d');
    if (!ctx) throw new Error('no 2d context');
    ctx.fillStyle = '#336699';
    ctx.fillRect(0, 0, 320, 200);
    const blob = await new Promise<Blob>((resolve, reject) =>
      c.toBlob((b) => (b ? resolve(b) : reject(new Error('encode failed'))), 'image/png'),
    );
    const dt = new DataTransfer();
    dt.items.add(new File([blob], 'shot.png', { type: 'image/png' }));
    const paste = new Event('paste', { bubbles: true, cancelable: true });
    Object.defineProperty(paste, 'clipboardData', { value: dt });
    document.body.dispatchEvent(paste);
  });
}

for (const scheme of ['light', 'dark'] as const) {
  test(`every page passes axe in ${scheme} mode`, async ({ page, browserName }) => {
    // Playwright's Firefox build intermittently crashes the page process after a full axe run
    // (about 2 runs in 3, never with single rules or on a minimal page). axe checks the DOM,
    // ARIA and computed CSS, which are the same in both engines, so Chromium runs the audit.
    test.skip(browserName === 'firefox', 'axe-core crashes the Playwright Firefox page process');
    await page.emulateMedia({ colorScheme: scheme });
    await page.goto((await import('./fixtures')).APP_URL);
    await audit(page, 'setup');
    await openWithNewVault(page);
    await audit(page, 'findings (no project)');

    await page.getByLabel('New project').fill('ACME 2026');
    await page.getByRole('button', { name: 'Create' }).click();
    await audit(page, 'findings (empty project)');

    await page.getByRole('button', { name: '+ New finding' }).click();
    await page.getByLabel('Title', { exact: true }).fill('SQL injection');
    await page.getByLabel('Description').fill('**Bold** and `code`.');
    await pasteImage(page);
    await expect(page.getByLabel('Caption for evidence 1')).toBeVisible();
    await expect(page.getByTestId('save-status')).toHaveText('All changes saved');
    await audit(page, 'finding editor');
    await page.getByRole('button', { name: 'Redact / crop evidence 1' }).click();
    await audit(page, 'redaction editor');
    await page.keyboard.press('Escape');
    await expect(page.getByRole('dialog')).toBeHidden();

    await page.getByRole('link', { name: '← Findings' }).click();
    await expect(page.getByTestId('row-VLN.01')).toBeVisible();
    await audit(page, 'findings list');
    await page.getByRole('button', { name: 'Categories…' }).click();
    await audit(page, 'categories dialog');
    await page.getByRole('button', { name: 'Close' }).click();
    await page.getByRole('button', { name: 'Save mission file…' }).click();
    await audit(page, 'save mission dialog');
    await page.getByRole('button', { name: 'Cancel' }).click();

    await page.getByRole('link', { name: 'Scenarios' }).click();
    await audit(page, 'scenarios (empty)');
    await page.getByRole('button', { name: /New scenario/ }).click();
    await page.getByLabel('Title', { exact: true }).fill('Domain takeover');
    for (const [n, name] of [
      [1, 'Phishing'],
      [2, 'Domain admin'],
    ] as const) {
      await page.getByRole('button', { name: '+ Add technique' }).click();
      await page.getByLabel(`Technique (step ${n})`).fill(name);
    }
    await audit(page, 'scenario editor');

    await page.getByRole('link', { name: 'CVSS calculator' }).click();
    // Environmental metrics (behind the cvssAdvanced flag): audit them open.
    const environmental = page.getByText("Environmental metrics (this client's context)");
    if (await environmental.count()) await environmental.click();
    await audit(page, 'CVSS calculator');
    await page.getByRole('link', { name: 'Settings' }).click();
    await audit(page, 'settings');
    await page.reload();
    await audit(page, 'unlock screen');
  });
}
