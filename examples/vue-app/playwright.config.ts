import { defineConfig } from '@playwright/test';

// E2E tests drive the real app against the running shell backend + test IDM.
// Uses the system Chrome (channel: 'chrome') so no browser download is needed,
// and a real browser where WebCrypto (device keypair) works.
export default defineConfig({
  testDir: './tests/e2e',
  // The bank test IDM + sync=true shell reads are slow and highly variable, so
  // boot alone can take 60–90s; give the whole flow generous headroom.
  timeout: 180_000,
  expect: { timeout: 15_000 },
  fullyParallel: false,
  workers: 1,
  reporter: [['list']],
  use: {
    baseURL: 'http://localhost:5173',
    channel: 'chrome',
    headless: true,
    trace: 'retain-on-failure',
    screenshot: 'only-on-failure',
  },
  webServer: {
    command: 'npm run dev',
    url: 'http://localhost:5173',
    reuseExistingServer: true,
    timeout: 60_000,
  },
});
