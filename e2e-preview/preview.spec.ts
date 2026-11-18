import { expect, test } from '@playwright/test';
import '../apps/web/src/test-hooks.ts';

const OUT = 'previews';

test('preview images of the newest day', async ({ page }) => {
  const errors: string[] = [];
  page.on('pageerror', e => errors.push(String(e)));
  await page.goto('/?test');
  await page.waitForFunction(() => window.__island?.ready);
  const day = await page.evaluate(() => window.__island.dayCount);

  // the newest day, with its entry open
  await page.goto(`/?test#day-${day}`);
  await page.waitForFunction(() => window.__island?.ready);
  await expect(page.locator('.entry .date')).toContainText(`Day ${day}`);
  await page.screenshot({ path: `${OUT}/newest.png` });

  // the map, with the label of the newest day
  await page.evaluate(() => window.__island.view('map'));
  const pos = await page.evaluate(d => window.__island.screenOf(d), day);
  await page.mouse.move(pos.x, pos.y);
  await page.screenshot({ path: `${OUT}/map.png` });
  expect(errors).toEqual([]);
});
