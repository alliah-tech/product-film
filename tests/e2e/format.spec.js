'use strict';
const { test, expect } = require('@playwright/test');
const { FAKE_GDM } = require('../helpers/fake-gdm');
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

test('vertical: the start screen grows and still fits the stage', async ({ page }) => {
  const m = {};
  for (const fmt of ['landscape', 'portrait']) {
    await page.goto(PAGE + '?format=' + fmt);
    m[fmt] = await page.evaluate(() => {
      const st = document.getElementById('stage'), s = st.getBoundingClientRect(), k = s.width / st.offsetWidth;
      const inner = document.querySelector('#start .s-inner').getBoundingClientRect();
      return {
        title: document.querySelector('.cutbtn .cb-t').getBoundingClientRect().height / k,
        fits: inner.left >= s.left && inner.right <= s.right && inner.top >= s.top && inner.bottom <= s.bottom
      };
    });
  }
  expect(m.landscape.fits).toBe(true);
  expect(m.portrait.fits).toBe(true);
  expect(m.portrait.title / m.landscape.title).toBeGreaterThan(1.5);
});

test('rotated stage: clockwise, and the cursor still lands on the button', async ({ page }) => {
  await page.goto(PAGE + '?format=portrait&cut=full&t=5.1&paused=1');
  await page.evaluate(() => { window.__film.studio.rotate(true); window.__film.seek(5.1); });
  const r = await page.evaluate(() => {
    const s = document.getElementById('stage').getBoundingClientRect();
    const p = document.getElementById('progress').getBoundingClientRect(); /* stage bottom edge */
    const c = document.getElementById('cursor').getBoundingClientRect();
    const b = document.getElementById('btn-acao').getBoundingClientRect();
    const cx = c.left + c.width / 2, cy = c.top + c.height / 2;
    return {
      wide: s.width > s.height,
      bottomOnTheLeft: p.height > p.width && p.right < s.left + s.width / 2,
      hit: cx >= b.left && cx <= b.right && cy >= b.top && cy <= b.bottom
    };
  });
  expect(r).toEqual({ wide: true, bottomOnTheLeft: true, hit: true });
});

test('the upright canvas undoes the turn: stage corners come back to their places', async ({ page }) => {
  await page.goto(PAGE + '?format=portrait');
  const px = await page.evaluate(async () => {
    /* what the tab capture sees of a stage turned clockwise: its top-left corner at the
       frame's top-right, its bottom-right corner at the frame's bottom-left */
    const src = document.createElement('canvas'); src.width = 1920; src.height = 1080;
    const g = src.getContext('2d');
    (function paint() {
      g.fillStyle = '#000'; g.fillRect(0, 0, 1920, 1080);
      g.fillStyle = '#f00'; g.fillRect(1820, 0, 100, 100);
      g.fillStyle = '#00f'; g.fillRect(0, 980, 100, 100);
      requestAnimationFrame(paint);
    })();
    const up = window.__film.studio.upright(src.captureStream(30), true);
    await new Promise((r) => setTimeout(r, 800));
    const c = up.canvas.getContext('2d');
    const at = (x, y) => Array.from(c.getImageData(x, y, 1, 1).data.slice(0, 3));
    const out = { size: [up.canvas.width, up.canvas.height], tl: at(20, 20), br: at(1060, 1900), tr: at(1060, 20) };
    up.stop();
    return out;
  });
  expect(px.size).toEqual([1080, 1920]);
  expect(px.tl[0]).toBeGreaterThan(200); expect(px.tl[2]).toBeLessThan(60);
  expect(px.br[2]).toBeGreaterThan(200); expect(px.br[0]).toBeLessThan(60);
  expect(Math.max(...px.tr)).toBeLessThan(60);
});

test('a vertical take on a landscape window plays rotated and records upright at 1080x1920', async ({ page }) => {
  await page.addInitScript(FAKE_GDM);
  await page.goto(PAGE + '?format=portrait');
  await page.evaluate(() => { window.__film.studio.autoDownload = false; });
  await page.evaluate(() => window.__film.studio.rec('ph'));
  await page.waitForFunction(() => window.__film.studio.state === 'recording', null, { timeout: 15000 });
  const during = await page.evaluate(() => {
    const r = document.getElementById('stage').getBoundingClientRect();
    return { rot: window.__film.studio.rotated, wide: r.width > r.height };
  });
  expect(during).toEqual({ rot: true, wide: true });
  await page.waitForFunction(() => window.__film.studio.state === 'idle' && !!window.__film.studio.lastTake, null, { timeout: 40000 });
  expect(await page.evaluate(() => window.__film.studio.rotated)).toBe(false);
  const size = await page.evaluate(() => new Promise((res, rej) => {
    const v = document.createElement('video');
    v.muted = true;
    v.onloadedmetadata = () => res([v.videoWidth, v.videoHeight]);
    v.onerror = () => rej(new Error('the take does not decode'));
    v.src = URL.createObjectURL(window.__film.studio.lastTake.blob);
  }));
  expect(size).toEqual([1080, 1920]);
});

test('a landscape take on a landscape window is not rotated', async ({ page }) => {
  await page.addInitScript(FAKE_GDM);
  await page.goto(PAGE + '?format=landscape');
  await page.evaluate(() => { window.__film.studio.autoDownload = false; });
  await page.evaluate(() => window.__film.studio.rec('ph'));
  await page.waitForFunction(() => window.__film.studio.state === 'recording', null, { timeout: 15000 });
  expect(await page.evaluate(() => window.__film.studio.rotated)).toBe(false);
  await page.evaluate(() => window.__film.studio.stop());
  await page.waitForFunction(() => window.__film.studio.state === 'idle', null, { timeout: 10000 });
});
