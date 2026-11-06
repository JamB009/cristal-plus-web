import { defineConfig, devices } from '@playwright/test';

const { defaultBrowserType, ...iphone } = devices['iPhone 14'];

export default defineConfig({
  testDir: 'test/e2e',
  outputDir: 'test/e2e/.artifacts',
  timeout: 60_000,
  workers: 1,
  reporter: 'list',
  use: { baseURL: 'http://127.0.0.1:8080', trace: 'off' },
  projects: [
    { name: 'chromium-iphone', use: { ...iphone, browserName: 'chromium' } },
    // WebKit needs system libraries that not every Linux has; opt in with PW_WEBKIT=1.
    ...(process.env.PW_WEBKIT ? [{ name: 'webkit-iphone', use: { ...iphone, browserName: 'webkit' } }] : []),
  ],
  webServer: {
    command: 'node tools/serve.mjs --port 8080 --dev-roms',
    url: 'http://127.0.0.1:8080/',
    reuseExistingServer: true,
  },
});
