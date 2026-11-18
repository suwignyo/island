import { expect, test } from '@playwright/test';
import { openWorld } from './helpers.ts';

test('the world loads without errors and shows the day count', async ({ page }) => {
  const errors = await openWorld(page);
  await expect(page.locator('.brand .day')).toHaveText('Day 11');
  expect(errors).toEqual([]);
});

test('W walks forward and A turns left', async ({ page }) => {
  await openWorld(page);
  const before = await page.evaluate(() => window.__island.player());
  await page.keyboard.down('KeyW');
  await page.evaluate(() => window.__island.step(60));
  await page.keyboard.up('KeyW');
  const after = await page.evaluate(() => window.__island.player());
  expect(Math.hypot(after.x - before.x, after.z - before.z)).toBeGreaterThan(1.5);

  await page.keyboard.down('KeyA');
  await page.evaluate(() => window.__island.step(30));
  await page.keyboard.up('KeyA');
  const turned = await page.evaluate(() => window.__island.player());
  expect(turned.heading).toBeGreaterThan(after.heading + 0.5);
});

test('a click on the ground walks the character there', async ({ page }) => {
  await openWorld(page);
  await page.mouse.click(640, 470);
  const start = await page.evaluate(() => window.__island.player());
  await page.evaluate(() => window.__island.step(240));
  const end = await page.evaluate(() => window.__island.player());
  expect(Math.hypot(end.x - start.x, end.z - start.z)).toBeGreaterThan(0.5);
});

test('the character stops at the wall of a house and at the coast', async ({ page }) => {
  await openWorld(page);
  await page.evaluate(() => window.__island.view('house'));
  const day = (await page.evaluate(() => window.__island.nearDay()))!;
  const house = await page.evaluate(d => window.__island.plot(d), day);
  // walk to the center of the house: the character must stop outside its walls
  await page.evaluate(h => { window.__island.walkTo(h.x, h.z); window.__island.step(400); }, house);
  const p = await page.evaluate(() => window.__island.player());
  expect(Math.hypot(p.x - house.x, p.z - house.z)).toBeGreaterThan(house.radius);

  // walk far into the sea: the character must stay on land
  await page.evaluate(() => { window.__island.view('street'); window.__island.walkTo(80, 80); window.__island.step(1200); });
  const q = await page.evaluate(() => window.__island.player());
  expect(await page.evaluate(({ x, z }) => window.__island.coast(x, z), q)).toBeLessThan(0.9);
});

test('street view stays inside the draw call budget', async ({ page }) => {
  await openWorld(page);
  for (const v of ['street', 'origin', 'house']) {
    const s = await page.evaluate(v2 => { window.__island.view(v2); return window.__island.stats(); }, v);
    expect(s.calls, `draw calls in ${v} view`).toBeLessThanOrEqual(300);
  }
});

for (const view of ['street', 'origin', 'house', 'tree', 'garden']) {
  test(`fixed camera image: ${view}`, async ({ page }) => {
    await openWorld(page);
    await page.evaluate(v => { window.__island.hideUi(true); window.__island.view(v); }, view);
    await expect(page.locator('#world')).toHaveScreenshot(`${view}.png`);
  });
}

test('interface panels', async ({ page }) => {
  await openWorld(page);
  await page.evaluate(() => window.__island.view('street'));
  await expect(page).toHaveScreenshot('street-with-ui.png');
});
