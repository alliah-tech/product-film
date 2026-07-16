'use strict';
const { test, expect } = require('@playwright/test');
const { FAKE_GDM } = require('../helpers/fake-gdm');
const PAGE = '/plugins/product-film/references/engine-skeleton.html';

test('encodeGif produz GIF89a válido com loop', async ({ page }) => {
  await page.goto(PAGE);
  const r = await page.evaluate(async () => {
    const s = window.__film.studio;
    const w = 24, h = 12, a = new Uint8Array(w * h), b = new Uint8Array(w * h);
    for (let i = 0; i < a.length; i++) { a[i] = i % 200; b[i] = (i + 60) % 200; }
    const blob = s.encodeGif([a, b], w, h, 10);
    const bytes = new Uint8Array(await blob.arrayBuffer());
    let ok = true;
    try { await createImageBitmap(blob); } catch (e) { ok = false; }
    return {
      head: String.fromCharCode.apply(null, Array.from(bytes.slice(0, 6))),
      netscape: String.fromCharCode.apply(null, Array.from(bytes)).indexOf('NETSCAPE2.0') !== -1,
      trailer: bytes[bytes.length - 1],
      decoded: ok, size: blob.size
    };
  });
  expect(r.head).toBe('GIF89a');
  expect(r.netscape).toBe(true);
  expect(r.trailer).toBe(0x3B);
  expect(r.decoded).toBe(true);
  expect(r.size).toBeGreaterThan(100);
});

test('makeGif do take gera image/gif', async ({ page }) => {
  test.setTimeout(120000);
  await page.addInitScript(FAKE_GDM);
  await page.goto(PAGE);
  await page.evaluate(() => { window.__film.studio.autoDownload = false; });
  await page.evaluate(() => window.__film.studio.rec('ph'));
  await page.waitForFunction(() => window.__film.studio.state === 'idle' && !!window.__film.studio.lastTake, null, { timeout: 40000 });
  const r = await page.evaluate(async () => {
    const b = await window.__film.studio.makeGif({ width: 480, fps: 10, from: 0, to: 2 });
    return { type: b.type, size: b.size };
  });
  expect(r.type).toBe('image/gif');
  expect(r.size).toBeGreaterThan(5000);
});
