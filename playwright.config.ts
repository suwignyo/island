import { defineConfig, devices } from '@playwright/test';

export default defineConfig({
  testDir: 'e2e',
  // One baseline for every machine: CI and the dev container use the same Docker image.
  snapshotPathTemplate: '{testDir}/__screenshots__/{arg}{ext}',
  fullyParallel: true,
  reporter: process.env.CI ? [['list'], ['html', { open: 'never' }]] : 'list',
  use: { baseURL: 'http://localhost:4173', viewport: { width: 1280, height: 720 }, deviceScaleFactor: 1 },
  // Renders are exact (fixed seed, no clock, same browser build), so a few pixels of tolerance is enough.
  // A larger ratio lets small new objects pass without notice.
  expect: { toHaveScreenshot: { maxDiffPixels: 20, threshold: 0.05, animations: 'disabled' } },
  projects: [
    { name: 'desktop', use: { ...devices['Desktop Chrome'], viewport: { width: 1280, height: 720 }, deviceScaleFactor: 1 }, testIgnore: /phone\.spec\.ts/ },
    { name: 'phone', use: { ...devices['Pixel 7'] }, testMatch: /phone\.spec\.ts/ },
  ],
  // built with the fixed test journal in e2e/fixtures/days, not the real one
  webServer: { command: 'npm run build:fixture -w apps/web && npm run preview:fixture -w apps/web', url: 'http://localhost:4173', reuseExistingServer: !process.env.CI, timeout: 120_000 },
});
