import type { Page } from '@playwright/test';
import { expect, openWithNewVault, test } from './fixtures';

/** Pastes a 400×300 image: blue background with a white "secret" block at (20,20)–(220,120). */
async function setup(page: Page) {
  await openWithNewVault(page);
  await page.getByLabel('New project').fill('ACME');
  await page.getByRole('button', { name: 'Create' }).click();
  await page.getByRole('button', { name: '+ New finding' }).click();
  await expect(page.getByRole('heading', { name: /VLN\.01/ })).toBeVisible();
  await page.evaluate(async () => {
    const c = document.createElement('canvas');
    c.width = 400;
    c.height = 300;
    const ctx = c.getContext('2d');
    if (!ctx) throw new Error('no 2d context');
    ctx.fillStyle = 'rgb(0 0 255)';
    ctx.fillRect(0, 0, 400, 300);
    ctx.fillStyle = 'rgb(255 255 255)';
    ctx.fillRect(20, 20, 200, 100);
    const blob = await new Promise<Blob>((resolve, reject) =>
      c.toBlob((b) => (b ? resolve(b) : reject(new Error('encode failed'))), 'image/png'),
    );
    const dt = new DataTransfer();
    dt.items.add(new File([blob], 'shot.png', { type: 'image/png' }));
    const paste = new Event('paste', { bubbles: true, cancelable: true });
    Object.defineProperty(paste, 'clipboardData', { value: dt });
    document.body.dispatchEvent(paste);
  });
  await expect(page.getByTestId('evidence-1')).toContainText('400 × 300 px');
}

const dialog = (page: Page) => page.getByRole('dialog');
const canvas = (page: Page) => page.getByTestId('redact-canvas');

/** Pixel of the editor canvas (which is drawn from the stored image), as [r, g, b]. */
async function pixel(page: Page, x: number, y: number) {
  return canvas(page).evaluate(
    (c, [px, py]) => {
      const ctx = (c as HTMLCanvasElement).getContext('2d');
      if (!ctx) throw new Error('no 2d context');
      return [...ctx.getImageData(px ?? 0, py ?? 0, 1, 1).data.slice(0, 3)];
    },
    [x, y],
  );
}

/** Drags on the canvas between two points given in image pixels. */
async function dragOnImage(page: Page, from: [number, number], to: [number, number]) {
  const box = await canvas(page).boundingBox();
  if (!box) throw new Error('canvas not visible');
  const scale = box.width / 400;
  await page.mouse.move(box.x + from[0] * scale, box.y + from[1] * scale);
  await page.mouse.down();
  await page.mouse.move(box.x + to[0] * scale, box.y + to[1] * scale, { steps: 5 });
  await page.mouse.up();
}

/** Opens the editor; it is loaded once `corner` (never edited by any test) shows the background. */
async function openEditor(page: Page, corner: [number, number] = [395, 295]) {
  await page.getByRole('button', { name: 'Redact or crop evidence 1' }).click();
  await expect(canvas(page)).toBeVisible();
  await expect.poll(() => pixel(page, ...corner)).toEqual([0, 0, 255]);
}

test('draws a black box with the mouse and replaces the image only after confirmation', async ({
  page,
}) => {
  await setup(page);
  await openEditor(page);
  expect(await pixel(page, 100, 60)).toEqual([255, 255, 255]); // the "secret"

  await dragOnImage(page, [10, 10], [230, 130]);
  await expect(dialog(page).getByRole('list', { name: 'Edits' })).toContainText('Black box at');
  await dialog(page).getByRole('button', { name: 'Apply…' }).click();
  await expect(
    dialog(page).getByRole('heading', { name: 'Review the redacted image' }),
  ).toBeVisible();
  await expect(dialog(page)).toContainText('Until you confirm, the original is kept.');
  await dialog(page).getByRole('button', { name: 'Replace original' }).click();
  await expect(page.locator('.evidence [role="status"]')).toHaveText(
    'Image replaced with the redacted version.',
  );

  // Reopen: the stored image itself is now redacted.
  await openEditor(page);
  expect(await pixel(page, 100, 60)).toEqual([0, 0, 0]);
  expect(await pixel(page, 21, 21)).toEqual([0, 0, 0]);
  expect(await pixel(page, 300, 200)).toEqual([0, 0, 255]);
});

test('crops and redacts with the keyboard form', async ({ page }) => {
  await setup(page);
  await openEditor(page);
  await dialog(page).getByLabel('X', { exact: true }).fill('20');
  await dialog(page).getByLabel('Y', { exact: true }).fill('20');
  await dialog(page).getByLabel('Width').fill('200');
  await dialog(page).getByLabel('Height').fill('100');
  await dialog(page).getByRole('button', { name: 'Add black box' }).click();

  await dialog(page).getByLabel('Crop').check();
  await dialog(page).getByLabel('X', { exact: true }).fill('0');
  await dialog(page).getByLabel('Y', { exact: true }).fill('0');
  await dialog(page).getByLabel('Width').fill('300');
  await dialog(page).getByLabel('Height').fill('150');
  await dialog(page).getByRole('button', { name: 'Add crop' }).click();
  await expect(dialog(page)).toContainText('Crop to 300 × 150 px from 0,0');

  await dialog(page).getByRole('button', { name: 'Apply…' }).click();
  await expect(dialog(page)).toContainText('The result is 300 × 150 px.');
  await dialog(page).getByRole('button', { name: 'Replace original' }).click();
  await expect(page.getByTestId('evidence-1')).toContainText('300 × 150 px');

  await openEditor(page, [295, 145]); // the image is now 300 × 150
  expect(await pixel(page, 100, 60)).toEqual([0, 0, 0]);
  expect(await pixel(page, 290, 140)).toEqual([0, 0, 255]);
});

test('keeps the original when going back and cancelling', async ({ page }) => {
  await setup(page);
  await openEditor(page);
  await dragOnImage(page, [10, 10], [230, 130]);
  await dialog(page).getByRole('button', { name: 'Apply…' }).click();
  await dialog(page).getByRole('button', { name: 'Back to editing' }).click();
  await dialog(page).getByRole('button', { name: 'Cancel' }).click();
  await expect(dialog(page)).toHaveCount(0);

  await openEditor(page);
  expect(await pixel(page, 100, 60)).toEqual([255, 255, 255]);
});

test('warns that pixelation of text can be reversed and flattens the area', async ({ page }) => {
  await setup(page);
  await openEditor(page);
  await dialog(page).getByLabel('Pixelate').check();
  await expect(dialog(page)).toContainText('use black boxes for passwords, tokens and keys');
  await dragOnImage(page, [0, 0], [240, 140]);
  await dialog(page).getByRole('button', { name: 'Apply…' }).click();
  await dialog(page).getByRole('button', { name: 'Replace original' }).click();
  await openEditor(page);
  // A block that mixed white and blue is now one averaged colour, neither pure white nor blue.
  const p = await pixel(page, 18, 18);
  expect(p).not.toEqual([255, 255, 255]);
  expect(p).not.toEqual([0, 0, 255]);
  expect(await pixel(page, 18, 18)).toEqual(await pixel(page, 3, 3));
});
