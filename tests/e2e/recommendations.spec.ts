import type { Page } from '@playwright/test';
import { expect, openWithNewVault, test } from './fixtures';

async function addFinding(page: Page, title: string) {
  await page.getByRole('button', { name: '+ New finding' }).click();
  await page.getByLabel('Title', { exact: true }).fill(title);
  await expect(page.getByTestId('save-status')).toHaveText('All changes saved');
  await page.getByRole('link', { name: '← Findings' }).click();
}

const row = (page: Page, ref: string) => page.getByTestId(`row-${ref}`);

test.beforeEach(async ({ page }) => {
  await openWithNewVault(page);
  await page.getByLabel('New project').fill('ACME');
  await page.getByRole('button', { name: 'Create' }).click();
  await addFinding(page, 'SMBv1 enabled'); // VLN.01
  await addFinding(page, 'Printer stores scans'); // VLN.02
});

test('creates a recommendation, rates it and links it to findings', async ({ page }) => {
  await page.getByRole('link', { name: 'Recommendations' }).click();
  await expect(page.getByText('No recommendations in this project yet')).toBeVisible();
  await page.getByLabel('Category for new recommendations').selectOption('HAR');
  await page.getByRole('button', { name: '+ New recommendation' }).click();
  await expect(page.getByRole('heading', { name: /REC\.HAR\.01/ })).toBeVisible();
  await page.getByLabel('Title', { exact: true }).fill('Disable SMBv1');
  await page.getByLabel('Description').fill('Remove the **SMB1** feature.');
  await expect(page.getByTestId('quadrant')).toHaveText('Not rated');
  await page.getByLabel('Complexity').selectOption('1');
  await page.getByLabel('Workload').selectOption('2');
  await page.getByLabel('Cost').selectOption('2');
  await page.getByLabel('Priority').selectOption('3');
  await expect(page.getByTestId('quadrant')).toHaveText('Quick win');
  await page.getByLabel('Cost').selectOption('3'); // effort 6
  await expect(page.getByTestId('quadrant')).toHaveText('Heavy project');
  await page.getByRole('checkbox', { name: /VLN\.01/ }).check();
  await expect(page.getByTestId('recommendation-problems')).toBeHidden();
  await expect(page.getByTestId('save-status')).toHaveText('All changes saved');

  await page.getByRole('link', { name: '← Recommendations' }).click();
  const r = row(page, 'REC.HAR.01');
  await expect(r).toContainText('Disable SMBv1');
  await expect(r).toContainText('VLN.01');
  await expect(r).toContainText('3 – Top priority');
  await expect(r).toContainText('Heavy project');
});

test('links recommendations from the finding editor, and unlinks deleted findings', async ({
  page,
}) => {
  await page.getByRole('link', { name: 'Printer stores scans' }).click();
  await expect(page.getByRole('heading', { name: /VLN\.02/ })).toBeVisible();
  await page.getByRole('button', { name: '+ New recommendation for this finding' }).click();
  await expect(page.getByRole('heading', { name: /REC\.01/ })).toBeVisible();
  await expect(page.getByRole('checkbox', { name: /VLN\.02/ })).toBeChecked();
  await page.getByLabel('Title', { exact: true }).fill('Disable local storage on printers');
  await page.getByLabel('Category', { exact: true }).selectOption('HAR');
  await expect(page.getByTestId('category-status')).toHaveText(
    'Renumbered REC.01 → REC.HAR.01. REC.01 will not be reused.',
  );
  await expect(page.getByTestId('save-status')).toHaveText('All changes saved');

  // A second recommendation, linked from VLN.01's editor.
  await page.getByRole('link', { name: '← Recommendations' }).click();
  await page.getByLabel('Category for new recommendations').selectOption('ORG');
  await page.getByRole('button', { name: '+ New recommendation' }).click();
  await page.getByLabel('Title', { exact: true }).fill('Awareness training');
  await expect(page.getByTestId('save-status')).toHaveText('All changes saved');
  await page.getByRole('link', { name: 'Findings', exact: true }).click();
  await page.getByRole('link', { name: 'SMBv1 enabled' }).click();
  await expect(page.getByRole('heading', { name: /VLN\.01/ })).toBeVisible();
  await page
    .getByLabel('Recommendation to link')
    .selectOption({ label: 'REC.ORG.01 Awareness training' });
  await page.getByRole('button', { name: 'Link', exact: true }).click();
  await expect(page.getByTestId('linked-recommendations')).toContainText('REC.ORG.01');
  await page.getByLabel('Recommendation to link').selectOption({
    label: 'REC.HAR.01 Disable local storage on printers',
  });
  await page.getByRole('button', { name: 'Link', exact: true }).click();
  await page.getByRole('button', { name: 'Unlink REC.ORG.01' }).click();
  await expect(page.getByTestId('linked-recommendations')).not.toContainText('REC.ORG.01');
  // The finding has no free-text recommendation: its slide lists the linked ones in a table.
  await expect(page.getByRole('textbox', { name: 'Recommendation', exact: true })).toHaveCount(0);
  const slide = page.getByRole('img', { name: /^Slide preview of/ });
  await expect(slide).toContainText('REC.HAR.01');
  await expect(slide).not.toContainText('REC.ORG.01');
  await expect(slide).toContainText('Hardening');

  await page.getByRole('link', { name: 'Recommendations' }).click();
  await expect(row(page, 'REC.HAR.01')).toContainText('VLN.01, VLN.02');
  await expect(row(page, 'REC.ORG.01').locator('td').nth(2)).toHaveText('—');

  // Deleting VLN.02 removes it from the recommendation.
  await page.getByRole('link', { name: 'Findings', exact: true }).click();
  await page.getByRole('button', { name: 'Delete VLN.02' }).click();
  await page.getByRole('button', { name: 'Delete finding' }).click();
  await page.getByRole('link', { name: 'Recommendations' }).click();
  await expect(row(page, 'REC.HAR.01').locator('td').nth(2)).toHaveText('VLN.01');
});

test('has its own categories', async ({ page }) => {
  await page.getByRole('link', { name: 'Recommendations' }).click();
  await page.getByRole('button', { name: 'Categories…' }).click();
  const dialog = page.getByRole('dialog', { name: 'Recommendation categories' });
  await expect(dialog.getByRole('row', { name: /ACC Access control/ })).toBeVisible();
  await dialog.getByLabel('Code').fill('iam');
  await dialog.getByLabel('Name').fill('Identity management');
  await dialog.getByRole('button', { name: 'Add' }).click();
  await expect(dialog.getByRole('status')).toHaveText('IAM added.');
  await dialog.getByRole('button', { name: 'Close' }).click();
  await page.getByLabel('Category for new recommendations').selectOption('IAM');
  await page.getByRole('button', { name: '+ New recommendation' }).click();
  await expect(page.getByRole('heading', { name: /REC\.IAM\.01/ })).toBeVisible();
});
