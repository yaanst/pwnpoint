import { APP_URL, expect, openWithNewVault, TEST_PASSPHRASE, test } from './fixtures';

const theme = (page: import('@playwright/test').Page) =>
  page.evaluate(() => document.documentElement.dataset.theme ?? 'system');
const background = (page: import('@playwright/test').Page) =>
  page.evaluate(() => getComputedStyle(document.body).backgroundColor);

test('the colour mode follows the system, and a choice in Settings sticks', async ({ page }) => {
  await page.emulateMedia({ colorScheme: 'light' });
  await openWithNewVault(page);
  expect(await theme(page)).toBe('system');
  expect(await background(page)).toBe('rgb(255, 255, 255)');

  await page.getByRole('link', { name: 'Settings' }).click();
  await expect(page.getByLabel('Same as the system')).toBeChecked();
  await page.getByLabel('Dark', { exact: true }).check();
  expect(await theme(page)).toBe('dark');
  expect(await background(page)).toBe('rgb(20, 22, 26)');

  // Applied before the first render on the next visit (the unlock screen is already dark).
  await page.goto(APP_URL);
  expect(await theme(page)).toBe('dark');
  expect(await background(page)).toBe('rgb(20, 22, 26)');
  await page.getByLabel('Passphrase').fill(TEST_PASSPHRASE);
  await page.getByRole('button', { name: 'Unlock' }).click();
  await page.getByRole('link', { name: 'Settings' }).click();
  await page.getByLabel('Same as the system').check();
  expect(await theme(page)).toBe('system');
  expect(await background(page)).toBe('rgb(255, 255, 255)');
});

test('the welcome tip can be hidden and shown again', async ({ page }) => {
  await openWithNewVault(page);
  const tip = page.getByRole('complementary', { name: 'How PwnPoint works' });
  await expect(tip).toContainText('Create one project per mission.');
  await expect(page.getByRole('heading', { name: 'Start with a project' })).toBeVisible();
  await tip.getByRole('button', { name: 'Got it, hide this' }).click();
  await expect(tip).toBeHidden();

  await page.reload();
  await page.getByLabel('Passphrase').fill(TEST_PASSPHRASE);
  await page.getByRole('button', { name: 'Unlock' }).click();
  await expect(page.getByRole('heading', { name: 'Findings', level: 2 })).toBeVisible();
  await expect(tip).toBeHidden();

  await page.getByRole('link', { name: 'Settings' }).click();
  await page.getByRole('button', { name: 'Show the welcome tip again' }).click();
  await page.getByRole('link', { name: 'Findings' }).click();
  await expect(tip).toBeVisible();
});
