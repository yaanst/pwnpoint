import { readFileSync } from 'node:fs';
import { APP_URL, expect, test } from './fixtures';

test('opens from disk as a single file and renders', async ({ page }) => {
  await page.goto(APP_URL);
  await expect(page.getByRole('heading', { name: 'PwnPoint' })).toBeVisible();
});

test('ships a hash-based CSP that blocks the network', async ({ page }) => {
  await page.goto(APP_URL);
  const csp = await page
    .locator('meta[http-equiv="Content-Security-Policy"]')
    .getAttribute('content');
  expect(csp).toContain("default-src 'none'");
  expect(csp).toContain("connect-src 'none'");
  expect(csp).toMatch(/script-src 'sha256-[A-Za-z0-9+/=]+'/);
  expect(csp).not.toContain("'self'");
  expect(csp).not.toContain('unsafe');
});

test('the browser itself refuses outgoing fetches', async ({ page, guard }) => {
  guard.expectViolation('connect-src');
  await page.goto(APP_URL);
  // Use a non-routable test address (RFC 5737): even if CSP failed, nothing real is contacted.
  const outcome = await page.evaluate(async () => {
    const violations: string[] = [];
    document.addEventListener('securitypolicyviolation', (e) =>
      violations.push(e.violatedDirective),
    );
    try {
      await fetch('https://192.0.2.1/');
      return { fetched: true, violations };
    } catch {
      await new Promise((r) => setTimeout(r, 50));
      return { fetched: false, violations };
    }
  });
  expect(outcome.fetched).toBe(false);
  expect(outcome.violations).toContain('connect-src');
});

test('storage and crypto the app relies on work on file://', async ({ page }) => {
  await page.goto(APP_URL);
  const caps = await page.evaluate(async () => {
    const idb = await new Promise<string>((resolve) => {
      try {
        const req = indexedDB.open('pwnpoint-capability-probe', 1);
        req.onupgradeneeded = () => req.result.createObjectStore('s');
        req.onsuccess = () => {
          req.result.close();
          indexedDB.deleteDatabase('pwnpoint-capability-probe');
          resolve('ok');
        };
        req.onerror = () => resolve(`error: ${req.error?.name}`);
      } catch (e) {
        resolve(`throws: ${(e as Error).name}`);
      }
    });
    const key = await crypto.subtle.generateKey({ name: 'AES-GCM', length: 256 }, false, [
      'encrypt',
    ]);
    return { secure: isSecureContext, idb, aes: key.algorithm.name };
  });
  expect(caps).toEqual({ secure: true, idb: 'ok', aes: 'AES-GCM' });
});

test('shows the version from package.json', async ({ page }) => {
  const { version } = JSON.parse(readFileSync('package.json', 'utf8')) as { version: string };
  await page.goto(APP_URL);
  await expect(page.getByText(`PwnPoint v${version}`)).toBeVisible();
});
