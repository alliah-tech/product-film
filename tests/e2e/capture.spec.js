'use strict';
const { test, expect } = require('@playwright/test');
const { FAKE_GDM } = require('../helpers/fake-gdm');
const PAGE = '/plugins/product-film/references/engine-skeleton.html';

test.beforeEach(async ({ page }) => { await page.addInitScript(FAKE_GDM); });

test('pickMime: cascata mp4 → webm, com e sem áudio', async ({ page }) => {
  await page.goto(PAGE);
  const r = await page.evaluate(() => {
    const pm = window.__film.studio.pickMime;
    const firefoxLike = (m) => m.indexOf('webm') !== -1 && m.indexOf('h264') === -1;
    return {
      best: pm(() => true, true),
      bestMute: pm(() => true, false),
      firefox: pm(firefoxLike, true),
      none: pm(() => false, true)
    };
  });
  expect(r.best).toBe('video/mp4;codecs=avc1.640028,mp4a.40.2');
  expect(r.bestMute).toBe('video/mp4;codecs=avc1.640028');
  expect(r.firefox).toBe('video/webm;codecs=vp9,opus');
  expect(r.none).toBe('');
});

test('take PH one-click: começa em t=0, para no fim, sem áudio, baixável', async ({ page }) => {
  await page.goto(PAGE);
  await page.evaluate(() => { window.__film.studio.autoDownload = false; });
  await page.evaluate(() => window.__film.studio.rec('ph'));
  await page.waitForFunction(() => window.__film.studio.state === 'recording', null, { timeout: 15000 });
  await page.waitForFunction(() => window.__film.studio.state === 'idle' && !!window.__film.studio.lastTake, null, { timeout: 40000 });
  const tk = await page.evaluate(() => {
    const t = window.__film.studio.lastTake;
    return { size: t.blob.size, mime: t.mime, cut: t.cut, audio: t.audioTracks, partial: t.partial, dur: t.dur };
  });
  expect(tk.size).toBeGreaterThan(20000);
  expect(tk.mime).toContain('webm'); /* chromium do playwright não tem h264/mp4 */
  expect(tk.cut).toBe('ph');
  expect(tk.audio).toBe(0);
  expect(tk.partial).toBe(false);
  expect(tk.dur).toBeCloseTo(8, 0);
  const opts = await page.evaluate(() => window.__gdmOpts);
  expect(opts.preferCurrentTab).toBe(true);
  await expect(page.locator('#st-toast')).toBeVisible();
});

test('Esc durante o take → parcial', async ({ page }) => {
  await page.goto(PAGE);
  await page.evaluate(() => { window.__film.studio.autoDownload = false; });
  await page.evaluate(() => window.__film.studio.rec('ph'));
  await page.waitForFunction(() => window.__film.studio.state === 'recording', null, { timeout: 15000 });
  await page.waitForTimeout(1500);
  await page.keyboard.press('Escape');
  await page.waitForFunction(() => window.__film.studio.state === 'idle' && !!window.__film.studio.lastTake, null, { timeout: 10000 });
  expect(await page.evaluate(() => window.__film.studio.lastTake.partial)).toBe(true);
});
