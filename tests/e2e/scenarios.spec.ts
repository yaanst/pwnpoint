import type { Page } from '@playwright/test';
import { readFileSync } from 'node:fs';
import { unzipStored } from '../../src/export/zip';
import { expect, openWithNewVault, test } from './fixtures';

async function addFinding(page: Page, title: string, impact: 'High' | 'Low') {
  await page.getByRole('button', { name: '+ New finding' }).click();
  await page.getByLabel('Title', { exact: true }).fill(title);
  await page.getByLabel('Recommendation').fill(`Fix ${title}.`);
  await page
    .getByRole('radiogroup', { name: /Confidentiality/ })
    .getByRole('radio', { name: new RegExp(impact) })
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

const stepTitles = (page: Page) => page.locator('.scenario-step .step-head a').allTextContents();
const preview = (page: Page) => page.getByRole('img', { name: /^Scenario slide 1 of/ });
/**
 * Slide text without whitespace: where a label wraps depends on the installed fonts, and SVG
 * lines are separate <text> elements, so line breaks leave no space between words.
 */
const squash = (t: string) => t.replace(/\s+/g, '');
async function expectOnSlide(page: Page, text: string) {
  await expect
    .poll(async () => squash((await preview(page).textContent()) ?? ''))
    .toContain(squash(text));
}

async function recordClipboard(page: Page) {
  await page.evaluate(() => {
    const w = window as unknown as { copied: string[] };
    w.copied = [];
    Object.defineProperty(navigator, 'clipboard', {
      configurable: true,
      value: {
        writeText: (t: string) => {
          w.copied.push(t);
          return Promise.resolve();
        },
      },
    });
  });
}

test('builds a scenario from 4 findings, reorders it and exports it', async ({ page }) => {
  await openWithNewVault(page);
  await page.getByLabel('New project').fill('ACME');
  await page.getByRole('button', { name: 'Create' }).click();
  await addFinding(page, 'Guest Wi-Fi not isolated', 'Low'); // VLN.01
  await addFinding(page, 'LLMNR poisoning', 'High'); // VLN.02
  await addFinding(page, 'Kerberoastable account', 'High'); // VLN.03
  await addFinding(page, 'Domain admin password reuse', 'High'); // VLN.04

  await page.getByRole('link', { name: 'Scenarios' }).click();
  await expect(page.getByText('No scenarios in this project yet')).toBeVisible();
  await page.getByRole('button', { name: '+ New scenario' }).click();
  await expect(page.getByRole('heading', { name: /SCN\.01/ })).toBeVisible();
  await page.getByLabel('Title', { exact: true }).fill('From the guest Wi-Fi to domain admin');
  await page.getByLabel('Starting position').fill('Unauthenticated, guest Wi-Fi');
  await page.getByLabel('Goal').fill('Domain admin');
  await page.getByLabel('Context', { exact: true }).fill('Internal test, **2 days**.');

  // Searchable picker: by reference and by title, keyboard only.
  await pick(page, 'VLN.01');
  await pick(page, 'kerberoast');
  await pick(page, 'LLMNR');
  await page.getByRole('combobox', { name: 'Add a finding' }).fill('admin password');
  await page.getByRole('combobox', { name: 'Add a finding' }).press('ArrowDown');
  await page.getByRole('combobox', { name: 'Add a finding' }).press('Enter');
  expect(await stepTitles(page)).toEqual([
    'VLN.01 Guest Wi-Fi not isolated',
    'VLN.03 Kerberoastable account',
    'VLN.02 LLMNR poisoning',
    'VLN.04 Domain admin password reuse',
  ]);

  // Reorder: a button, then Alt+Arrow keys.
  await page.getByRole('button', { name: 'Move step 3 up' }).click();
  await expect(page.getByRole('status').filter({ hasText: 'moved' })).toHaveText(
    'Step 3 moved to position 2 of 4.',
  );
  await page.getByLabel('Attacker gains (step 3)').press('Alt+ArrowDown');
  expect(await stepTitles(page)).toEqual([
    'VLN.01 Guest Wi-Fi not isolated',
    'VLN.02 LLMNR poisoning',
    'VLN.04 Domain admin password reuse',
    'VLN.03 Kerberoastable account',
  ]);
  // Drag and drop: step 4 onto step 3.
  await page.getByTestId('step-4').locator('.drag-handle').dragTo(page.getByTestId('step-3'));
  expect(await stepTitles(page)).toEqual([
    'VLN.01 Guest Wi-Fi not isolated',
    'VLN.02 LLMNR poisoning',
    'VLN.03 Kerberoastable account',
    'VLN.04 Domain admin password reuse',
  ]);

  // A free technique with a MITRE id, validated.
  await page.getByRole('button', { name: '+ Add technique' }).click();
  await page.getByLabel('Technique (step 5)').fill('DCSync');
  await page.getByLabel('MITRE ATT&CK id (step 5)').fill('t10');
  await expect(page.getByTestId('scenario-problems')).toContainText('is not a MITRE ATT&CK id');
  await page.getByLabel('MITRE ATT&CK id (step 5)').fill('t1003.006');
  await expect(page.getByTestId('scenario-problems')).toHaveCount(0);

  await page.getByLabel('Attacker gains (step 2)').fill('NetNTLMv2 hashes');
  await page.getByLabel('Attacker gains (step 5)').fill('All domain hashes');
  await page.getByLabel(/Chain breaker \(step 2\)/).check();
  await page.getByLabel('Note (step 2)').fill('Disable **LLMNR** and NBT-NS by GPO.');
  await expect(page.getByTestId('save-status')).toHaveText('All changes saved');

  // Preview: one slide, flow, chain breaker, "Break the chain".
  await expect(page.getByTestId('scenario-fit')).toContainText('Fits on one slide');
  await expectOnSlide(page, 'LLMNR poisoning');
  await expectOnSlide(page, '→ NetNTLMv2 hashes');
  await expectOnSlide(page, '5. Technique · T1003.006');
  await expectOnSlide(page, 'Break the chain');
  await expectOnSlide(page, 'Disable LLMNR and NBT-NS by GPO.');
  await expect(page.getByTestId('slide-warnings')).toHaveText('Everything fits.');

  // PPTX with native shapes: 5 nodes, 4 arrows.
  const [download] = await Promise.all([
    page.waitForEvent('download'),
    page.getByRole('button', { name: 'Download .pptx' }).click(),
  ]);
  expect(download.suggestedFilename()).toBe('SCN.01-From-the-guest-Wi-Fi-to-domain-admin.pptx');
  const files = unzipStored(readFileSync(await download.path()));
  const xml = new TextDecoder().decode(files.get('ppt/slides/slide1.xml'));
  expect(files.has('ppt/slides/slide2.xml')).toBe(false);
  expect(xml.match(/<a:tailEnd type="triangle"/g)).toHaveLength(4);
  expect(xml).toContain('<a:t>Domain admin password reuse</a:t>');
  expect(xml).toContain('<a:t>Break the chain</a:t>');

  await recordClipboard(page);
  await page.getByRole('button', { name: 'Copy Markdown' }).click();
  const md = await page.evaluate(() => (window as unknown as { copied: string[] }).copied[0]);
  expect(md).toContain('## SCN.01 From the guest Wi-Fi to domain admin');
  expect(md).toContain(
    '2. **VLN.02 LLMNR poisoning** (High) → Gains: NetNTLMv2 hashes · *Chain breaker*',
  );
  expect(md).toContain('5. **Technique: DCSync** (T1003.006) → Gains: All domain hashes');

  // The finding shows where it is used; deleting it leaves a visible placeholder.
  await page.locator('.scenario-step .step-head a', { hasText: 'LLMNR poisoning' }).click();
  await expect(page.getByTestId('used-in-scenarios')).toHaveText(
    'Used in scenarios: SCN.01 From the guest Wi-Fi to domain admin',
  );
  await page.getByRole('button', { name: 'Delete finding' }).click();
  await page.getByRole('dialog').getByRole('button', { name: 'Delete finding' }).click();
  await page.getByRole('link', { name: 'Scenarios' }).click();
  await page.getByRole('link', { name: 'From the guest Wi-Fi to domain admin' }).click();
  await expect(page.getByTestId('step-2')).toContainText('Missing finding (deleted)');
  await expect(page.getByTestId('slide-warnings')).toContainText(
    'Step 2 points to a deleted finding.',
  );
  await expectOnSlide(page, '2. Missing finding · Chain breaker');
});

test('adds scenarios to the project deck', async ({ page }) => {
  await openWithNewVault(page);
  await page.getByLabel('New project').fill('ACME');
  await page.getByRole('button', { name: 'Create' }).click();
  await addFinding(page, 'SQL injection', 'High');
  await page.getByRole('link', { name: 'Scenarios' }).click();
  await page.getByRole('button', { name: '+ New scenario' }).click();
  await page.getByLabel('Title', { exact: true }).fill('Database theft');
  await pick(page, 'SQL');
  await expect(page.getByTestId('save-status')).toHaveText('All changes saved');
  await page.getByRole('link', { name: 'Findings', exact: true }).click();

  await page.getByText('Export project').click();
  await page.getByLabel('Validated findings only').uncheck();
  const [download] = await Promise.all([
    page.waitForEvent('download'),
    page.getByRole('button', { name: 'Download deck (.pptx)' }).click(),
  ]);
  const files = unzipStored(readFileSync(await download.path()));
  const slide3 = new TextDecoder().decode(files.get('ppt/slides/slide3.xml'));
  expect(slide3).toContain('<a:t>Database theft</a:t>');
  await expect(page.getByTestId('project-export-status')).toHaveText(
    'Deck downloaded: 3 slides. Check the warnings on slide 3 in the editor.',
  );
});
