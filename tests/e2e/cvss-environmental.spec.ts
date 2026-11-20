import { flags } from '../../src/flags';
import { expect, openWithNewVault, test } from './fixtures';

// The feature ships behind the cvssAdvanced flag; these tests run once it is switched on.
test.skip(!flags.cvssAdvanced, 'cvssAdvanced is off');

const ENV_VECTOR = 'CVSS:3.1/AV:N/AC:L/PR:N/UI:N/S:U/C:H/I:H/A:H/CR:L/IR:L/AR:L';

test('the calculator switches to the environmental score once a metric is set', async ({
  page,
}) => {
  await openWithNewVault(page);
  await page.getByRole('link', { name: 'CVSS calculator' }).click();
  await page
    .getByLabel('Set from a vector string')
    .fill('CVSS:3.1/AV:N/AC:L/PR:N/UI:N/S:U/C:H/I:H/A:H');
  await page.getByRole('button', { name: 'Apply' }).click();
  await expect(page.getByTestId('cvss-score')).toHaveText('9.8');
  await expect(page.getByTestId('cvss-base-score')).toHaveCount(0);

  await page.getByText("Environmental metrics (this client's context)").click();
  const cr = page.getByRole('radiogroup', { name: 'Confidentiality Requirement (CR)' });
  await expect(cr.getByRole('radio', { name: /Not defined/ })).toHaveAttribute(
    'aria-checked',
    'true',
  );
  for (const name of ['Confidentiality', 'Integrity', 'Availability']) {
    await page
      .getByRole('radiogroup', { name: new RegExp(`^${name} Requirement`) })
      .getByRole('radio', { name: /^Low/ })
      .click();
  }
  await expect(page.getByTestId('cvss-score')).toHaveText('8.0');
  await expect(page.getByTestId('cvss-severity')).toHaveText('High');
  await expect(page.getByTestId('cvss-base-score')).toHaveText('(base 9.8)');
  await expect(page.getByTestId('cvss-vector')).toHaveText(ENV_VECTOR);

  await page.getByRole('button', { name: 'Clear environmental metrics' }).click();
  await expect(page.getByTestId('cvss-score')).toHaveText('9.8');

  await page.getByLabel('Set from a vector string').fill(`${ENV_VECTOR}/E:P`);
  await page.getByRole('button', { name: 'Apply' }).click();
  await expect(page.getByRole('alert')).toContainText('E is a temporal metric');
});

test('a finding uses its environmental score in the list and on the slide', async ({ page }) => {
  await openWithNewVault(page);
  await page.getByLabel('New project').fill('ACME 2026');
  await page.getByRole('button', { name: 'Create' }).click();
  await page.getByRole('button', { name: '+ New finding' }).click();
  await page.getByLabel('Title', { exact: true }).fill('SQL injection');
  await page.getByLabel('Set from a vector string').fill(ENV_VECTOR);
  await page.getByRole('button', { name: 'Apply' }).click();
  await expect(page.getByTestId('cvss-score')).toHaveText('8.0');
  const slide = page.getByRole('img', { name: /^Slide preview of/ });
  await expect(slide).toContainText('CVSS 3.1 environmental');
  await expect(slide).toContainText('CR:L/IR:L/AR:L');
  await expect(page.getByTestId('save-status')).toHaveText('All changes saved');

  await page.getByRole('link', { name: '← Findings' }).click();
  const row = page.getByTestId('row-VLN.01');
  await expect(row).toContainText('8.0');
  await expect(row).toContainText('High');
});
