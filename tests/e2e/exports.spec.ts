import type { Download, Page } from '@playwright/test';
import { readFileSync } from 'node:fs';
import { unzipStored } from '../../src/export/zip';
import { expect, openWithNewVault, test } from './fixtures';

async function createProject(page: Page) {
  await openWithNewVault(page);
  await page.getByLabel('New project').fill('ACME 2026');
  await page.getByRole('button', { name: 'Create' }).click();
}

async function addFinding(page: Page, title: string, impact: 'High' | 'Low') {
  await page.getByRole('button', { name: '+ New finding' }).click();
  await page.getByLabel('Title', { exact: true }).fill(title);
  await page.getByLabel('Impact', { exact: true }).fill('Fix **it** now.');
  await page
    .getByRole('radiogroup', { name: /Confidentiality/ })
    .getByRole('radio', { name: new RegExp(impact) })
    .click();
  await expect(page.getByTestId('save-status')).toHaveText('All changes saved');
}

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

/** Replaces the clipboard with a recorder: clipboard permissions differ between browsers. */
async function recordClipboard(page: Page) {
  await page.evaluate(() => {
    const w = window as unknown as { copied: string[] };
    w.copied = [];
    Object.defineProperty(navigator, 'clipboard', {
      configurable: true,
      value: {
        writeText: (t: string) => {
          w.copied.push(`text:${t}`);
          return Promise.resolve();
        },
        write: (items: ClipboardItem[]) => {
          w.copied.push(...items.flatMap((i) => i.types.map((t) => `item:${t}`)));
          return Promise.resolve();
        },
      },
    });
  });
}
const copied = (page: Page) =>
  page.evaluate(() => (window as unknown as { copied: string[] }).copied);

async function download(page: Page, button: string): Promise<{ d: Download; bytes: Buffer }> {
  const [d] = await Promise.all([
    page.waitForEvent('download'),
    page.getByRole('button', { name: button }).click(),
  ]);
  const path = await d.path();
  return { d, bytes: readFileSync(path) };
}

const slideXml = (files: Map<string, Uint8Array>, n: number) =>
  new TextDecoder().decode(files.get(`ppt/slides/slide${n}.xml`));

test('exports one finding as .pptx, PNG and Markdown', async ({ page }) => {
  await createProject(page);
  await addFinding(page, 'Kerberoastable service account', 'High');
  await pasteImage(page);
  await page.getByLabel('Caption for evidence 1').fill('Hash cracked');
  await page.getByLabel('Caption for evidence 1').press('Enter');
  await expect(page.getByRole('img', { name: /^Slide preview of/ })).toContainText('Hash cracked');

  const pptx = await download(page, 'Download .pptx');
  expect(pptx.d.suggestedFilename()).toBe('VLN.01-Kerberoastable-service-account.pptx');
  const files = unzipStored(pptx.bytes);
  const xml = slideXml(files, 1);
  expect(xml).toContain('<a:t>Kerberoastable service account</a:t>');
  expect(xml).toContain('descr="Hash cracked"');
  expect(files.has('ppt/media/image1.png')).toBe(true);
  await expect(page.getByTestId('export-status')).toHaveText('PowerPoint file downloaded.');

  const png = await download(page, 'Download PNG');
  expect(png.d.suggestedFilename()).toBe('VLN.01-Kerberoastable-service-account.png');
  expect(png.bytes.subarray(1, 4).toString('latin1')).toBe('PNG');
  expect(png.bytes.readUInt32BE(16)).toBe(1920); // IHDR width
  expect(png.bytes.readUInt32BE(20)).toBe(1080); // IHDR height

  await recordClipboard(page);
  await page.getByRole('button', { name: 'Copy PNG' }).click();
  await expect(page.getByTestId('export-status')).toHaveText(
    'Slide image copied to the clipboard.',
  );
  await page.getByRole('button', { name: 'Copy Markdown' }).click();
  await expect(page.getByTestId('export-status')).toHaveText('Markdown copied to the clipboard.');
  const clip = await copied(page);
  expect(clip[0]).toBe('item:image/png');
  expect(clip[1]).toContain('text:## VLN.01 Kerberoastable service account');
  expect(clip[1]).toContain('- Figure 1: Hash cracked');
});

test('exports a project deck with a cover and findings ordered by severity', async ({ page }) => {
  await createProject(page);
  await addFinding(page, 'Weak TLS', 'Low');
  await page.getByLabel('Status', { exact: true }).selectOption('validated');
  await expect(page.getByTestId('save-status')).toHaveText('All changes saved');
  await page.getByRole('link', { name: '← Findings' }).click();
  await addFinding(page, 'SQL injection', 'High');
  await page.getByRole('link', { name: '← Findings' }).click();

  await page.getByText('Export project').click();
  await expect(page.getByText('1 of 2 findings will be exported')).toBeVisible();
  await page.getByLabel('Validated findings only').uncheck();
  await expect(page.getByText('2 of 2 findings will be exported')).toBeVisible();

  const deck = await download(page, 'Download deck (.pptx)');
  expect(deck.d.suggestedFilename()).toBe('ACME-2026.pptx');
  const files = unzipStored(deck.bytes);
  expect(slideXml(files, 1)).toContain('<a:t>ACME 2026</a:t>');
  expect(slideXml(files, 1)).toContain('2 findings');
  expect(slideXml(files, 2)).toContain('<a:t>SQL injection</a:t>'); // High first
  expect(slideXml(files, 3)).toContain('<a:t>Weak TLS</a:t>');
  expect(files.has('ppt/slides/slide4.xml')).toBe(false);
  await expect(page.getByTestId('project-export-status')).toHaveText('Deck downloaded: 3 slides.');

  const md = await download(page, 'Download Markdown');
  expect(md.d.suggestedFilename()).toBe('ACME-2026.md');
  const text = md.bytes.toString('utf8');
  expect(text.indexOf('## VLN.02 SQL injection')).toBeLessThan(text.indexOf('## VLN.01 Weak TLS'));
});
