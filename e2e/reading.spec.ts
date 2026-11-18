import { expect, test } from '@playwright/test';
import { openWorld } from './helpers.ts';

test('near a plot, its label shows, and E opens and closes the entry', async ({ page }) => {
  await openWorld(page);
  await page.evaluate(() => window.__island.view('house'));
  const day = await page.evaluate(() => window.__island.nearDay());
  expect(day).not.toBeNull();
  await expect(page.locator('.plot-label')).toBeVisible();
  await expect(page.locator('.plot-label')).toContainText(`Day ${day}`);
  // inside the window, above the middle of the screen (toBeVisible also passes for an element off screen)
  const box = (await page.locator('.plot-label').boundingBox())!;
  expect(box.x).toBeGreaterThan(0);
  expect(box.y).toBeGreaterThan(0);
  expect(box.x + box.width).toBeLessThan(1280);
  expect(box.y + box.height).toBeLessThan(400);

  await page.keyboard.press('KeyE');
  await expect(page.locator('.entry')).toBeVisible();
  await expect(page.locator('.entry .date')).toContainText(`Day ${day} ·`);
  await expect(page.locator('.plot-label')).toBeHidden();
  expect(page.url()).toContain(`#day-${day}`);

  await page.keyboard.press('KeyE');
  await expect(page.locator('.entry')).toBeHidden();
  expect(page.url()).not.toContain('#day-');
});

test('the entry shows the text and tags from the day file', async ({ page }) => {
  await openWorld(page);
  await page.goto('/?test#day-5');
  await page.waitForFunction(() => window.__island?.ready);
  await expect(page.locator('.entry .text')).toHaveText('Serve practice. 40 serves, 26 in.');
  await expect(page.locator('.entry .date')).toHaveText('Day 5 · 12 November 2026');
  await expect(page.locator('.entry .chip')).toHaveText(['tennis']);
});

test('Escape and the close button close the entry', async ({ page }) => {
  await openWorld(page);
  await page.evaluate(() => window.__island.view('garden'));
  await page.keyboard.press('KeyE');
  await page.keyboard.press('Escape');
  await expect(page.locator('.entry')).toBeHidden();
  await page.keyboard.press('KeyE');
  await page.locator('.entry .close').click();
  await expect(page.locator('.entry')).toBeHidden();
});

test('a click on a far plot walks there and opens it on arrival', async ({ page }) => {
  await openWorld(page);
  await page.evaluate(() => window.__island.view('street'));
  // from the start, day 10 is ahead on the right side of the street and nothing hides it
  const pos = await page.evaluate(() => window.__island.screenOf(10));
  await page.mouse.click(pos.x, pos.y);
  expect(await page.evaluate(() => window.__island.openDay())).toBeNull();
  await page.evaluate(() => window.__island.step(600));
  expect(await page.evaluate(() => window.__island.openDay())).toBe(10);
  await expect(page.locator('.entry .date')).toContainText('Day 10');
});

test('the entry closes when the visitor walks away', async ({ page }) => {
  await openWorld(page);
  await page.evaluate(() => window.__island.view('house'));
  await page.keyboard.press('KeyE');
  await page.keyboard.down('KeyS');
  await page.evaluate(() => window.__island.step(240));
  await page.keyboard.up('KeyS');
  await expect(page.locator('.entry')).toBeHidden();
});

test('a link to day 1 opens the first entry at the plaza', async ({ page }) => {
  await openWorld(page);
  await page.goto('/?test#day-1');
  await page.waitForFunction(() => window.__island?.ready);
  await expect(page.locator('.entry .date')).toContainText('Day 1 ·');
});

test('reading view with the entry open', async ({ page }) => {
  await openWorld(page);
  await page.evaluate(() => window.__island.view('house'));
  await page.keyboard.press('KeyE');
  await expect(page).toHaveScreenshot('reading-open.png');
});

test('reading view with the label', async ({ page }) => {
  await openWorld(page);
  await page.evaluate(() => window.__island.view('house'));
  await expect(page).toHaveScreenshot('reading-label.png');
});
