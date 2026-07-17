'use strict';
const { defineConfig } = require('@playwright/test');
module.exports = defineConfig({
  testDir: './tests/e2e',
  timeout: 90000,
  workers: 1,
  use: {
    baseURL: 'http://localhost:4173',
    headless: false,
    viewport: { width: 1280, height: 800 },
    launchOptions: { args: ['--autoplay-policy=no-user-gesture-required'] }
  },
  webServer: {
    command: 'node tests/serve.cjs',
    url: 'http://localhost:4173/plugins/product-film/references/engine-skeleton.html',
    reuseExistingServer: true,
    timeout: 15000
  }
});
