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
  await expect(page.locator('#st-rec')).toBeVisible();
  await expect(page.locator('#st-nohint')).toBeHidden();
});

test('in an iframe it degrades to a hint (no REC)', async ({ page }) => {
  await page.goto('/tests/fixtures/iframe-host.html');
  const f = page.frameLocator('#host');
  await expect(f.locator('#st-nohint')).toBeVisible();
  await expect(f.locator('#st-rec')).toBeHidden();
  const frame = page.frame({ url: /engine-skeleton/ });
  expect(await frame.evaluate(() => window.__film.studio.env.canRec)).toBe(false);
});
