import type { Page } from '@playwright/test';
import { readFileSync, writeFileSync } from 'node:fs';
import { expect, openWithNewVault, test } from './fixtures';

async function newFinding(page: Page) {
  await openWithNewVault(page);
  await page.getByLabel('New project').fill('ACME');
  await page.getByRole('button', { name: 'Create' }).click();
  await page.getByRole('button', { name: '+ New finding' }).click();
  await expect(page.getByRole('heading', { name: /VLN\.01/ })).toBeVisible();
}

const preview = (page: Page) => page.getByRole('img', { name: /^Slide preview of/ });
const warnings = (page: Page) => page.getByTestId('slide-warnings');

async function pasteImage(page: Page) {
  await page.evaluate(async () => {
    const c = document.createElement('canvas');
    c.width = 640;
    c.height = 360;
    const ctx = c.getContext('2d');
    if (!ctx) throw new Error('no 2d context');
    ctx.fillStyle = '#336699';
    ctx.fillRect(0, 0, 640, 360);
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

test('shows a live 16:9 slide preview with title, severity, CVSS and evidence', async ({
  page,
}) => {
  await newFinding(page);
  await expect(preview(page)).toBeVisible();
  const box = await preview(page).boundingBox();
  expect((box?.width ?? 0) / (box?.height ?? 1)).toBeCloseTo(16 / 9, 1);

  await page.getByLabel('Title', { exact: true }).fill('Kerberoastable service account');
  await page.getByLabel('Recommendation').fill('Use **gMSA** accounts.');
  for (const metric of ['Confidentiality', 'Integrity', 'Availability']) {
    await page
      .getByRole('radiogroup', { name: new RegExp(metric) })
      .getByRole('radio', { name: /High/ })
      .click();
  }
  await expect(preview(page)).toContainText('Kerberoastable service account');
  await expect(preview(page)).toContainText('Critical');
  await expect(preview(page)).toContainText('CVSS 3.1 9.8');
  await expect(preview(page)).toContainText('Recommendation');
  await expect(preview(page).locator('tspan', { hasText: 'gMSA' })).toHaveAttribute(
    'font-weight',
    'bold',
  );
  await expect(warnings(page)).toHaveText('Everything fits on the slide.');

  await expect(preview(page).locator('image')).toHaveCount(0);
  await pasteImage(page);
  await expect(preview(page).locator('image')).toHaveCount(1);
  await page.getByLabel('Caption for evidence 1').fill('Hash cracked in 4 minutes');
  await page.getByLabel('Caption for evidence 1').press('Enter');
  await expect(preview(page)).toContainText('Hash cracked in 4 minutes');
});

test('warns when text overflows instead of shrinking it', async ({ page }) => {
  await newFinding(page);
  const long = Array.from(
    { length: 40 },
    (_, i) => `Detail line ${i + 1} explaining the issue.`,
  ).join('\n');
  await page.getByLabel('Description', { exact: true }).fill(long);
  await expect(warnings(page)).toContainText(/“Description” overflows by \d+ lines/);
  await expect(preview(page).locator('rect.overflow-mark')).toHaveCount(1);
});

test('applies the slide theme: French labels, footer, logo, and contrast warning', async ({
  page,
}) => {
  await openWithNewVault(page);
  await page.getByRole('link', { name: 'Settings' }).click();
  const sample = page.getByRole('img', { name: 'Sample slide with this theme' });
  await expect(sample).toContainText('Recommendation');

  await page.getByLabel('Slide language').selectOption('fr');
  await expect(sample).toContainText('Recommandation');
  await expect(sample).toContainText('Élevée');
  await page.getByLabel('Footer text').fill('ACME – Diffusion restreinte');
  await expect(sample).toContainText('ACME – Diffusion restreinte');

  await page.getByLabel('High badge text').fill('#c2410c'); // same as its background
  await expect(page.getByTestId('contrast-warning')).toContainText('High badge');

  const logoBase64 = await page.evaluate(async () => {
    const c = document.createElement('canvas');
    c.width = 300;
    c.height = 80;
    const ctx = c.getContext('2d');
    if (!ctx) throw new Error('no 2d context');
    ctx.fillStyle = '#0b5cad';
    ctx.fillRect(0, 0, 300, 80);
    return c.toDataURL('image/png').split(',')[1] ?? '';
  });
  await page.getByTestId('logo-file').setInputFiles({
    name: 'logo.png',
    mimeType: 'image/png',
    buffer: Buffer.from(logoBase64, 'base64'),
  });
  await expect(sample.locator('image')).toHaveCount(1);
  await expect(page.getByRole('status').filter({ hasText: 'Theme saved.' })).toBeVisible();

  // The finding editor uses the saved theme.
  await page.getByRole('link', { name: 'Findings' }).click();
  await page.getByLabel('New project').fill('ACME');
  await page.getByRole('button', { name: 'Create' }).click();
  await page.getByRole('button', { name: '+ New finding' }).click();
  await expect(preview(page)).toContainText('Vulnérabilité sans titre');
  await expect(preview(page)).toContainText('ACME – Diffusion restreinte');
});

test('exports a theme and imports it back; rejects an invalid file', async ({ page }, testInfo) => {
  await openWithNewVault(page);
  await page.getByRole('link', { name: 'Settings' }).click();
  await page.getByLabel('Footer text').fill('Exported footer');
  await expect(page.getByRole('status').filter({ hasText: 'Theme saved.' })).toBeVisible();

  const downloadPromise = page.waitForEvent('download');
  await page.getByRole('button', { name: 'Export theme…' }).click();
  const download = await downloadPromise;
  expect(download.suggestedFilename()).toMatch(/\.pwnpoint-theme\.json$/);
  const file = testInfo.outputPath('theme.json');
  await download.saveAs(file);
  const exported = JSON.parse(readFileSync(file, 'utf8'));
  expect(exported.format).toBe('pwnpoint-theme');
  expect(exported.theme.footerText).toBe('Exported footer');

  await page.getByRole('button', { name: 'Reset to default' }).click();
  await expect(page.getByLabel('Footer text')).toHaveValue('Confidential');
  await page.getByTestId('theme-file').setInputFiles(file);
  await expect(page.getByLabel('Footer text')).toHaveValue('Exported footer');

  exported.theme.colors.accent = 'url(javascript:alert(1))';
  const bad = testInfo.outputPath('bad.json');
  writeFileSync(bad, JSON.stringify(exported));
  await page.getByTestId('theme-file').setInputFiles(bad);
  await expect(page.getByRole('alert').filter({ hasText: 'Accent colour' })).toContainText(
    'Accent colour must be a colour like #1a2b3c.',
  );
  await expect(page.getByLabel('Footer text')).toHaveValue('Exported footer');
});
