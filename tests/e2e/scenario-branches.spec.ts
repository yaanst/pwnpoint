import { flags } from '../../src/flags';
import { expect, openWithNewVault, test } from './fixtures';

// The feature ships behind the scenarioBranches flag; these tests run once it is switched on.
test.skip(!flags.scenarioBranches, 'scenarioBranches is off');

test('a scenario can branch into alternative paths, drawn left to right', async ({ page }) => {
  await openWithNewVault(page);
  await page.getByLabel('New project').fill('ACME');
  await page.getByRole('button', { name: 'Create' }).click();
  await page.getByRole('link', { name: 'Scenarios' }).click();
  await page.getByRole('button', { name: '+ New scenario' }).click();
  await page.getByLabel('Title', { exact: true }).fill('Two ways in');
  for (const name of ['Phishing', 'Exposed RDP', 'Domain user', 'Domain admin']) {
    await page.getByRole('button', { name: '+ Add technique' }).click();
    const n = await page.locator('.scenario-step').count();
    await page.getByLabel(`Technique (step ${n})`).fill(name);
  }

  // By default each step leads to the next one: a chain.
  const leads = (n: number) => page.getByRole('group', { name: `Step ${n} leads to` });
  await expect(leads(1).getByLabel('Step 2: Exposed RDP')).toBeChecked();
  await expect(page.getByText('Step 4 leads to the goal.')).toBeVisible();

  // Phishing → Domain user; Exposed RDP → Domain admin; Domain user → Domain admin.
  await leads(1).getByLabel('Step 2: Exposed RDP').uncheck();
  await leads(1).getByLabel('Step 3: Domain user').check();
  await leads(2).getByLabel('Step 3: Domain user').uncheck();
  await leads(2).getByLabel('Step 4: Domain admin').check();
  await expect(leads(3).getByLabel('Step 4: Domain admin')).toBeChecked();

  // Marking Domain user as a chain breaker is wrong: RDP goes around it.
  await page.getByLabel(/Chain breaker \(step 3\)/).check();
  await expect(
    page.getByText('Step 3 is marked as a chain breaker, but another path'),
  ).toBeVisible();
  await page.getByLabel(/Chain breaker \(step 3\)/).uncheck();
  await page.getByLabel(/Chain breaker \(step 4\)/).check();
  await expect(page.getByText('another path reaches the goal')).toHaveCount(0);

  const slide = page.getByRole('img', { name: /^Scenario slide 1 of 1/ });
  await expect(slide).toContainText('Phishing');
  await expect(slide).toContainText('Exposed RDP');

  // Moving a step drops links that would point backwards.
  await page.getByRole('button', { name: 'Move step 3 up' }).click();
  await page.getByRole('button', { name: 'Move step 2 up' }).click();
  // Now: 1 Domain user, 2 Phishing, 3 Exposed RDP, 4 Domain admin. Phishing's link is gone.
  await expect(leads(2).getByRole('checkbox', { checked: true })).toHaveCount(0);
  await expect(page.getByText('Nothing checked: this step reaches the goal.')).toBeVisible();
});
