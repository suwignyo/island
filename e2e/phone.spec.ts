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

test('on a phone, a tap on a near plot opens its entry', async ({ page }) => {
  await openWorld(page);
  await page.evaluate(() => window.__island.view('house'));
  const day = await page.evaluate(() => window.__island.nearDay());
  const pos = await page.evaluate(d => window.__island.screenOf(d!), day);
  await page.touchscreen.tap(pos.x, pos.y);
  await expect(page.locator('.entry .date')).toContainText(`Day ${day}`);
  await expect(page).toHaveScreenshot('phone-reading.png');
});

test('on a phone, the map fits the island and a tap on a day goes there', async ({ page }) => {
  await openWorld(page);
  await page.evaluate(() => window.__island.view('map'));
  const box = (await page.locator('#world').boundingBox())!;
  const n = await page.evaluate(() => window.__island.dayCount);
  for (let day = 1; day <= n; day++) {
    const p = await page.evaluate(d => window.__island.screenOf(d), day);
    expect(p.x).toBeGreaterThan(0); expect(p.x).toBeLessThan(box.width);
  }
  await expect(page).toHaveScreenshot('phone-map.png');
  const pos = await page.evaluate(() => window.__island.screenOf(7));
  await page.touchscreen.tap(pos.x, pos.y);
  await page.evaluate(() => window.__island.step(120));
  expect(await page.evaluate(() => window.__island.openDay())).toBe(7);
});
