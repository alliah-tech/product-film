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

test('a toast from the last take is gone before the countdown, never in the first frames', async ({ page }) => {
  await page.goto(PAGE);
  await page.evaluate(() => { window.__film.studio.autoDownload = false; });
  await page.evaluate(() => window.__film.studio.rec('ph'));
  await page.waitForFunction(() => window.__film.studio.state === 'recording', null, { timeout: 15000 });
  await page.evaluate(() => document.getElementById('c-rec').click()); /* ● ends it → partial take → toast on screen */
  await page.waitForFunction(() => window.__film.studio.state === 'idle', null, { timeout: 10000 });
  await expect(page.locator('#st-toast')).toBeVisible();
  await page.evaluate(() => window.__film.studio.rec('ph'));
  await page.waitForFunction(() => document.getElementById('countdown').classList.contains('on'), null, { timeout: 15000 });
  await expect(page.locator('#st-toast')).toBeHidden(); /* the capture lags: clearing it at recorder start is too late */
  await page.evaluate(() => window.__film.studio.abort());
});

test('the take is a plain mp4: no fragments, moov before mdat, video track first, full length', async ({ page }) => {
  await page.goto(PAGE + '?format=portrait');
  const mime = await page.evaluate(() => window.__film.studio.pickMime((m) => MediaRecorder.isTypeSupported(m), false));
  test.skip(mime.indexOf('mp4') === -1, 'this browser records webm');
  await page.evaluate(() => { window.__film.studio.autoDownload = false; });
  await page.evaluate(() => window.__film.studio.rec('ph'));
  await page.waitForFunction(() => window.__film.studio.state === 'idle' && !!window.__film.studio.lastTake, null, { timeout: 60000 });
  const r = await page.evaluate(async () => {
    const tk = window.__film.studio.lastTake;
    const u8 = new Uint8Array(await tk.blob.arrayBuffer()), dv = new DataView(u8.buffer);
    const cc = (o) => String.fromCharCode(u8[o], u8[o + 1], u8[o + 2], u8[o + 3]);
    const top = [];
    for (let o = 0; o + 8 <= u8.length;) { const s = dv.getUint32(o); top.push(cc(o + 4)); if (s < 8) break; o += s; }
    let h = 0; /* the first hdlr in the file belongs to the first trak */
    while (h < u8.length - 4 && cc(h) !== 'hdlr') h++;
    let k = 0; /* the first tkhd: width/height are the last 8 bytes (16.16) */
    while (k < u8.length - 4 && cc(k) !== 'tkhd') k++;
    const tkEnd = k - 4 + dv.getUint32(k - 4);
    const v = document.createElement('video');
    v.src = URL.createObjectURL(tk.blob);
    await new Promise((res) => { v.onloadedmetadata = res; });
    return { top, firstTrack: cc(h + 12), w: dv.getUint32(tkEnd - 8) >>> 16, h: dv.getUint32(tkEnd - 4) >>> 16,
             dur: v.duration, expected: tk.dur, plainError: tk.plainError || null };
  });
  expect(r.plainError).toBe(null);
  expect(r.top).toEqual(['ftyp', 'moov', 'mdat']); /* Chrome's own file: ftyp moov (moof mdat)… mfra */
  expect(r.firstTrack).toBe('vide');                /* Chrome lists audio first — WhatsApp then finds no frame size */
  expect([r.w, r.h]).toEqual([1080, 1920]);
  expect(Math.abs(r.dur - r.expected)).toBeLessThan(1.5);
});

test('mid-take a click on the film or the controls and Esc/Space/R/arrows do not cut the take; ● ends it', async ({ page }) => {
  await page.goto(PAGE);
  await page.evaluate(() => { window.__film.studio.autoDownload = false; });
  await page.evaluate(() => window.__film.studio.rec('ph'));
  await page.waitForFunction(() => window.__film.studio.state === 'recording', null, { timeout: 15000 });
  await page.waitForTimeout(1000);
  await page.mouse.click(400, 300);                                      /* a click on the film */
  await page.evaluate(() => document.getElementById('c-full').click());  /* ⛶ lives inside the stage: it used to pause → cut */
  for (const k of ['Escape', ' ', 'r', 'ArrowRight']) await page.keyboard.press(k);
  await page.waitForTimeout(500);
  expect(await page.evaluate(() => window.__film.studio.state)).toBe('recording');
  await page.evaluate(() => document.getElementById('c-rec').click());
  await page.waitForFunction(() => window.__film.studio.state === 'idle' && !!window.__film.studio.lastTake, null, { timeout: 10000 });
  expect(await page.evaluate(() => window.__film.studio.lastTake.partial)).toBe(true);
});

test('the countdown asks for F when the page is not fullscreen (the share picker leaves it)', async ({ page }) => {
  await page.goto(PAGE);
  await page.evaluate(() => { window.__film.studio.autoDownload = false; });
  await page.evaluate(() => window.__film.studio.rec('ph'));
  await page.waitForFunction(() => document.getElementById('countdown').classList.contains('on'), null, { timeout: 15000 });
  await expect(page.locator('#countdown .cd-fs')).toBeVisible();
  await page.evaluate(() => window.__film.studio.abort());
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
