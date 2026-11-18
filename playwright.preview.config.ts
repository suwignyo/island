import { defineConfig, devices } from '@playwright/test';

/** Renders the real journal (not the test fixture) for the preview images in a day PR. */
export default defineConfig({
  testDir: 'e2e-preview',
  reporter: 'list',
  use: { baseURL: 'http://localhost:4174', ...devices['Desktop Chrome'], viewport: { width: 1280, height: 720 }, deviceScaleFactor: 1 },
  webServer: { command: 'npm run build -w apps/web && npm run preview -w apps/web -- --port 4174', url: 'http://localhost:4174', reuseExistingServer: false, timeout: 120_000 },
});
