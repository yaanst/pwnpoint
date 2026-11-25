import { expect, openWithNewVault, test, TEST_PASSPHRASE } from './fixtures';

const XSS = '<img src=x onerror="document.title=\'pwned\'">';

test('creates a project and a finding, edits every field, and keeps it after a reload', async ({
  page,
}) => {
  await openWithNewVault(page);
  await expect(page.getByText('Create a project')).toBeVisible();
  await page.getByLabel('New project').fill('ACME internal 2026');
  await page.getByRole('button', { name: 'Create' }).click();
  await expect(page.getByLabel('Project', { exact: true }).locator('option:checked')).toHaveText(
    'ACME internal 2026',
  );
  await expect(page.getByLabel('New project')).toHaveValue('');

  await page.getByRole('button', { name: '+ New finding' }).click();
  await expect(page.getByRole('heading', { name: /VLN\.01 Untitled finding/ })).toBeVisible();

  await page.getByLabel('Title', { exact: true }).fill('Kerberoastable service account');
  await page.getByLabel('Affected assets').fill('dc01.acme.local\n\nsvc-sql');
  await page
    .getByLabel('Description', { exact: true })
    .fill(`Uses **RC4** and \`svc-sql\`.\n${XSS}`);
  await page.getByLabel('Impact', { exact: true }).fill('- Domain compromise');
  await page.getByRole('button', { name: '+ Add step' }).click();
  await page.getByRole('button', { name: '+ Add step' }).click();
  await page.getByRole('textbox', { name: 'Step 1' }).fill('Request TGS');
  await page.getByRole('textbox', { name: 'Step 2' }).fill('Crack offline');
  await page.getByRole('button', { name: 'Move step 2 up' }).click();
  await expect(page.getByRole('textbox', { name: 'Step 1' })).toHaveValue('Crack offline');
  await page.getByLabel('References').fill('https://attack.mitre.org/techniques/T1558/003/');
  for (const metric of ['Confidentiality', 'Integrity', 'Availability']) {
    await page
      .getByRole('radiogroup', { name: new RegExp(metric) })
      .getByRole('radio', { name: /High/ })
      .click();
  }
  await expect(page.getByTestId('finding-severity')).toHaveText('Critical');
  await expect(page.getByTestId('save-status')).toHaveText('All changes saved');

  // Preview renders formatting as elements and the payload as plain text.
  await page.getByRole('button', { name: 'Preview' }).first().click();
  const preview = page.getByTestId('f-description-preview');
  await expect(preview.locator('strong')).toHaveText('RC4');
  await expect(preview.locator('code')).toHaveText('svc-sql');
  await expect(preview).toContainText(XSS);
  await expect(preview.locator('img')).toHaveCount(0);
  expect(await page.title()).not.toBe('pwned');

  // Everything survives a reload (and the vault lock).
  await page.reload();
  await page.getByLabel('Passphrase').fill(TEST_PASSPHRASE);
  await page.getByRole('button', { name: 'Unlock' }).click();
  await expect(page.getByLabel('Title', { exact: true })).toHaveValue(
    'Kerberoastable service account',
  );
  await expect(page.getByLabel('Affected assets')).toHaveValue('dc01.acme.local\nsvc-sql');
  await expect(page.getByRole('textbox', { name: 'Step 1' })).toHaveValue('Crack offline');
  await expect(page.getByRole('textbox', { name: 'Step 2' })).toHaveValue('Request TGS');
  await expect(page.getByTestId('cvss-score')).toHaveText('9.8');

  await page.getByRole('link', { name: '← Findings' }).click();
  const item = page.getByTestId('row-VLN.01');
  await expect(item).toContainText('Kerberoastable service account');
  await expect(item).toContainText('Critical');
});

test('requires a title before validating, and a justification for a severity override', async ({
  page,
}) => {
  await openWithNewVault(page);
  await page.getByLabel('New project').fill('P');
  await page.getByRole('button', { name: 'Create' }).click();
  await page.getByRole('button', { name: '+ New finding' }).click();

  await expect(page.getByRole('heading', { name: /VLN\.01/ })).toBeVisible(); // editor is open
  await page.getByLabel('Status', { exact: true }).selectOption('validated');
  await expect(page.getByRole('alert')).toContainText('Add a title.');
  await expect(page.getByLabel('Status', { exact: true })).toHaveValue('draft');

  await page.getByLabel('Override the severity').check();
  await page.getByLabel('Severity shown on slides').selectOption('High');
  await expect(page.getByTestId('finding-severity')).toHaveText('None');
  await expect(page.getByText('The override is ignored until you explain it.')).toBeVisible();
  await page.getByLabel('Justification (required)').fill('Exposed to the Internet');
  await expect(page.getByTestId('finding-severity')).toHaveText('High');

  await page.getByLabel('Title', { exact: true }).fill('Something');
  await page.getByLabel('Status', { exact: true }).selectOption('validated');
  await expect(page.getByLabel('Status', { exact: true })).toHaveValue('validated');
});
