import { expect, test } from '@playwright/test';
import { openWorld } from './helpers.ts';

const settle = (page: import('@playwright/test').Page) => page.evaluate(() => window.__island.step(120));

test('M opens the map and M again goes back to the street', async ({ page }) => {
  await openWorld(page);
  await page.keyboard.press('KeyM');
  expect(await page.evaluate(() => window.__island.mode())).toBe('moving');
  await settle(page);
  expect(await page.evaluate(() => window.__island.mode())).toBe('map');
  await expect(page.locator('#mode')).toHaveText('Back to the street');
  await page.keyboard.press('KeyM');
  await settle(page);
  expect(await page.evaluate(() => window.__island.mode())).toBe('street');
  await expect(page.locator('#mode')).toHaveText('Map');
});

test('scroll out opens the map, scroll in goes back', async ({ page }) => {
  await openWorld(page);
  await page.mouse.move(640, 360);
  await page.mouse.wheel(0, 200);
  await settle(page);
  expect(await page.evaluate(() => window.__island.mode())).toBe('map');
  await page.mouse.wheel(0, -200);
  await settle(page);
  expect(await page.evaluate(() => window.__island.mode())).toBe('street');
});

test('the Map button opens the map', async ({ page }) => {
  await openWorld(page);
  await page.locator('#mode').click();
  await settle(page);
  expect(await page.evaluate(() => window.__island.mode())).toBe('map');
});

test('the character cannot walk while the map is open', async ({ page }) => {
  await openWorld(page);
  await page.evaluate(() => window.__island.view('map'));
  const before = await page.evaluate(() => window.__island.player());
  await page.keyboard.down('KeyW');
  await page.evaluate(() => window.__island.step(60));
  await page.keyboard.up('KeyW');
  expect(await page.evaluate(() => window.__island.player())).toEqual(before);
});

test('a click on a day in the map goes there and opens its entry', async ({ page }) => {
  await openWorld(page);
  await page.evaluate(() => window.__island.view('map'));
  for (const day of [4, 9]) {
    await page.evaluate(() => window.__island.view('map'));
    const pos = await page.evaluate(d => window.__island.screenOf(d), day);
    await page.mouse.move(pos.x, pos.y);
    await expect(page.locator('.plot-label')).toContainText(`Day ${day}`);
    await page.mouse.click(pos.x, pos.y);
    await settle(page);
    expect(await page.evaluate(() => window.__island.mode())).toBe('street');
    expect(await page.evaluate(() => window.__island.openDay())).toBe(day);
    expect(await page.evaluate(() => window.__island.nearDay())).toBe(day);
  }
});

test('the whole island fits in the map view', async ({ page }) => {
  await openWorld(page);
  await page.evaluate(() => window.__island.view('map'));
  const n = await page.evaluate(() => window.__island.dayCount);
  for (let day = 1; day <= n; day++) {
    const p = await page.evaluate(d => window.__island.screenOf(d), day);
    expect(p.x).toBeGreaterThan(0); expect(p.x).toBeLessThan(1280);
    expect(p.y).toBeGreaterThan(0); expect(p.y).toBeLessThan(720);
  }
});

test('the map view stays inside the draw call budget', async ({ page }) => {
  await openWorld(page);
  const s = await page.evaluate(() => { window.__island.view('map'); return window.__island.stats(); });
  expect(s.calls).toBeLessThanOrEqual(400);
});

test('a visit starts on the map and moves down to the character', async ({ page }) => {
  await page.goto('/?test&intro');
  await page.waitForFunction(() => window.__island?.ready);
  expect(await page.evaluate(() => window.__island.mode())).toBe('map');
  await page.evaluate(() => window.__island.step(60));
  expect(await page.evaluate(() => window.__island.mode())).toBe('map');
  await page.evaluate(() => window.__island.step(140));
  expect(await page.evaluate(() => window.__island.mode())).toBe('street');
});

test('a key press skips the wait at the start of a visit', async ({ page }) => {
  await page.goto('/?test&intro');
  await page.waitForFunction(() => window.__island?.ready);
  await page.keyboard.press('KeyW');
  await page.evaluate(() => window.__island.step(100));
  expect(await page.evaluate(() => window.__island.mode())).toBe('street');
});

test('a link to a day skips the start on the map', async ({ page }) => {
  await page.goto('/?test&intro#day-6');
  await page.waitForFunction(() => window.__island?.ready);
  expect(await page.evaluate(() => window.__island.mode())).toBe('street');
  expect(await page.evaluate(() => window.__island.openDay())).toBe(6);
});

test('fixed camera image: map', async ({ page }) => {
  await openWorld(page);
  await page.evaluate(() => { window.__island.hideUi(true); window.__island.view('map'); });
  await expect(page.locator('#world')).toHaveScreenshot('map.png');
});

test('map with the interface', async ({ page }) => {
  await openWorld(page);
  await page.evaluate(() => window.__island.view('map'));
  const pos = await page.evaluate(() => window.__island.screenOf(5));
  await page.mouse.move(pos.x, pos.y);
  await page.evaluate(() => window.__island.step(1));
  await expect(page).toHaveScreenshot('map-with-ui.png');
});
