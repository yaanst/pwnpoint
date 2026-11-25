import type { Page } from '@playwright/test';
import { expect, openWithNewVault, test, TEST_PASSPHRASE } from './fixtures';

async function addFinding(page: Page, title: string, confidentiality: 'High' | 'Low') {
  await page.getByRole('button', { name: '+ New finding' }).click();
  await page.getByLabel('Title', { exact: true }).fill(title);
  await page
    .getByRole('radiogroup', { name: /Confidentiality/ })
    .getByRole('radio', { name: new RegExp(confidentiality) })
    .click();
  await expect(page.getByTestId('save-status')).toHaveText('All changes saved');
  await page.getByRole('link', { name: '← Findings' }).click();
}

async function pick(page: Page, query: string) {
  const picker = page.getByRole('combobox', { name: 'Add a finding' });
  await picker.fill(query);
  await expect(
    page.getByRole('listbox', { name: 'Findings' }).getByRole('option').first(),
  ).toBeVisible();
  await picker.press('Enter');
}

const squash = (t: string) => t.replace(/\s+/g, '');

test('rates a scenario on the 5-level scales, from the suggestion or by hand', async ({ page }) => {
  await openWithNewVault(page);
  await page.getByLabel('New project').fill('ACME');
  await page.getByRole('button', { name: 'Create' }).click();
  // Both network, no privilege: exploitability 5. Impact: one high (Medium), one low (Low).
  await addFinding(page, 'Exposed database', 'High');
  await addFinding(page, 'Verbose errors', 'Low');

  await page.getByRole('link', { name: 'Scenarios' }).click();
  await page.getByRole('button', { name: /New scenario/ }).click();
  await page.getByLabel('Title', { exact: true }).fill('Data theft');
  await expect(page.getByTestId('scenario-severity')).toHaveText('Not rated');
  await pick(page, 'VLN.02');
  await pick(page, 'VLN.01');

  const suggestion = page.getByTestId('rating-suggestion');
  await expect(suggestion).toContainText('Very likely × Medium → Major');
  await suggestion.getByRole('button', { name: 'Use the suggestion' }).click();
  await expect(suggestion).toBeHidden();
  await expect(page.getByLabel('Exploitability', { exact: true })).toHaveValue('5');
  await expect(page.getByLabel('Impact', { exact: true })).toHaveValue('3');
  await expect(page.getByTestId('scenario-severity')).toHaveText('Major');

  // The auditor disagrees: the database is only reachable from a jump host.
  await page.getByLabel('Exploitability', { exact: true }).selectOption('2');
  await page.getByLabel('Exploitability rationale').fill('Only reachable from the jump host.');
  await expect(page.getByTestId('scenario-severity')).toHaveText('Moderate');
  await expect(suggestion).toBeVisible();
  const slide = page.getByRole('img', { name: /^Scenario slide 1 of/ });
  await expect
    .poll(async () => squash((await slide.textContent()) ?? ''))
    .toContain(squash('Severity: Moderate'));
  await expect
    .poll(async () => squash((await slide.textContent()) ?? ''))
    .toContain(squash('Exploitability: Unlikely'));

  await expect(page.getByTestId('save-status')).toHaveText('All changes saved');
  await page.reload();
  await page.getByLabel('Passphrase').fill(TEST_PASSPHRASE);
  await page.getByRole('button', { name: 'Unlock' }).click();
  await expect(page.getByLabel('Exploitability rationale')).toHaveValue(
    'Only reachable from the jump host.',
  );
  await expect(page.getByTestId('scenario-severity')).toHaveText('Moderate');
});
