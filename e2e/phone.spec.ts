import { expect, test } from '@playwright/test';
import { openWorld } from './helpers.ts';

test('on a phone, a tap walks the character and the hint says tap', async ({ page }) => {
  await openWorld(page);
  await expect(page.locator('#hint')).toContainText('Tap');
  const start = await page.evaluate(() => window.__island.player());
  const box = (await page.locator('#world').boundingBox())!;
  await page.touchscreen.tap(box.width / 2, box.height * 0.68);
  await page.evaluate(() => window.__island.step(240));
  const end = await page.evaluate(() => window.__island.player());
  expect(Math.hypot(end.x - start.x, end.z - start.z)).toBeGreaterThan(0.3);
});

test('phone layout', async ({ page }) => {
  await openWorld(page);
  await page.evaluate(() => window.__island.view('street'));
  await expect(page).toHaveScreenshot('phone-street.png');
});
