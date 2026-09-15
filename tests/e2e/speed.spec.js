'use strict';
const { test, expect } = require('@playwright/test');
const { FAKE_GDM } = require('../helpers/fake-gdm');
const PAGE = '/plugins/product-film/references/engine-skeleton.html';

function cutDur(page) {
  return page.evaluate(() => parseFloat(document.getElementById('c-time').textContent.split('/')[1]));
}

test('speed picker cycles and every label follows (start screen, menu, controls, keyboard)', async ({ page }) => {
  await page.goto(PAGE);
  await page.evaluate(() => localStorage.clear());
  await page.reload();
  await expect(page.locator('#st-speed-name')).toHaveText('1×');
  await page.click('#st-speed');
  await expect(page.locator('#st-speed-name')).toHaveText('1.25×');
  await page.click('#st-speed', { modifiers: ['Shift'] });
  await expect(page.locator('#st-speed-name')).toHaveText('1×');
  await page.keyboard.press('[');
  await expect(page.locator('#st-speed-name')).toHaveText('0.75×');
  await expect(page.locator('#c-speed')).toHaveText('0.75×');
  await expect(page.locator('#pm-speed .spd-name')).toHaveText('0.75×');
  expect(await page.evaluate(() => window.__film.speed)).toBe(0.75);
  /* clicking the picker never starts the film */
  await expect(page.locator('#start')).toBeVisible();
});

test('the film clock runs at the chosen speed and the choice is remembered', async ({ page }) => {
  await page.goto(PAGE + '?speed=0.5');
  await expect(page.locator('#st-speed-name')).toHaveText('0.5×');
  await page.click('.cbbtn[data-play="full"]');
  await page.keyboard.press('Space'); /* skips the countdown */
  await page.waitForFunction(() => document.getElementById('app').classList.contains('playing'));
  const t0 = await page.evaluate(() => window.__film.t);
  await page.waitForTimeout(2000);
  const dt = (await page.evaluate(() => window.__film.t)) - t0;
  expect(dt).toBeGreaterThan(0.6);
  expect(dt).toBeLessThan(1.5); /* 1x would be ~2s */
  await page.goto(PAGE); /* no ?speed: comes back from localStorage */
  await expect(page.locator('#st-speed-name')).toHaveText('0.5×');
});

test('a take lasts the cut length divided by the speed', async ({ page }) => {
  await page.addInitScript(FAKE_GDM);
  await page.goto(PAGE + '?speed=1.5');
  await page.evaluate(() => { window.__film.studio.autoDownload = false; });
  await page.click('.cb-rec[data-rec="ph"]');
  await page.keyboard.press('Space');
  await page.waitForFunction(() => window.__film.studio.state === 'recording', null, { timeout: 20000 });
  await page.keyboard.press('Escape');
  await page.waitForFunction(() => window.__film.studio.state === 'idle' && !!window.__film.studio.lastTake, null, { timeout: 10000 });
  const dur = await cutDur(page);
  expect(await page.evaluate(() => window.__film.studio.lastTake.dur)).toBeCloseTo(dur / 1.5, 3);
});
