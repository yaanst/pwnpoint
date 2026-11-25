import { expect, openWithNewVault, test, TEST_PASSPHRASE } from './fixtures';

test('fills the mission details and executive summary; the security level follows the scenarios', async ({
  page,
}) => {
  await openWithNewVault(page);
  await page.getByLabel('New project').fill('ACME');
  await page.getByRole('button', { name: 'Create' }).click();

  await page.getByRole('link', { name: 'Report', exact: true }).click();
  await expect(page.getByTestId('security-level')).toHaveText('Satisfactory');
  await expect(page.getByTestId('security-basis')).toHaveText('No rated attack scenario yet.');
  await expect(page.getByTestId('report-problems')).toContainText('Add the client.');

  await page.getByLabel('Client').fill('ACME Corp');
  await page.getByLabel('Product or system').fill('Customer portal');
  await page.getByLabel('First day').fill('2026-10-12');
  await page.getByLabel('Last day').fill('2026-10-16');
  await page.getByLabel('Assessment type').fill('Web application assessment');
  await page.getByLabel('Auditors').fill('A. Auditor\nB. Auditor');
  await page.getByLabel('Strengths').fill('MFA everywhere');
  await page.getByLabel('Why (completes the sentence below)').fill('one major scenario was found');
  await expect(page.getByTestId('security-sentence')).toHaveText(
    'Customer portal’s security level is Satisfactory, as one major scenario was found.',
  );
  await expect(page.getByTestId('report-problems')).toBeHidden();
  await expect(page.getByTestId('save-status')).toHaveText('All changes saved');

  // A Major scenario (Likely × Medium) raises the level.
  await page.getByRole('link', { name: 'Scenarios' }).click();
  await page.getByRole('button', { name: /New scenario/ }).click();
  await page.getByLabel('Title', { exact: true }).fill('Account takeover');
  await page.getByLabel('Exploitability', { exact: true }).selectOption('4');
  await page.getByLabel('Impact', { exact: true }).selectOption('3');
  await expect(page.getByTestId('save-status')).toHaveText('All changes saved');
  await page.getByRole('link', { name: 'Report', exact: true }).click();
  await expect(page.getByTestId('security-level')).toHaveText('Improvements required');
  await expect(page.getByTestId('security-basis')).toHaveText(
    'Set by SCN.01 (Major), the worst rated attack scenario.',
  );

  await page.reload();
  await page.getByLabel('Passphrase').fill(TEST_PASSPHRASE);
  await page.getByRole('button', { name: 'Unlock' }).click();
  await expect(page.getByLabel('Client')).toHaveValue('ACME Corp');
  await expect(page.getByLabel('Last day')).toHaveValue('2026-10-16');
  await expect(page.getByLabel('Auditors')).toHaveValue('A. Auditor\nB. Auditor');
});
