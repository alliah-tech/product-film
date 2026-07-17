'use strict';
const { test, expect } = require('@playwright/test');
const { FAKE_GDM } = require('../helpers/fake-gdm');
const PAGE = '/plugins/product-film/references/engine-skeleton.html';

test.beforeEach(async ({ page }) => { await page.addInitScript(FAKE_GDM); });

test('pickMime: mp4 → webm cascade, with and without audio', async ({ page }) => {
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

test('one-click PH take: starts at t=0, stops at the end, no audio, downloadable', async ({ page }) => {
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
  const expectedMime = await page.evaluate(() => window.__film.studio.pickMime((m) => MediaRecorder.isTypeSupported(m), false));
  expect(expectedMime).not.toBe('');
  expect(tk.mime).toBe(expectedMime); /* first supported candidate from the cascade (mp4 on Chrome >=126; webm on builds without h264) */
  expect(tk.cut).toBe('ph');
  expect(tk.audio).toBe(0);
  expect(tk.partial).toBe(false);
  expect(tk.dur).toBeCloseTo(8, 0);
  const opts = await page.evaluate(() => window.__gdmOpts);
  expect(opts.preferCurrentTab).toBe(true);
  await expect(page.locator('#st-toast')).toBeVisible();
});

test('Esc during the take → partial', async ({ page }) => {
  await page.goto(PAGE);
  await page.evaluate(() => { window.__film.studio.autoDownload = false; });
  await page.evaluate(() => window.__film.studio.rec('ph'));
  await page.waitForFunction(() => window.__film.studio.state === 'recording', null, { timeout: 15000 });
  await page.waitForTimeout(1500);
  await page.keyboard.press('Escape');
  await page.waitForFunction(() => window.__film.studio.state === 'idle' && !!window.__film.studio.lastTake, null, { timeout: 10000 });
  expect(await page.evaluate(() => window.__film.studio.lastTake.partial)).toBe(true);
});

test('abort during the countdown neither crashes nor starts recording', async ({ page }) => {
  const errors = [];
  page.on('pageerror', (e) => errors.push(String(e)));
  await page.goto(PAGE);
  await page.evaluate(() => { window.__film.studio.autoDownload = false; });
  await page.evaluate(() => window.__film.studio.rec('ph'));
  await page.waitForFunction(() => window.__film.studio.state === 'arming');
  await page.evaluate(() => window.__film.studio.abort());
  await page.waitForTimeout(5500); /* the whole countdown would have fired */
  expect(errors).toEqual([]);
  expect(await page.evaluate(() => window.__film.studio.state)).toBe('idle');
});
