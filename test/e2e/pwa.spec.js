import { test, expect } from '@playwright/test';
import { romPath } from '../helpers/roms.js';

const ready = (page) => page.waitForFunction(() => document.documentElement.dataset.ready === '1');

test('the manifest is valid, its icons load and the service worker activates', async ({ page, request }) => {
  await page.goto('/?test=1');
  await ready(page);
  const href = await page.locator('link[rel="manifest"]').getAttribute('href');
  const manifest = await (await request.get(`/${href}`)).json();
  expect(manifest.name).toBe('Pokémon Cristal+');
  expect(manifest.display).toBe('standalone');
  expect(manifest.start_url).toBeTruthy();
  const sizes = manifest.icons.map((i) => i.sizes);
  expect(sizes).toEqual(expect.arrayContaining(['192x192', '512x512']));
  for (const icon of manifest.icons) {
    const res = await request.get(`/${icon.src}`);
    expect(res.status(), icon.src).toBe(200);
    expect(res.headers()['content-type']).toBe('image/png');
  }
  const touch = await page.locator('link[rel="apple-touch-icon"]').getAttribute('href');
  expect((await request.get(`/${touch}`)).status()).toBe(200);
  await expect(page.locator('meta[name="apple-mobile-web-app-capable"]')).toHaveAttribute('content', 'yes');

  await page.evaluate(async () => { await navigator.serviceWorker.ready; });
  await page.reload();
  await ready(page);
  await page.waitForFunction(() => navigator.serviceWorker.controller !== null);
  expect(await page.evaluate(() => navigator.serviceWorker.controller.scriptURL)).toMatch(/\/sw\.js$/);
});

test('works offline: reload without network, load a ROM and see the game', async ({ page, context }) => {
  await page.goto('/?test=1');
  await ready(page);
  await page.evaluate(async () => { await navigator.serviceWorker.ready; });
  await page.reload(); // now controlled by the worker, which fills the cache on the way
  await ready(page);
  await page.waitForFunction(() => navigator.serviceWorker.controller !== null);

  await context.setOffline(true);
  await page.reload();
  await ready(page);
  await page.setInputFiles('#rom-input', romPath('BYTS'));
  await page.waitForFunction(() => window.__crystal.session.frames >= 120, null, { timeout: 30_000 });
  const colors = await page.evaluate(() => {
    const d = new Uint32Array(document.querySelector('#screen').getContext('2d').getImageData(0, 0, 160, 144).data.buffer);
    return new Set(d).size;
  });
  expect(colors).toBeGreaterThanOrEqual(2);
});

const iosHint = (page) => page.locator('#install-hint');
const standalone = (value) => (page) => page.addInitScript((v) => Object.defineProperty(navigator, 'standalone', { value: v, configurable: true }), value);

test('the iOS hint shows in Safari (navigator.standalone === false)', async ({ page }) => {
  await standalone(false)(page);
  await page.goto('/?test=1');
  await ready(page);
  await expect(iosHint(page)).toBeVisible();
  await expect(iosHint(page)).toContainText('Para no perder tu partida: Compartir → Añadir a pantalla de inicio');
});

test('the iOS hint is hidden once installed (standalone === true)', async ({ page }) => {
  await standalone(true)(page);
  await page.goto('/?test=1');
  await ready(page);
  await expect(iosHint(page)).toBeHidden();
});

test('the iOS hint can be dismissed and stays dismissed', async ({ page }) => {
  await standalone(false)(page);
  await page.goto('/?test=1');
  await ready(page);
  await iosHint(page).getByRole('button', { name: 'Cerrar' }).click();
  await expect(iosHint(page)).toBeHidden();
  await page.reload();
  await ready(page);
  await expect(iosHint(page)).toBeHidden();
});

test('there is no iOS hint on non-iOS browsers', async ({ browser }) => {
  const context = await browser.newContext({ userAgent: 'Mozilla/5.0 (X11; Linux x86_64) Chrome/120 Safari/537.36' });
  const page = await context.newPage();
  await page.addInitScript(() => Object.defineProperty(navigator, 'standalone', { value: false, configurable: true }));
  await page.goto('/?test=1');
  await ready(page);
  await expect(iosHint(page)).toBeHidden();
  await context.close();
});

test('persistent storage is requested when the first ROM loads', async ({ page }) => {
  await page.addInitScript(() => {
    window.__persistCalls = 0;
    Object.defineProperty(navigator.storage, 'persist', { configurable: true, value: async () => { window.__persistCalls++; return true; } });
  });
  await page.goto('/?test=1');
  await ready(page);
  expect(await page.evaluate(() => window.__persistCalls)).toBe(0);
  await page.setInputFiles('#rom-input', romPath('BYTS'));
  await page.waitForFunction(() => window.__crystal.session.romInfo !== null);
  expect(await page.evaluate(() => window.__persistCalls)).toBe(1);
});
