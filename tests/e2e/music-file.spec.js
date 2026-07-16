'use strict';
const { test, expect } = require('@playwright/test');
const { FAKE_GDM } = require('../helpers/fake-gdm');
const { wavBuffer } = require('../helpers/wav');
const PAGE = '/plugins/product-film/references/engine-skeleton.html';

test('arquivo local: decodifica, seleciona e grava com áudio', async ({ page }) => {
  await page.addInitScript(FAKE_GDM);
  await page.goto(PAGE);
  await page.evaluate(() => { window.__film.studio.autoDownload = false; });
  await page.click('#st-music');
  await page.check('input[name="mp"][value="file"]');
  await page.setInputFiles('#mp-file', { name: 'tema.wav', mimeType: 'audio/wav', buffer: wavBuffer(1, 440) });
  await page.waitForFunction(() => window.__film.studio.music.sel.type === 'file', null, { timeout: 10000 });
  await expect(page.locator('#st-music-name')).toHaveText('tema.wav');
  await page.click('#mp-close');
  await page.evaluate(() => window.__film.studio.rec('full'));
  await page.waitForFunction(() => window.__film.studio.state === 'recording', null, { timeout: 15000 });
  await page.evaluate(() => window.__film.studio.stop());
  await page.waitForFunction(() => window.__film.studio.state === 'idle' && !!window.__film.studio.lastTake, null, { timeout: 10000 });
  expect(await page.evaluate(() => window.__film.studio.lastTake.audioTracks)).toBe(1);
});
