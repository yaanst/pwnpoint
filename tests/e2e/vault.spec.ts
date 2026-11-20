import { APP_URL, appHome, expect, openWithNewVault, test, TEST_PASSPHRASE } from './fixtures';

const calculator = appHome; // the app's first screen once unlocked

test('first run asks for a passphrase and validates it', async ({ page }) => {
  await page.goto(APP_URL);
  await expect(page.getByRole('heading', { name: 'Protect your data' })).toBeVisible();
  await expect(calculator(page)).toBeHidden();

  await page.getByLabel('Passphrase', { exact: true }).fill('short');
  await page.getByLabel('Type it again').fill('different');
  await page.getByRole('button', { name: 'Encrypt and continue' }).click();
  const alert = page.getByRole('alert');
  await expect(alert).toContainText('at least 12 characters');
  await expect(alert).toContainText('do not match');
  await expect(calculator(page)).toBeHidden();
});

test('locks on reload and only opens with the right passphrase', async ({ page }) => {
  await openWithNewVault(page);
  await page.reload();
  await expect(page.getByRole('heading', { name: /Unlock PwnPoint/ })).toBeVisible();
  await expect(calculator(page)).toBeHidden();

  await page.getByLabel('Passphrase').fill('not the passphrase');
  await page.getByRole('button', { name: 'Unlock' }).click();
  await expect(page.getByRole('alert')).toHaveText('Wrong passphrase. Try again.');

  await page.getByLabel('Passphrase').fill(TEST_PASSPHRASE);
  await page.getByRole('button', { name: 'Unlock' }).click();
  await expect(calculator(page)).toBeVisible();
});

test('opting out of encryption requires acknowledging the risk', async ({ page }) => {
  await page.goto(APP_URL);
  await page.getByRole('button', { name: 'Continue without encryption…' }).click();
  const dialog = page.getByRole('dialog', { name: /Store data without encryption/ });
  await expect(dialog).toContainText('Any other HTML file you open from disk');
  const confirm = dialog.getByRole('button', { name: 'Continue without encryption' });
  await expect(confirm).toBeDisabled();
  await dialog.getByLabel('I understand the risk').check();
  await confirm.click();
  await expect(calculator(page)).toBeVisible();

  await page.reload(); // no passphrase asked
  await expect(calculator(page)).toBeVisible();
  await page.getByRole('link', { name: 'Settings' }).click();
  await expect(page.getByTestId('encryption-status')).toContainText('Off');
});

test('Settings shows protection status, locks, and turns encryption off and on', async ({
  page,
}) => {
  await openWithNewVault(page);
  await page.getByRole('link', { name: 'Settings' }).click();
  await expect(page.getByTestId('encryption-status')).toContainText('On.');
  await expect(page.getByTestId('persistence-status')).toHaveText(/Persistent|Best effort|Unknown/);

  await page.getByRole('button', { name: 'Lock now' }).click();
  await expect(page.getByRole('heading', { name: /Unlock PwnPoint/ })).toBeVisible();
  await page.getByLabel('Passphrase').fill(TEST_PASSPHRASE);
  await page.getByRole('button', { name: 'Unlock' }).click();

  await page.getByRole('button', { name: 'Turn off encryption…' }).click();
  const dialog = page.getByRole('dialog', { name: /Turn off encryption/ });
  await dialog.getByLabel('I understand the risk').check();
  await dialog.getByRole('button', { name: 'Turn off encryption' }).click();
  await expect(page.getByTestId('encryption-status')).toContainText('Off.');

  await page.getByLabel('New passphrase').fill('another long passphrase');
  await page.getByLabel('Type it again').fill('another long passphrase');
  await page.getByRole('button', { name: 'Turn on encryption' }).click();
  await expect(page.getByTestId('encryption-status')).toContainText('On.');
  await page.reload();
  await expect(page.getByRole('heading', { name: /Unlock PwnPoint/ })).toBeVisible();
});
