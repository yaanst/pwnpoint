import { test as base, expect } from '@playwright/test';
import { pathToFileURL } from 'node:url';
import { resolve } from 'node:path';

/** URL of the built app, opened from disk like a user would. */
export const APP_URL = pathToFileURL(resolve('dist/index.html')).href;

const LOCAL_SCHEMES = ['file:', 'data:', 'blob:', 'about:'];

/**
 * Local-only guard. Every test using this fixture fails if any request leaves the
 * device, or if the page reports a CSP violation or an uncaught error.
 */
interface Guard {
  /** Mark a CSP violation as expected, for tests that check the CSP blocks something. */
  expectViolation(directive: string): void;
}

export const test = base.extend<{ guard: Guard }>({
  guard: [
    async ({ context, page }, use) => {
      const escaped: string[] = [];
      await context.route('**/*', (route) => {
        const url = route.request().url();
        if (LOCAL_SCHEMES.includes(new URL(url).protocol)) return route.continue();
        escaped.push(url);
        return route.abort('blockedbyclient');
      });
      context.on('request', (request) => {
        if (!LOCAL_SCHEMES.includes(new URL(request.url()).protocol)) escaped.push(request.url());
      });
      const errors: string[] = [];
      const expected = new Set<string>();
      page.on('pageerror', (error) => errors.push(error.message));
      await page.addInitScript(() => {
        document.addEventListener('securitypolicyviolation', (e) => {
          console.error(`CSP violation: ${e.violatedDirective} ${e.blockedURI}`);
        });
      });
      page.on('console', (msg) => {
        const text = msg.text();
        if (msg.type() !== 'error' || !text.startsWith('CSP violation')) return;
        if (![...expected].some((d) => text.startsWith(`CSP violation: ${d} `))) errors.push(text);
      });

      await use({ expectViolation: (directive) => expected.add(directive) });

      expect([...new Set(escaped)], 'requests that left the device').toEqual([]);
      expect(errors, 'page errors or CSP violations').toEqual([]);
    },
    { auto: true },
  ],
});

export { expect };

export const TEST_PASSPHRASE = 'correct horse battery staple';

/** Opens the app and completes first-run setup with an encryption passphrase. */
export async function openWithNewVault(page: import('@playwright/test').Page): Promise<void> {
  await page.goto(APP_URL);
  await page.getByLabel('Passphrase', { exact: true }).fill(TEST_PASSPHRASE);
  await page.getByLabel('Type it again').fill(TEST_PASSPHRASE);
  await page.getByRole('button', { name: 'Encrypt and continue' }).click();
  await expect(page.getByRole('heading', { name: 'CVSS 3.1 base score' })).toBeVisible();
}
