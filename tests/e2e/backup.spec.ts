import type { Page } from '@playwright/test';
import { readFileSync } from 'node:fs';
import { unzipStored } from '../../src/export/zip';
import { expect, openWithNewVault, test } from './fixtures';

const FILE_PASSPHRASE = 'another long file passphrase';

async function projectWithFinding(page: Page) {
  await openWithNewVault(page);
  await page.getByLabel('New project').fill('ACME 2026');
  await page.getByRole('button', { name: 'Create' }).click();
  await page.getByRole('button', { name: '+ New finding' }).click();
  await page.getByLabel('Title', { exact: true }).fill('SQL injection');
  await page.evaluate(async () => {
    const c = document.createElement('canvas');
    c.width = 320;
    c.height = 200;
    const ctx = c.getContext('2d');
    if (!ctx) throw new Error('no 2d context');
    ctx.fillStyle = '#993333';
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
  await expect(page.getByLabel('Caption for evidence 1')).toBeVisible();
  await expect(page.getByTestId('save-status')).toHaveText('All changes saved');
  await page.getByRole('link', { name: '← Findings' }).click();
}

/** Firefox has no native save dialog: remove it so Chromium takes the same download path. */
const withoutSavePicker = (page: Page) =>
  page.addInitScript(() => {
    delete (window as { showSaveFilePicker?: unknown }).showSaveFilePicker;
  });

/** Stands in for Chrome's native save dialog and keeps what the app writes. */
const recordSavePicker = (page: Page) =>
  page.addInitScript(() => {
    const w = window as unknown as { saved?: Blob; showSaveFilePicker: unknown };
    w.showSaveFilePicker = (o: { suggestedName: string }) =>
      Promise.resolve({
        name: o.suggestedName,
        createWritable: () =>
          Promise.resolve({
            write: (b: Blob) => {
              w.saved = b;
              return Promise.resolve();
            },
            close: () => Promise.resolve(),
          }),
      });
  });

const savedBytes = async (page: Page) =>
  Buffer.from(
    await page.evaluate(async () => {
      const blob = (window as unknown as { saved: Blob }).saved;
      return [...new Uint8Array(await blob.arrayBuffer())];
    }),
  );

async function openFile(page: Page, name: string, buffer: Buffer) {
  await page
    .getByTestId('mission-file')
    .setInputFiles({ name, mimeType: 'application/octet-stream', buffer });
}

test('saves an encrypted mission file and opens it again as a copy', async ({ page }) => {
  await withoutSavePicker(page);
  await projectWithFinding(page);

  await page.getByRole('button', { name: 'Save mission file…' }).click();
  const dialog = page.getByRole('dialog', { name: 'Save mission file' });
  await expect(dialog.getByLabel('Encrypt the file with a passphrase')).toBeChecked();
  await dialog.getByRole('button', { name: 'Save…' }).click();
  await expect(dialog.getByRole('alert')).toContainText('Use at least 12 characters');
  await dialog.getByLabel('File passphrase').fill(FILE_PASSPHRASE);
  await dialog.getByLabel('Type it again').fill(FILE_PASSPHRASE);
  const [download] = await Promise.all([
    page.waitForEvent('download'),
    dialog.getByRole('button', { name: 'Save…' }).click(),
  ]);
  expect(download.suggestedFilename()).toBe('ACME-2026.pwnp');
  await expect(page.getByRole('status').first()).toContainText(
    'Encrypted file downloaded: ACME-2026.pwnp (1 finding, 1 image, 0 scenarios).',
  );
  const bytes = readFileSync(await download.path());
  expect([...unzipStored(bytes).keys()]).toEqual(['pwnpoint.json', 'payload.bin']);
  expect(bytes.toString('latin1')).not.toContain('SQL injection');

  await openFile(page, 'ACME-2026.pwnp', bytes);
  const open = page.getByRole('dialog', { name: 'Open ACME-2026.pwnp' });
  await open.getByLabel('File passphrase').fill('not the passphrase');
  await open.getByRole('button', { name: 'Unlock' }).click();
  await expect(open.getByRole('alert')).toContainText('Wrong passphrase');
  await open.getByLabel('File passphrase').fill(FILE_PASSPHRASE);
  await open.getByRole('button', { name: 'Unlock' }).click();
  await expect(open.getByTestId('mission-contents')).toContainText(
    'ACME 2026: 1 finding, 1 image, 0 scenarios',
  );
  await expect(open.getByLabel('Keep both (import as a copy)')).toBeChecked();
  await open.getByRole('button', { name: 'Import' }).click();
  await expect(open).toBeHidden();

  await expect(page.locator('#project-select option:checked')).toHaveText('ACME 2026 (copy)');
  await expect(page.getByTestId('row-VLN.01')).toContainText('SQL injection');
  await page.getByRole('link', { name: 'SQL injection' }).click();
  await expect(page.getByLabel('Caption for evidence 1')).toBeVisible();
});

test('backs up everything through the native save dialog and restores it', async ({ page }) => {
  await recordSavePicker(page);
  await projectWithFinding(page);

  await page.getByRole('link', { name: 'Settings' }).click();
  await page.getByRole('button', { name: 'Back up everything…' }).click();
  const dialog = page.getByRole('dialog', { name: 'Back up everything' });
  await dialog.getByLabel('Encrypt the file with a passphrase').uncheck();
  await expect(dialog.getByTestId('plain-file-warning')).toBeVisible();
  await dialog.getByRole('button', { name: 'Save…' }).click();
  await expect(
    page.getByText(
      /^File saved: pwnpoint-backup-\d{4}-\d\d-\d\d\.pwnp \(1 project, 1 finding\)\.$/,
    ),
  ).toBeVisible();

  const bytes = await savedBytes(page);
  const files = unzipStored(bytes);
  expect([...files.keys()].slice(0, 2)).toEqual(['pwnpoint.json', 'data.json']);
  const data = JSON.parse(new TextDecoder().decode(files.get('data.json'))) as {
    scope: string;
    theme: { theme: { name: string } };
  };
  expect(data.scope).toBe('all');
  expect(data.theme.theme.name).toBe('Default');

  // Change the finding, then restore the backup over it.
  await page.getByRole('link', { name: 'Findings' }).click();
  await page.getByRole('link', { name: 'SQL injection' }).click();
  await page.getByLabel('Title', { exact: true }).fill('Changed after the backup');
  await expect(page.getByTestId('save-status')).toHaveText('All changes saved');
  await page.getByRole('link', { name: 'Settings' }).click();

  await openFile(page, 'backup.pwnp', bytes);
  const open = page.getByRole('dialog', { name: 'Open backup.pwnp' });
  await expect(open.getByTestId('mission-contents')).toContainText('The slide theme “Default”');
  await open.getByLabel("Replace with the file's version").check();
  await expect(
    open.getByText('Changes made in this browser since the file was saved'),
  ).toBeVisible();
  await open.getByRole('button', { name: 'Import' }).click();
  await expect(
    page.getByText('Imported 1 project (1 finding, 1 image, 0 scenarios).'),
  ).toBeVisible();

  await page.getByRole('link', { name: 'Findings' }).click();
  await expect(page.locator('#project-select option')).toHaveText(['ACME 2026']);
  await expect(page.getByTestId('row-VLN.01')).toContainText('SQL injection');
});

test('refuses a file that is not a mission file, and tells why', async ({ page }) => {
  await openWithNewVault(page);
  await openFile(page, 'notes.pwnp', Buffer.from('not a zip at all'));
  const open = page.getByRole('dialog', { name: 'Open notes.pwnp' });
  await expect(open.getByRole('alert')).toContainText('This is not a PwnPoint mission file');
  await open.getByRole('button', { name: 'Close' }).click();
  await expect(open).toBeHidden();
});
