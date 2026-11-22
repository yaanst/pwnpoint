import type { Page } from '@playwright/test';
import { expect, openWithNewVault, test } from './fixtures';

const refs = (page: Page) => page.locator('tbody tr td.ref');

async function newFinding(page: Page, category: string, title: string) {
  await page.getByLabel('Category for new findings').selectOption(category);
  await page.getByRole('button', { name: '+ New finding' }).click();
  await page.getByLabel('Title', { exact: true }).fill(title);
  await expect(page.getByTestId('save-status')).toHaveText('All changes saved');
  await page.getByRole('link', { name: '← Findings' }).click();
}

test.beforeEach(async ({ page }) => {
  await openWithNewVault(page);
  await page.getByLabel('New project').fill('ACME');
  await page.getByRole('button', { name: 'Create' }).click();
});

test('numbers each category on its own and filters by category', async ({ page }) => {
  await newFinding(page, '', 'Default credentials');
  await newFinding(page, 'NET', 'SMBv1 enabled');
  await newFinding(page, 'PHY', 'Unlocked server room');
  await newFinding(page, 'NET', 'Telnet exposed');
  // All score 0.0: same severity, so sorted by category (none first), then number.
  await expect(refs(page)).toHaveText(['VLN.01', 'VLN.NET.01', 'VLN.NET.02', 'VLN.PHY.01']);

  const filters = page.getByRole('search', { name: 'Filter findings' });
  await filters.getByLabel('Category').selectOption('NET');
  await expect(refs(page)).toHaveText(['VLN.NET.01', 'VLN.NET.02']);
  await filters.getByLabel('Category').selectOption('-');
  await expect(refs(page)).toHaveText(['VLN.01']);
  await filters.getByLabel('Category').selectOption('');
  await page.getByLabel('Search').fill('vln.phy');
  await expect(refs(page)).toHaveText(['VLN.PHY.01']);
});

test('renumbers a finding moved to another category, and shows it on the slide', async ({
  page,
}) => {
  await newFinding(page, '', 'Default credentials');
  await page.getByRole('link', { name: 'Default credentials' }).click();
  await expect(page.getByRole('heading', { name: 'VLN.01 Default credentials' })).toBeVisible();
  await page.getByLabel('Category', { exact: true }).selectOption('AD');
  await expect(page.getByTestId('category-status')).toHaveText(
    'Renumbered VLN.01 → VLN.AD.01. VLN.01 will not be reused.',
  );
  await expect(page.getByRole('heading', { name: /VLN\.AD\.01/ })).toBeVisible();
  await expect(page.getByTestId('save-status')).toHaveText('All changes saved');
  await expect(page.locator('svg text', { hasText: 'VLN.AD.01' }).first()).toBeAttached();

  // Back to no category before leaving: the old number comes back.
  await page.getByLabel('Category', { exact: true }).selectOption('');
  await expect(page.getByTestId('category-status')).toHaveText('Back to VLN.01.');
  await page.getByLabel('Category', { exact: true }).selectOption('WEB');
  await expect(page.getByTestId('save-status')).toHaveText('All changes saved');
  await page.getByRole('link', { name: '← Findings' }).click();
  await expect(refs(page)).toHaveText(['VLN.WEB.01']);
  await newFinding(page, '', 'Next one');
  await expect(refs(page)).toHaveText(['VLN.02', 'VLN.WEB.01']);
});

test("adds the project's own categories and removes unused ones", async ({ page }) => {
  await page.getByRole('button', { name: 'Categories…' }).click();
  const dialog = page.getByRole('dialog', { name: 'Finding categories' });
  await expect(dialog.getByRole('row')).toHaveCount(9); // header + 8 built-in
  await dialog.getByLabel('Code').fill('cloud');
  await dialog.getByLabel('Name').fill('Cloud services');
  await dialog.getByRole('button', { name: 'Add' }).click();
  await expect(dialog.getByRole('status')).toHaveText('CLOUD added.');
  await dialog.getByLabel('Code').fill('NET');
  await dialog.getByLabel('Name').fill('Again');
  await dialog.getByRole('button', { name: 'Add' }).click();
  await expect(dialog.getByRole('alert')).toHaveText('NET already exists.');
  await dialog.getByRole('button', { name: 'Close' }).click();

  await newFinding(page, 'CLOUD', 'Public S3 bucket');
  await expect(refs(page)).toHaveText(['VLN.CLOUD.01']);

  await page.getByRole('button', { name: 'Categories…' }).click();
  await dialog.getByRole('button', { name: 'Remove category CLOUD' }).click();
  await expect(dialog.getByRole('alert')).toHaveText(
    'Findings use CLOUD: move them to another category first.',
  );
});
