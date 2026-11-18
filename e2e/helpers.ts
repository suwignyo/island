import { expect, type Page } from '@playwright/test';

import '../apps/web/src/test-hooks.ts';

/** Opens the world in test mode and fails on any console error. */
export async function openWorld(page: Page): Promise<string[]> {
  const errors: string[] = [];
  page.on('console', m => { if (m.type() === 'error') errors.push(m.text()); });
  page.on('pageerror', e => errors.push(String(e)));
  await page.goto('/?test');
  await page.waitForFunction(() => window.__island?.ready, null, { timeout: 30_000 });
  await page.evaluate(() => document.fonts.ready);
  expect(errors).toEqual([]);
  return errors;
}
