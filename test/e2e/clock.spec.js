import { test, expect } from '@playwright/test';
import { romPath } from '../helpers/roms.js';

async function boot(page) {
  await page.goto('/?test=1');
  await page.waitForFunction(() => document.documentElement.dataset.ready === '1');
  await page.setInputFiles('#rom-input', romPath('BYTS'));
  await page.waitForFunction(() => window.__crystal.session.romInfo !== null);
  await page.evaluate(() => window.__crystal.runner.pause());
}

// Seconds the game clock is past local midnight, as the page computes it.
const clockSeconds = (page) => page.evaluate(() => {
  const base = Number(new DataView(window.__crystal.core.getMemory(1).buffer).getBigUint64(0, true));
  const d = new Date();
  return Math.floor(d.getTime() / 1000) - base - 0 * d.getTime();
});
const localSeconds = (page) => page.evaluate(() => { const d = new Date(); return d.getHours() * 3600 + d.getMinutes() * 60 + d.getSeconds(); });

test('on first run the game clock follows the local time of day', async ({ page }) => {
  await boot(page);
  const diff = Math.abs((await clockSeconds(page)) - (await localSeconds(page)));
  expect(Math.min(diff, 86400 - diff)).toBeLessThan(10);
});

test('the menu can put the game clock back on the local time', async ({ page }) => {
  await boot(page);
  await page.evaluate(() => {
    const b = new DataView(new ArrayBuffer(8));
    b.setBigUint64(0, BigInt(Math.floor(Date.now() / 1000)), true); // midnight, like the old version
    window.__crystal.core.setMemory(1, new Uint8Array(b.buffer));
  });
  await page.click('#menu-button');
  await page.getByRole('button', { name: /Sincronizar reloj/ }).click();
  await expect(page.locator('#toast')).toContainText('Reloj del juego ajustado a');
  const diff = Math.abs((await clockSeconds(page)) - (await localSeconds(page)));
  expect(Math.min(diff, 86400 - diff)).toBeLessThan(10);
});
