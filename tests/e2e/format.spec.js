'use strict';
const { test, expect } = require('@playwright/test');
const PAGE = '/plugins/product-film/references/engine-skeleton.html';

function stageSize(page) {
  return page.evaluate(() => { const s = document.getElementById('stage'); return [s.offsetWidth, s.offsetHeight]; });
}

test('format toggles the stage between 16:9 and 9:16 everywhere it is shown, and is remembered', async ({ page }) => {
  await page.goto(PAGE);
  await page.evaluate(() => localStorage.clear());
  await page.reload();
  expect(await stageSize(page)).toEqual([1920, 1080]);
  await expect(page.locator('#st-format-name')).toHaveText('Landscape 16:9');
  await page.click('#st-format');
  expect(await stageSize(page)).toEqual([1080, 1920]);
  await expect(page.locator('#st-format-name')).toHaveText('Vertical 9:16 (phone)');
  await expect(page.locator('#c-format')).toHaveText('9:16');
  await expect(page.locator('#pm-format .fmt-name')).toHaveText('Vertical 9:16 (phone)');
  expect(await page.evaluate(() => document.getElementById('app').classList.contains('fmt-portrait'))).toBe(true);
  expect(await page.evaluate(() => window.__film.format)).toBe('portrait');
  await expect(page.locator('#start')).toBeVisible(); /* the picker never starts the film */
  await page.goto(PAGE); /* no ?format: comes back from localStorage */
  expect(await stageSize(page)).toEqual([1080, 1920]);
  await page.goto(PAGE + '?format=landscape');
  expect(await stageSize(page)).toEqual([1920, 1080]);
});

test('stage coordinates follow the format: the cursor lands on the button in both', async ({ page }) => {
  for (const fmt of ['landscape', 'portrait']) {
    await page.goto(PAGE + '?format=' + fmt + '&cut=full&t=5.1&paused=1');
    const hit = await page.evaluate(() => {
      const c = document.getElementById('cursor').getBoundingClientRect();
      const b = document.getElementById('btn-acao').getBoundingClientRect();
      const cx = c.left + c.width / 2, cy = c.top + c.height / 2;
      return cx >= b.left && cx <= b.right && cy >= b.top && cy <= b.bottom;
    });
    expect(hit, fmt).toBe(true);
  }
});
