'use strict';
const { test, expect } = require('@playwright/test');
const { FAKE_GDM } = require('../helpers/fake-gdm');
const PAGE = '/plugins/product-film/references/engine-skeleton.html';

test.beforeEach(async ({ page }) => { await page.addInitScript(FAKE_GDM); });

test('renderSynth produz buffers estéreo com a duração do loop', async ({ page }) => {
  await page.goto(PAGE);
  const r = await page.evaluate(async () => {
    const b = await window.__film.studio.renderSynth('pulse');
    return { dur: b.duration, ch: b.numberOfChannels };
  });
  expect(r.ch).toBe(2);
  expect(r.dur).toBeCloseTo(16, 0); /* 8 compassos × 4 tempos ÷ 120bpm */
});

test('take full com Pulse sai com faixa de áudio; PH sai mudo', async ({ page }) => {
  test.setTimeout(120000);
  await page.goto(PAGE);
  await page.evaluate(() => { window.__film.studio.autoDownload = false; });
  await page.evaluate(() => window.__film.studio.setMusic({ type: 'synth', id: 'pulse' }));
  await page.evaluate(() => window.__film.studio.rec('full'));
  await page.waitForFunction(() => window.__film.studio.state === 'idle' && !!window.__film.studio.lastTake, null, { timeout: 40000 });
  expect(await page.evaluate(() => window.__film.studio.lastTake.audioTracks)).toBe(1);
  /* mesmo com música selecionada, PH grava mudo */
  await page.evaluate(() => window.__film.studio.rec('ph'));
  await page.waitForFunction(() => window.__film.studio.state === 'recording', null, { timeout: 15000 });
  await page.evaluate(() => window.__film.studio.stop());
  await page.waitForFunction(() => window.__film.studio.state === 'idle', null, { timeout: 10000 });
  expect(await page.evaluate(() => window.__film.studio.lastTake.audioTracks)).toBe(0);
});

test('painel de música seleciona synth pela UI', async ({ page }) => {
  await page.goto(PAGE);
  await page.click('#st-music');
  await expect(page.locator('#music-panel')).toBeVisible();
  await page.check('input[name="mp"][value="glass"]');
  await page.waitForFunction(() => window.__film.studio.music.sel.type === 'synth');
  await expect(page.locator('#st-music-name')).toHaveText('Glass (corporate)');
});

test('REC imediatamente após selecionar synth ainda grava com áudio (race)', async ({ page }) => {
  await page.goto(PAGE);
  await page.evaluate(() => { window.__film.studio.autoDownload = false; });
  /* NÃO aguarda setMusic: dispara e chama rec no mesmo tick ('drift' não tem cache) */
  await page.evaluate(() => { window.__film.studio.setMusic({ type: 'synth', id: 'drift' }); return window.__film.studio.rec('full'); });
  await page.waitForFunction(() => window.__film.studio.state === 'recording', null, { timeout: 20000 });
  await page.evaluate(() => window.__film.studio.stop());
  await page.waitForFunction(() => window.__film.studio.state === 'idle' && !!window.__film.studio.lastTake, null, { timeout: 10000 });
  expect(await page.evaluate(() => window.__film.studio.lastTake.audioTracks)).toBe(1);
});

test('dois takes full seguidos com synth gravam áudio VIVO nos dois (retake)', async ({ page }) => {
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
  await page.evaluate(() => window.__film.studio.setMusic({ type: 'synth', id: 'pulse' }));
  for (let take = 0; take < 2; take++) {
    await page.evaluate(() => window.__film.studio.rec('full'));
    await page.waitForFunction(() => window.__film.studio.state === 'recording', null, { timeout: 20000 });
    await page.evaluate(() => window.__film.studio.stop());
    await page.waitForFunction(() => window.__film.studio.state === 'idle' && !!window.__film.studio.lastTake, null, { timeout: 10000 });
    expect(await page.evaluate(() => window.__film.studio.lastTake.audioTracks)).toBe(1);
  }
  const states = await page.evaluate(() => window.__mixTrackStates);
  expect(states).toEqual(['live', 'live']); /* pre-fix: segundo é 'ended' */
});
