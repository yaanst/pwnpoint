import { defineConfig, devices } from '@playwright/test';

// Tests run against the BUILT single file opened from disk (file://), exactly how users run it.
// Run `npm run build` first. Locally you can point Chromium at a preinstalled browser with
// PW_CHROMIUM_PATH=/path/to/chrome.
const chromiumPath = process.env.PW_CHROMIUM_PATH;

export default defineConfig({
  testDir: 'tests/e2e',
  fullyParallel: true,
  forbidOnly: !!process.env.CI,
  retries: 0,
  reporter: 'list',
  use: { trace: 'off' },
  projects: [
    {
      name: 'chromium',
      use: {
        ...devices['Desktop Chrome'],
        ...(chromiumPath ? { launchOptions: { executablePath: chromiumPath } } : {}),
      },
    },
    { name: 'firefox', use: { ...devices['Desktop Firefox'] } },
  ],
});
