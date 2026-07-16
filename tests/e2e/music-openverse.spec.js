'use strict';
const { test, expect } = require('@playwright/test');
const { FAKE_GDM } = require('../helpers/fake-gdm');
const PAGE = '/plugins/product-film/references/engine-skeleton.html';

const RESULTS = {
  results: [
    { id: '1', title: 'Neon Ride', creator: 'Ana', license: 'by', license_version: '4.0', url: 'http://localhost:4173/tests/fixtures/track.wav', duration: 30000 },
    { id: '2', title: 'Blocked Song', creator: 'Bob', license: 'by-sa', license_version: '4.0', url: 'https://blocked.example/x.mp3', duration: 30000 }
  ]
};

test.beforeEach(async ({ page }) => {
  await page.addInitScript(FAKE_GDM);
  await page.route('**/api.openverse.org/v1/audio/**', r => r.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(RESULTS) }));
  /* sem header ACAO → fetch(cors) falha; <audio> (no-cors) funciona */
  await page.route('https://blocked.example/**', r => r.fulfill({ status: 200, contentType: 'audio/mpeg', body: Buffer.alloc(64) }));
});

test('busca lista faixas; CORS ok vira rota buffer com crédito copiável', async ({ page, context }) => {
  await context.grantPermissions(['clipboard-read', 'clipboard-write'], { origin: 'http://localhost:4173' });
  await page.goto(PAGE);
  await page.click('#st-music');
  await page.check('#mp-api-radio');
  await page.fill('#mp-q', 'upbeat');
  await page.click('#mp-go');
  await expect(page.locator('#mp-list .mp-tk')).toHaveCount(2);
  await page.locator('#mp-list .mp-tk button').first().click();
  await page.waitForFunction(() => window.__film.studio.music.sel.type === 'api' && window.__film.studio.music.route === 'buffer');
  const credit = await page.evaluate(() => window.__film.studio.music.credit);
  expect(credit).toContain('Neon Ride');
  expect(credit).toContain('CC BY 4.0');
  await page.click('#mp-copy');
  expect(await page.evaluate(() => navigator.clipboard.readText())).toContain('Neon Ride');
});

test('CORS bloqueado vira rota element e arma áudio da guia no REC', async ({ page }) => {
  await page.goto(PAGE);
  await page.evaluate(() => { window.__film.studio.autoDownload = false; });
  await page.click('#st-music');
  await page.check('#mp-api-radio');
  await page.fill('#mp-q', 'x');
  await page.click('#mp-go');
  await page.locator('#mp-list .mp-tk button').nth(1).click();
  await page.waitForFunction(() => window.__film.studio.music.route === 'element');
  await expect(page.locator('#mp-note')).toContainText('compartilhar');
  await page.click('#mp-close');
  await page.evaluate(() => window.__film.studio.rec('full'));
  await page.waitForFunction(() => window.__film.studio.state === 'recording', null, { timeout: 15000 });
  expect(await page.evaluate(() => window.__gdmOpts.audio)).toBe(true);
  await page.evaluate(() => window.__film.studio.stop());
  await page.waitForFunction(() => window.__film.studio.state === 'idle', null, { timeout: 10000 });
  expect(await page.evaluate(() => window.__film.studio.lastTake.audioTracks)).toBe(1);
});

test('REC logo após "Usar" ainda grava com áudio (race api)', async ({ page }) => {
  /* atrasa o áudio CORS-ok para garantir que a seleção ainda está pendente no REC */
  await page.route('**/tests/fixtures/track.wav', async (r) => {
    await new Promise((res) => setTimeout(res, 1500));
    r.continue();
  });
  await page.goto(PAGE);
  await page.evaluate(() => { window.__film.studio.autoDownload = false; });
  await page.click('#st-music');
  await page.check('#mp-api-radio');
  await page.fill('#mp-q', 'x');
  await page.click('#mp-go');
  await page.locator('#mp-list .mp-tk button').first().click();
  /* NÃO espera a rota resolver */
  await page.click('#mp-close');
  await page.evaluate(() => window.__film.studio.rec('full'));
  await page.waitForFunction(() => window.__film.studio.state === 'recording', null, { timeout: 25000 });
  await page.evaluate(() => window.__film.studio.stop());
  await page.waitForFunction(() => window.__film.studio.state === 'idle' && !!window.__film.studio.lastTake, null, { timeout: 10000 });
  expect(await page.evaluate(() => window.__film.studio.lastTake.audioTracks)).toBe(1);
});
