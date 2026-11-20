import type { Page } from '@playwright/test';
import { expect, openWithNewVault, test, TEST_PASSPHRASE } from './fixtures';

async function openNewFinding(page: Page) {
  await openWithNewVault(page);
  await page.getByLabel('New project').fill('ACME');
  await page.getByRole('button', { name: 'Create' }).click();
  await page.getByRole('button', { name: '+ New finding' }).click();
  await expect(page.getByRole('heading', { name: /VLN\.01/ })).toBeVisible();
}

/**
 * Builds an image in the page and delivers it through a paste or drop event, like the OS would.
 * `exif` inserts an APP1 Exif segment into a JPEG, as phones and some tools do.
 */
async function deliver(
  page: Page,
  how: 'paste' | 'drop',
  opts: { width: number; height: number; type?: string; exif?: string },
) {
  await page.evaluate(
    async ({ how, width, height, type = 'image/png', exif }) => {
      const canvas = document.createElement('canvas');
      canvas.width = width;
      canvas.height = height;
      const ctx = canvas.getContext('2d');
      if (!ctx) throw new Error('no 2d context');
      ctx.fillStyle = '#0b5cad';
      ctx.fillRect(0, 0, width, height);
      ctx.fillStyle = '#fff';
      ctx.fillRect(10, 10, width / 2, height / 2);
      const blob = await new Promise<Blob>((resolve, reject) =>
        canvas.toBlob((b) => (b ? resolve(b) : reject(new Error('encode failed'))), type),
      );
      let bytes = new Uint8Array(await blob.arrayBuffer());
      if (exif) {
        const payload = new TextEncoder().encode(`Exif\0\0${exif}`);
        const app1 = new Uint8Array([
          0xff,
          0xe1,
          (payload.length + 2) >> 8,
          (payload.length + 2) & 255,
        ]);
        bytes = new Uint8Array([
          ...bytes.subarray(0, 2),
          ...app1,
          ...payload,
          ...bytes.subarray(2),
        ]);
      }
      const file = new File([bytes], `screenshot.${type.split('/')[1]}`, { type });
      const dt = new DataTransfer();
      dt.items.add(file);
      if (how === 'paste') {
        // Firefox ignores `clipboardData` passed to `new ClipboardEvent()`, and Playwright cannot
        // put an image on the real clipboard there, so attach the data to a plain paste event.
        const paste = new Event('paste', { bubbles: true, cancelable: true });
        Object.defineProperty(paste, 'clipboardData', { value: dt });
        document.body.dispatchEvent(paste);
      } else {
        const zone = document.querySelector('.dropzone');
        if (!zone) throw new Error('no drop zone');
        zone.dispatchEvent(
          new DragEvent('dragover', { dataTransfer: dt, bubbles: true, cancelable: true }),
        );
        zone.dispatchEvent(
          new DragEvent('drop', { dataTransfer: dt, bubbles: true, cancelable: true }),
        );
      }
    },
    { how, ...opts },
  );
}

const status = (page: Page) => page.locator('.evidence [role="status"]');

test('pastes a screenshot, captions it, and keeps both after a reload', async ({ page }) => {
  await openNewFinding(page);
  await deliver(page, 'paste', { width: 800, height: 600 });
  await expect(status(page)).toHaveText('Added 1 image, metadata removed.');
  const first = page.getByTestId('evidence-1');
  await expect(first.locator('img')).toBeVisible();
  await expect(first).toContainText('800 × 600 px');

  await page.getByLabel('Caption for evidence 1').fill('Login form with SQL error');
  await page.getByLabel('Caption for evidence 1').press('Enter');
  await expect(status(page)).toHaveText('Caption saved.');
  await page.reload();
  await page.getByLabel('Passphrase').fill(TEST_PASSPHRASE);
  await page.getByRole('button', { name: 'Unlock' }).click();
  await expect(page.getByLabel('Caption for evidence 1')).toHaveValue('Login form with SQL error');
  await expect(page.getByTestId('evidence-1').locator('img')).toHaveJSProperty('naturalWidth', 800);
});

