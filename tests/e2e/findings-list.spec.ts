import type { Page } from '@playwright/test';
import { expect, openWithNewVault, test } from './fixtures';

/** Creates a finding through the UI and comes back to the list. */
async function addFinding(page: Page, title: string, impact: 'High' | 'Low' | 'None', asset = '') {
  await page.getByRole('button', { name: '+ New finding' }).click();
  await page.getByLabel('Title', { exact: true }).fill(title);
  if (asset) await page.getByLabel('Affected assets').fill(asset);
  if (impact !== 'None') {
    await page
      .getByRole('radiogroup', { name: /Confidentiality/ })
      .getByRole('radio', { name: new RegExp(impact) })
      .click();
  }
  await expect(page.getByTestId('save-status')).toHaveText('All changes saved');
  await page.getByRole('link', { name: '← Findings' }).click();
}

const rows = (page: Page) => page.locator('tbody tr');

test.beforeEach(async ({ page }) => {
  await openWithNewVault(page);
  await page.getByLabel('New project').fill('ACME');
  await page.getByRole('button', { name: 'Create' }).click();
  await addFinding(page, 'Weak TLS on VPN', 'Low', 'vpn.acme.local'); // VLN.01, 5.3 Medium
  await addFinding(page, 'SQL injection in portal', 'High'); // VLN.02, 7.5 High
  await addFinding(page, 'Server banner disclosure', 'None'); // VLN.03, 0.0 None
});

test('lists findings in a table sorted by severity, and filters them', async ({ page }) => {
  await expect(rows(page)).toHaveCount(3);
  await expect(rows(page).locator('td.ref')).toHaveText(['VLN.02', 'VLN.01', 'VLN.03']);
  await expect(page.getByTestId('findings-count')).toHaveText('3 findings');

  await page.getByLabel('Severity', { exact: true }).selectOption('High');
  await expect(rows(page).locator('td.ref')).toHaveText(['VLN.02']);
  await expect(page.getByTestId('findings-count')).toHaveText('Showing 1 of 3 findings');

  await page.getByLabel('Severity', { exact: true }).selectOption('');
  await page.getByLabel('Search').fill('VPN.ACME');
  await expect(rows(page).locator('td.ref')).toHaveText(['VLN.01']);

  await page.getByLabel('Search').fill('vln.03');
  await expect(rows(page).locator('td.ref')).toHaveText(['VLN.03']);

  await page.getByLabel('Search').fill('');
  await page.getByLabel('Status', { exact: true }).selectOption('validated');
  await expect(page.getByText('No finding matches these filters.')).toBeVisible();
  await page.getByRole('button', { name: 'Clear filters' }).click();
  await expect(rows(page)).toHaveCount(3);
});

test('duplicates a finding with the next number', async ({ page }) => {
  await page.getByRole('button', { name: 'Duplicate VLN.02' }).click();
  await expect(page.getByRole('status').filter({ hasText: 'duplicated' })).toHaveText(
    'VLN.02 duplicated as VLN.04.',
  );
  await expect(page.getByTestId('row-VLN.04')).toContainText('SQL injection in portal (copy)');
  await expect(page.getByTestId('row-VLN.04')).toContainText('High');
});

test('deletes only after confirmation, and never reuses the number', async ({ page }) => {
  await page.getByRole('button', { name: 'Delete VLN.03' }).click();
  const dialog = page.getByRole('dialog', { name: 'Delete VLN.03?' });
  await expect(dialog).toContainText('Server banner disclosure');
  await expect(dialog.getByRole('button', { name: 'Cancel' })).toBeFocused();
  await dialog.getByRole('button', { name: 'Cancel' }).click();
  await expect(rows(page)).toHaveCount(3);

  await page.getByRole('button', { name: 'Delete VLN.03' }).click();
  await page.getByRole('dialog').getByRole('button', { name: 'Delete finding' }).click();
  await expect(page.getByTestId('row-VLN.03')).toHaveCount(0);
  await expect(page.getByRole('status').filter({ hasText: 'deleted' })).toHaveText(
    'VLN.03 deleted.',
  );

  await addFinding(page, 'New one', 'None');
  await expect(page.getByTestId('row-VLN.04')).toContainText('New one');
});

test('deletes from the editor without the pending autosave bringing it back', async ({ page }) => {
  await page.getByRole('link', { name: 'Weak TLS on VPN' }).click();
  await page.getByLabel('Title', { exact: true }).fill('Edited just before deleting');
  await page.getByRole('button', { name: 'Delete finding' }).click(); // within the autosave delay
  await page.getByRole('dialog').getByRole('button', { name: 'Delete finding' }).click();
  await expect(page.getByRole('heading', { name: 'Findings', level: 2 })).toBeVisible();
  await page.waitForTimeout(1000); // longer than the autosave delay
  await page.reload();
  await page.getByLabel('Passphrase').fill('correct horse battery staple');
  await page.getByRole('button', { name: 'Unlock' }).click();
  await expect(rows(page)).toHaveCount(2);
  await expect(page.getByTestId('row-VLN.01')).toHaveCount(0);
});

test('renames the project', async ({ page }) => {
  await page.getByRole('button', { name: 'Rename' }).click();
  await page.getByLabel('Project name').fill('ACME external 2026');
  await page.getByRole('button', { name: 'Save', exact: true }).click();
  await expect(page.getByLabel('Project', { exact: true }).locator('option:checked')).toHaveText(
    'ACME external 2026',
  );
});
