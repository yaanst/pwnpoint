import { flags } from '../../src/flags';
import { unzipStored } from '../../src/export/zip';
import { readFileSync } from 'node:fs';
import { expect, openWithNewVault, test } from './fixtures';

// The feature ships behind the reportDeck flag; these tests run once it is switched on.
test.skip(!flags.reportDeck, 'reportDeck is off');

test('previews and exports the report deck with the report style', async ({ page }, testInfo) => {
  await openWithNewVault(page);
  await page.getByRole('link', { name: 'Settings' }).click();
  await page.getByLabel('Primary (titles, table headers)').fill('#451dc7');
  await page.getByLabel('Footer text').fill('Restricted');
  await expect(page.getByRole('status').filter({ hasText: 'Theme saved.' })).toBeVisible();

  await page.getByRole('link', { name: 'Findings', exact: true }).click();
  await page.getByLabel('New project').fill('ACME');
  await page.getByRole('button', { name: 'Create' }).click();
  await page.getByRole('link', { name: 'Report', exact: true }).click();
  await page.getByLabel('Client').fill('ACME Corp');
  await page.getByLabel('Product or system').fill('Customer portal');
  await page.getByLabel('Strengths').fill('MFA on every account');
  await expect(page.getByTestId('save-status')).toHaveText('All changes saved');

  const slides = page.getByRole('list', { name: 'Report slides' }).getByRole('img');
  await expect(slides).toHaveCount(13);
  await expect(slides.nth(0)).toContainText('ACME Corp - Customer portal');
  await expect(slides.nth(4)).toContainText('MFA on every account');
  await expect(slides.nth(2)).toContainText('Restricted');
  await expect(page.getByTestId('report-warnings')).toBeHidden();

  const download = page.waitForEvent('download');
  await page.getByRole('button', { name: 'Export report (.pptx)' }).click();
  const file = testInfo.outputPath('report.pptx');
  await (await download).saveAs(file);
  const entries = unzipStored(new Uint8Array(readFileSync(file)));
  const slideFiles = [...entries.keys()].filter((n) => /^ppt\/slides\/slide\d+\.xml$/.test(n));
  expect(slideFiles).toHaveLength(13);
  const modalities = new TextDecoder().decode(entries.get('ppt/slides/slide3.xml'));
  expect(modalities).toContain('ACME Corp');
  expect(modalities).toContain('451DC7');
});
