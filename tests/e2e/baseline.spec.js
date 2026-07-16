'use strict';
const { test, expect } = require('@playwright/test');
const PAGE = '/plugins/product-film/references/engine-skeleton.html';

test('engine boota e faz seek via ?cut&t&paused', async ({ page }) => {
  await page.goto(PAGE + '?cut=full&t=5&paused=1');
  await expect(page.locator('#stage')).toBeVisible();
  expect(await page.evaluate(() => window.__film.t)).toBeCloseTo(5, 1);
  await page.evaluate(() => window.__film.seek(2));
  expect(await page.evaluate(() => window.__film.t)).toBeCloseTo(2, 1);
});

test('start overlay aparece sem query params', async ({ page }) => {
  await page.goto(PAGE);
  await expect(page.locator('#start')).toBeVisible();
  await expect(page.locator('.cutbtn[data-cut="full"]')).toBeVisible();
});
