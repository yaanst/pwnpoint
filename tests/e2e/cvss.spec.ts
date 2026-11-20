import { expect, openWithNewVault, test } from './fixtures';

const score = (page: import('@playwright/test').Page) => page.getByTestId('cvss-score');
const severity = (page: import('@playwright/test').Page) => page.getByTestId('cvss-severity');
const vector = (page: import('@playwright/test').Page) => page.getByTestId('cvss-vector');

test.beforeEach(async ({ page }) => {
  await openWithNewVault(page);
});

test('starts at 0.0 / None and updates live when toggles are clicked', async ({ page }) => {
  await expect(score(page)).toHaveText('0.0');
  await expect(severity(page)).toHaveText('None');

  for (const metric of ['Confidentiality', 'Integrity', 'Availability']) {
    await page
      .getByRole('radiogroup', { name: new RegExp(metric) })
      .getByRole('radio', { name: /High/ })
      .click();
  }
  await expect(score(page)).toHaveText('9.8');
  await expect(severity(page)).toHaveText('Critical');
  await expect(vector(page)).toHaveText('CVSS:3.1/AV:N/AC:L/PR:N/UI:N/S:U/C:H/I:H/A:H');
});

test('each metric is a radio group with exactly one checked value', async ({ page }) => {
  const groups = page.getByRole('radiogroup');
  await expect(groups).toHaveCount(8);
  for (const group of await groups.all()) {
    await expect(group.getByRole('radio', { checked: true })).toHaveCount(1);
  }
});

test('is fully usable with the keyboard', async ({ page }) => {
  const av = page.getByRole('radiogroup', { name: /Attack Vector/ });
  await av.getByRole('radio', { name: /Network/ }).focus();
  await page.keyboard.press('ArrowRight');
  await expect(av.getByRole('radio', { name: /Adjacent/ })).toBeFocused();
  await expect(av.getByRole('radio', { name: /Adjacent/ })).toHaveAttribute('aria-checked', 'true');
  await page.keyboard.press('End');
  await expect(av.getByRole('radio', { name: /Physical/ })).toHaveAttribute('aria-checked', 'true');
  await page.keyboard.press('ArrowRight'); // wraps
  await expect(av.getByRole('radio', { name: /Network/ })).toHaveAttribute('aria-checked', 'true');

  // Tab leaves the group and lands on the next group's checked value (roving tabindex).
  await page.keyboard.press('Tab');
  await expect(
    page.getByRole('radiogroup', { name: /Attack Complexity/ }).getByRole('radio', { name: /Low/ }),
  ).toBeFocused();
});

test('shows the FIRST definition as a tooltip on focus, dismissable with Escape', async ({
  page,
}) => {
  const network = page
    .getByRole('radiogroup', { name: /Attack Vector/ })
    .getByRole('radio', { name: /Network/ });
  await network.focus();
  await page.keyboard.press('Shift+Tab');
  await page.keyboard.press('Tab'); // focus via keyboard so :focus-visible applies
  const tip = page.getByRole('tooltip', { name: /bound to the network stack/ }).first();
  await expect(network).toHaveAccessibleDescription(/bound to the network stack/);
  await expect(tip).toBeVisible();
  await page.keyboard.press('Escape');
  await expect(tip).toBeHidden();
});

test('applies a pasted vector string', async ({ page }) => {
  await page
    .getByLabel('Set from a vector string')
    .fill('CVSS:3.1/AV:N/AC:L/PR:L/UI:N/S:C/C:H/I:H/A:H');
  await page.getByRole('button', { name: 'Apply' }).click();
  await expect(score(page)).toHaveText('9.9');
  await expect(severity(page)).toHaveText('Critical');
  await expect(
    page.getByRole('radiogroup', { name: /Scope/ }).getByRole('radio', { checked: true }),
  ).toHaveAccessibleName(/Changed/);
});

test('explains what is wrong with an invalid vector and keeps the current values', async ({
  page,
}) => {
  await page.getByLabel('Set from a vector string').fill('CVSS:3.1/AV:X/AC:L/PR:N');
  await page.keyboard.press('Enter');
  const alert = page.getByRole('alert');
  await expect(alert).toContainText('AV:X is not valid. AV must be one of N, A, L, P.');
  await expect(alert).toContainText('Missing base metric(s): UI, S, C, I, A.');
  await expect(page.getByLabel('Set from a vector string')).toHaveAttribute('aria-invalid', 'true');
  await expect(score(page)).toHaveText('0.0');
});
