'use strict';
const { test, expect } = require('@playwright/test');
const { FAKE_GDM } = require('../helpers/fake-gdm');
const PAGE = '/plugins/product-film/references/engine-skeleton.html';

test.beforeEach(async ({ page }) => { await page.addInitScript(FAKE_GDM); });

test('renderSynth produces stereo buffers with the loop duration', async ({ page }) => {
  await page.goto(PAGE);
  const r = await page.evaluate(async () => {
    const b = await window.__film.studio.renderSynth('glass');
    return { dur: b.duration, ch: b.numberOfChannels };
  });
  expect(r.ch).toBe(2);
  expect(r.dur).toBeCloseTo(20, 0); /* 8 bars × 4 beats ÷ 96bpm */
});

test('takes with Glass carry an audio track on BOTH cuts (PH included)', async ({ page }) => {
  test.setTimeout(120000);
  await page.goto(PAGE);
  await page.evaluate(() => { window.__film.studio.autoDownload = false; });
  await page.evaluate(() => window.__film.studio.setMusic({ type: 'synth', id: 'glass' }));
  await page.evaluate(() => window.__film.studio.rec('full'));
  await page.waitForFunction(() => window.__film.studio.state === 'idle' && !!window.__film.studio.lastTake, null, { timeout: 40000 });
  expect(await page.evaluate(() => window.__film.studio.lastTake.audioTracks)).toBe(1);
  /* music is no longer gated to the full cut — the PH guidance is a panel note */
  await page.evaluate(() => window.__film.studio.rec('ph'));
  await page.waitForFunction(() => window.__film.studio.state === 'recording', null, { timeout: 15000 });
  await page.evaluate(() => window.__film.studio.stop());
  await page.waitForFunction(() => window.__film.studio.state === 'idle', null, { timeout: 10000 });
  expect(await page.evaluate(() => window.__film.studio.lastTake.audioTracks)).toBe(1);
});

test('music panel selects a synth through the UI', async ({ page }) => {
  await page.goto(PAGE);
  await page.click('#st-music');
  await expect(page.locator('#music-panel')).toBeVisible();
  await page.check('input[name="mp"][value="glass"]');
  await page.waitForFunction(() => window.__film.studio.music.sel.type === 'synth');
  await expect(page.locator('#st-music-name')).toHaveText('Glass (corporate)');
});

test('REC immediately after selecting a synth still records with audio (race)', async ({ page }) => {
  await page.goto(PAGE);
  await page.evaluate(() => { window.__film.studio.autoDownload = false; });
  /* does NOT await setMusic: fires it and calls rec on the same tick ('drift' has no cache) */
  await page.evaluate(() => { window.__film.studio.setMusic({ type: 'synth', id: 'drift' }); return window.__film.studio.rec('full'); });
  await page.waitForFunction(() => window.__film.studio.state === 'recording', null, { timeout: 20000 });
  await page.evaluate(() => window.__film.studio.stop());
  await page.waitForFunction(() => window.__film.studio.state === 'idle' && !!window.__film.studio.lastTake, null, { timeout: 10000 });
  expect(await page.evaluate(() => window.__film.studio.lastTake.audioTracks)).toBe(1);
});

test('two full takes in a row with synth record LIVE audio on both (retake)', async ({ page }) => {
  test.setTimeout(120000);
  await page.addInitScript(() => {
    const orig = MediaStream.prototype.addTrack;
    window.__mixTrackStates = [];
    MediaStream.prototype.addTrack = function (t) {
      if (t.kind === 'audio') window.__mixTrackStates.push(t.readyState);
      return orig.call(this, t);
    };
  });
  await page.goto(PAGE);
  await page.evaluate(() => { window.__film.studio.autoDownload = false; });
  await page.evaluate(() => window.__film.studio.setMusic({ type: 'synth', id: 'glass' }));
  for (let take = 0; take < 2; take++) {
    await page.evaluate(() => window.__film.studio.rec('full'));
    await page.waitForFunction(() => window.__film.studio.state === 'recording', null, { timeout: 20000 });
    await page.evaluate(() => window.__film.studio.stop());
    await page.waitForFunction(() => window.__film.studio.state === 'idle' && !!window.__film.studio.lastTake, null, { timeout: 10000 });
    expect(await page.evaluate(() => window.__film.studio.lastTake.audioTracks)).toBe(1);
  }
  const states = await page.evaluate(() => window.__mixTrackStates);
  expect(states).toEqual(['live', 'live']); /* pre-fix: the second one is 'ended' */
});