test('drops an image wider than 2560 px and downscales it', async ({ page }) => {
  await openNewFinding(page);
  await deliver(page, 'drop', { width: 3000, height: 1000 });
  await expect(status(page)).toHaveText(
    'Added 1 image, metadata removed; 1 downscaled to 2560 px wide.',
  );
  await expect(page.getByTestId('evidence-1')).toContainText('2560 × 853 px');
  await expect(page.getByTestId('evidence-1').locator('img')).toHaveJSProperty(
    'naturalWidth',
    2560,
  );
});

test('refuses SVG and other non-raster files through the file picker', async ({ page }) => {
  await openNewFinding(page);
  await page.getByTestId('evidence-file').setInputFiles({
    name: 'logo.svg',
    mimeType: 'image/svg+xml',
    buffer: Buffer.from('<svg xmlns="http://www.w3.org/2000/svg"><script>alert(1)</script></svg>'),
  });
  await expect(page.locator('.evidence [role="alert"]').first()).toContainText(
    'logo.svg: image/svg+xml is not supported',
  );
  await expect(page.getByTestId('evidence-1')).toHaveCount(0);
});

test('reorders with the keyboard buttons and deletes after confirmation', async ({ page }) => {
  await openNewFinding(page);
  await deliver(page, 'paste', { width: 300, height: 200 });
  await expect(page.getByTestId('evidence-1')).toBeVisible();
  await deliver(page, 'paste', { width: 400, height: 200 });
  await expect(page.getByTestId('evidence-2')).toContainText('400 × 200');

  await page.getByRole('button', { name: 'Move evidence 2 up' }).click();
  await expect(page.getByTestId('evidence-1')).toContainText('400 × 200');

  await page.getByRole('button', { name: 'Delete evidence 1' }).click();
  await page.getByRole('dialog').getByRole('button', { name: 'Cancel' }).click();
  await expect(page.getByTestId('evidence-2')).toBeVisible();
  await page.getByRole('button', { name: 'Delete evidence 1' }).click();
  await page.getByRole('dialog').getByRole('button', { name: 'Delete screenshot' }).click();
  await expect(page.getByTestId('evidence-2')).toHaveCount(0);
  await expect(page.getByTestId('evidence-1')).toContainText('300 × 200');
});

test.describe('metadata removal', () => {
  // Reading the stored bytes back needs fetch() on the thumbnail's blob: URL, which the app's
  // own CSP (connect-src 'none') rightly blocks. Only this test bypasses the CSP to inspect them.
  test.use({ bypassCSP: true });

  test('stores a clean PNG without the EXIF block of the original JPEG', async ({ page }) => {
    await openNewFinding(page);
    await deliver(page, 'paste', {
      width: 640,
      height: 480,
      type: 'image/jpeg',
      exif: 'GPSLatitude=48.8566N;Owner=Client-Secret-Laptop',
    });
    await expect(status(page)).toHaveText('Added 1 image, metadata removed.');
    const src = await page.getByTestId('evidence-1').locator('img').getAttribute('src');
    const stored = await page.evaluate(async (url) => {
      if (!url) throw new Error('no thumbnail');
      const bytes = new Uint8Array(await (await fetch(url)).arrayBuffer());
      return { head: [...bytes.subarray(0, 8)], text: new TextDecoder('latin1').decode(bytes) };
    }, src);
    expect(stored.head).toEqual([137, 80, 78, 71, 13, 10, 26, 10]); // PNG signature
    expect(stored.text).not.toContain('GPSLatitude');
    expect(stored.text).not.toContain('Client-Secret');
    expect(stored.text).not.toContain('Exif');
    for (const chunk of ['tEXt', 'iTXt', 'zTXt', 'eXIf', 'tIME', 'iCCP']) {
      expect(stored.text).not.toContain(chunk);
    }
  });
});
