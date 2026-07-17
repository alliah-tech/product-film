'use strict';
const { test, expect } = require('@playwright/test');
const { FAKE_GDM } = require('../helpers/fake-gdm');
const PAGE = '/plugins/product-film/references/engine-skeleton.html';

function isPlaying(page) {
  return page.evaluate(() => document.getElementById('app').classList.contains('playing'));
}

test('stage click pauses with menu; backdrop click resumes; Esc closes', async ({ page }) => {
  await page.goto(PAGE);
  await page.click('.cbbtn[data-play="full"]');
  await page.keyboard.press('Space'); /* skips the countdown */
  await page.waitForFunction(() => document.getElementById('app').classList.contains('playing'));
  await page.locator('#stage').click();
  await expect(page.locator('#pause-menu')).toBeVisible();
  expect(await isPlaying(page)).toBe(false);
  /* click on the backdrop (outside .pm-box) resumes */
  await page.locator('#pause-menu').click({ position: { x: 10, y: 10 } });
  await expect(page.locator('#pause-menu')).toBeHidden();
  await page.waitForFunction(() => document.getElementById('app').classList.contains('playing'));
  /* Esc pauses with menu; a second Esc closes the menu but stays paused */
  await page.keyboard.press('Escape');
  await expect(page.locator('#pause-menu')).toBeVisible();
  await page.keyboard.press('Escape');
  await expect(page.locator('#pause-menu')).toBeHidden();
  expect(await isPlaying(page)).toBe(false);
});

test('pause menu home returns to the start screen at t=0', async ({ page }) => {
  await page.goto(PAGE);
  await page.click('.cbbtn[data-play="ph"]');
  await page.keyboard.press('Space');
  await page.waitForFunction(() => document.getElementById('app').classList.contains('playing'));
  await page.locator('#stage').click();
  await expect(page.locator('#pause-menu')).toBeVisible();
  await page.click('#pm-home');
  await expect(page.locator('#start')).toBeVisible();
  await expect(page.locator('#pause-menu')).toBeHidden();
  expect(await page.evaluate(() => window.__film.t)).toBe(0);
});

test('audition previews without selecting; selecting stops the preview', async ({ page }) => {
  await page.goto(PAGE);
  await page.click('#st-music');
  await page.click('[data-prev="pulse"]');
  await expect(page.locator('[data-prev="pulse"]')).toHaveText('■');
  expect(await page.evaluate(() => document.querySelector('input[name="mp"]:checked').value)).toBe('none');
  expect(await page.evaluate(() => window.__film.studio.music.sel.type)).toBe('none');
  await page.check('input[name="mp"][value="pulse"]');
  await expect(page.locator('[data-prev="pulse"]')).toHaveText('▶');
  await expect(page.locator('#st-music-name')).toHaveText('Pulse (upbeat)');
});

test('typing in the Openverse search does not trigger player shortcuts', async ({ page }) => {
  await page.goto(PAGE);
  await page.click('.cbbtn[data-play="full"]');
  await page.keyboard.press('Space');
  await page.waitForFunction(() => document.getElementById('app').classList.contains('playing'));
  await page.locator('#stage').click(); /* pause + menu */
  await page.click('#pm-music');
  await page.check('#mp-api-radio');
  const tBefore = await page.evaluate(() => window.__film.t);
  await page.locator('#mp-q').pressSequentially('rock f k r');
  expect(await page.evaluate(() => document.getElementById('countdown').classList.contains('on'))).toBe(false); /* 'r' would restart into the countdown */
  expect(await page.evaluate(() => document.getElementById('app').classList.contains('playing'))).toBe(false); /* 'k'/space would resume */
  expect(await page.evaluate(() => window.__film.t)).toBeCloseTo(tBefore, 1); /* arrows would seek */
  expect(await page.evaluate(() => document.getElementById('mp-q').value)).toBe('rock f k r');
});

test('the record button on the cut card records THAT cut; no menu mid-take', async ({ page }) => {
  await page.addInitScript(FAKE_GDM);
  await page.goto(PAGE);
  await page.evaluate(() => { window.__film.studio.autoDownload = false; });
  await page.click('.cb-rec[data-rec="ph"]');
  await page.keyboard.press('Space'); /* skips the countdown */
  await page.waitForFunction(() => window.__film.studio.state === 'recording', null, { timeout: 20000 });
  /* Esc during a take ends it (partial) — it must NOT open the pause menu */
  await page.keyboard.press('Escape');
  await page.waitForFunction(() => window.__film.studio.state === 'idle' && !!window.__film.studio.lastTake, null, { timeout: 10000 });
  await expect(page.locator('#pause-menu')).toBeHidden();
  expect(await page.evaluate(() => window.__film.studio.lastTake.cut)).toBe('ph');
});
