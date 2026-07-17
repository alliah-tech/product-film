'use strict';
const { test, expect } = require('@playwright/test');
const PAGE = '/plugins/product-film/references/engine-skeleton.html';

test('studio exposes idle state and env with canRec', async ({ page }) => {
  await page.goto(PAGE);
  const s = await page.evaluate(() => ({
    state: window.__film.studio.state,
    env: window.__film.studio.env
  }));
  expect(s.state).toBe('idle');
  expect(s.env.iframe).toBe(false);
  expect(s.env.gdm).toBe(true);
  expect(s.env.canRec).toBe(true);
  await expect(page.locator('.cb-rec[data-rec="full"]')).toBeVisible();
  await expect(page.locator('.cb-rec[data-rec="ph"]')).toBeVisible();
  await expect(page.locator('#st-nohint')).toBeHidden();
  await expect(page.locator('#st-dl')).toBeHidden(); /* local file: nothing to download */
});

test('in an iframe it degrades to a hint (no REC)', async ({ page }) => {
  await page.goto('/tests/fixtures/iframe-host.html');
  const f = page.frameLocator('#host');
  await expect(f.locator('#st-nohint')).toBeVisible();
  await expect(f.locator('.cb-rec[data-rec="full"]')).toBeHidden();
  await expect(f.locator('.cb-rec[data-rec="ph"]')).toBeHidden();
  const frame = page.frame({ url: /engine-skeleton/ });
  expect(await frame.evaluate(() => window.__film.studio.env.canRec)).toBe(false);
});

test('sandboxed embed (claude.ai-like): ⬇ falls back to copying the HTML', async ({ page }) => {
  await page.goto('/tests/fixtures/iframe-host-sandboxed.html');
  const f = page.frameLocator('#host');
  await expect(f.locator('#st-dl')).toBeVisible();
  const dl = page.waitForEvent('download', { timeout: 1500 }).catch(() => null);
  await f.locator('#st-dl').click();
  await expect(f.locator('#st-toast')).toBeVisible();
  await expect(f.locator('#st-toast-msg')).toContainText('copied');
  /* info toast: no take buttons, just the message and × */
  await expect(f.locator('#tt-dl')).toBeHidden();
  await expect(f.locator('#tt-gif')).toBeHidden();
  await expect(f.locator('#tt-rerec')).toBeHidden();
  expect(await dl).toBe(null); /* sandbox without allow-downloads swallows it */
});

test('in an iframe, ⬇ downloads the HTML itself (pristine self-copy)', async ({ page }) => {
  await page.goto('/tests/fixtures/iframe-host.html');
  const f = page.frameLocator('#host');
  await expect(f.locator('#st-dl')).toBeVisible();
  const waiting = page.waitForEvent('download');
  await f.locator('#st-dl').click();
  const dl = await waiting;
  expect(dl.suggestedFilename()).toMatch(/\.html$/);
  const fs = require('fs');
  const html = fs.readFileSync(await dl.path(), 'utf8');
  expect(html.startsWith('<!doctype html>')).toBe(true);
  expect(html).toContain('id="pause-menu"');      /* full film, not a fragment */
  expect(html).toContain('function downloadSelf'); /* script travels along */
});
