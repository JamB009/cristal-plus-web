import { test, expect } from '@playwright/test';
import { romPath } from '../helpers/roms.js';

async function open(page) {
  await page.goto('/?test=1');
  await page.waitForFunction(() => document.documentElement.dataset.ready === '1');
}

async function boot(page) {
  await open(page);
  await page.setInputFiles('#rom-input', romPath('BYTS'));
  await page.waitForFunction(() => window.__crystal.session.romInfo !== null);
}

const canvasHash = (page) => page.evaluate(() => {
  const d = document.querySelector('#screen').getContext('2d').getImageData(0, 0, 160, 144).data;
  let h = 2166136261;
  for (let i = 0; i < d.length; i++) h = Math.imul(h ^ d[i], 16777619);
  return h >>> 0;
});

const canvasColors = (page) => page.evaluate(() => {
  const d = new Uint32Array(document.querySelector('#screen').getContext('2d').getImageData(0, 0, 160, 144).data.buffer);
  return new Set(d).size;
});

const press = async (page, key, ms = 0) => {
  const button = page.locator(`[data-key="${key}"]`);
  await button.dispatchEvent('pointerdown', { pointerId: 7, pointerType: 'touch', isPrimary: true });
  if (ms) await page.waitForTimeout(ms);
};
const release = (page, key) => page.locator(`[data-key="${key}"]`)
  .dispatchEvent('pointerup', { pointerId: 7, pointerType: 'touch', isPrimary: true });

test('shows the welcome screen when there is no ROM yet', async ({ page }) => {
  await open(page);
  await expect(page.locator('#welcome')).toBeVisible();
  await expect(page.locator('#welcome h1')).toHaveText('Pokémon Cristal+');
});

test('loads the BYTS ROM through the file input and renders a non-blank canvas', async ({ page }) => {
  await boot(page);
  await expect(page.locator('#welcome')).toBeHidden();
  await page.waitForFunction(() => window.__crystal.session.frames >= 300, null, { timeout: 30_000 });
  expect(await canvasColors(page)).toBeGreaterThanOrEqual(2);
});

test('rejects a file that is not a ROM and keeps the welcome screen', async ({ page }) => {
  await open(page);
  await page.setInputFiles('#rom-input', { name: 'x.gbc', mimeType: 'application/octet-stream', buffer: Buffer.from('not a rom') });
  await expect(page.locator('#error')).toContainText('No se pudo cargar la ROM');
  await expect(page.locator('#welcome')).toBeVisible();
});

test('the START button reaches the game: the same 120 frames differ with and without it', async ({ page }) => {
  await boot(page);
  await page.evaluate(() => { window.__crystal.runner.pause(); window.__crystal.advance(900); });
  const state = await page.evaluate(() => Array.from(window.__crystal.core.saveState()));

  await page.evaluate(() => window.__crystal.advance(120));
  const without = await canvasHash(page);

  await page.evaluate((s) => window.__crystal.core.loadState(new Uint8Array(s)), state);
  await press(page, 'start');
  await page.evaluate(() => window.__crystal.advance(10));
  await release(page, 'start');
  await page.evaluate(() => window.__crystal.advance(110));
  expect(await canvasHash(page)).not.toBe(without);
});

test('the on-screen buttons light up while held and release cleanly', async ({ page }) => {
  await boot(page);
  await press(page, 'a');
  await expect(page.locator('[data-key="a"]')).toHaveClass(/active/);
  await release(page, 'a');
  await expect(page.locator('[data-key="a"]')).not.toHaveClass(/active/);
});

for (const [name, size] of [['portrait', { width: 390, height: 664 }], ['landscape', { width: 844, height: 390 }]]) {
  test(`${name}: no horizontal scroll, controls inside the viewport, integer canvas scale`, async ({ page }) => {
    await page.setViewportSize(size);
    await boot(page);
    const m = await page.evaluate(() => {
      const box = (s) => document.querySelector(s).getBoundingClientRect().toJSON();
      return {
        scrollW: document.documentElement.scrollWidth,
        innerW: window.innerWidth,
        innerH: window.innerHeight,
        dpr: window.devicePixelRatio,
        canvas: box('#screen'),
        controls: ['dpad', 'a', 'b', 'start', 'select'].map((k) => box(`[data-key="${k}"]`)),
      };
    });
    expect(m.scrollW).toBeLessThanOrEqual(m.innerW);
    for (const r of m.controls) {
      expect(r.left).toBeGreaterThanOrEqual(0);
      expect(r.right).toBeLessThanOrEqual(m.innerW);
      expect(r.bottom).toBeLessThanOrEqual(m.innerH);
      expect(r.width).toBeGreaterThan(30);
    }
    const factor = (m.canvas.width * m.dpr) / 160;
    expect(Math.abs(factor - Math.round(factor))).toBeLessThan(0.01);
    expect(m.canvas.width).toBeGreaterThan(150);
  });
}
