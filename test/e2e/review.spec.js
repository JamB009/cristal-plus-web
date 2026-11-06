import { test, expect } from '@playwright/test';
import { readFileSync } from 'node:fs';
import { romPath } from '../helpers/roms.js';

const ready = (page) => page.waitForFunction(() => document.documentElement.dataset.ready === '1');

test('a second tab on the same origin is blocked instead of fighting over the save', async ({ context }) => {
  const first = await context.newPage();
  await first.goto('/?test=1');
  await ready(first);
  expect(await first.evaluate(() => typeof window.__crystal)).toBe('object');

  const second = await context.newPage();
  await second.goto('/?test=1');
  await ready(second);
  await expect(second.locator('#blocked')).toBeVisible();
  await expect(second.locator('#blocked')).toContainText('otra pestaña o ventana');
  expect(await second.evaluate(() => typeof window.__crystal)).toBe('undefined');
  await expect(first.locator('#blocked')).toBeHidden();
});

test('a reload is not mistaken for a second tab', async ({ page }) => {
  await page.goto('/?test=1');
  await ready(page);
  for (let i = 0; i < 3; i++) {
    await page.reload();
    await ready(page);
    await expect(page.locator('#blocked')).toBeHidden();
    expect(await page.evaluate(() => typeof window.__crystal)).toBe('object');
  }
});

test('the previous save can be exported after an import', async ({ page }) => {
  await page.goto('/?test=1');
  await ready(page);
  await page.setInputFiles('#rom-input', romPath('BYTS'));
  await page.waitForFunction(() => window.__crystal.session.romInfo !== null);
  await page.evaluate(() => window.__crystal.runner.pause());
  const before = await page.evaluate(() => {
    window.__crystal.core.setMemory(0, new Uint8Array(32768).map((_, i) => (i * 11 + 3) & 255));
    return Array.from(window.__crystal.core.getMemory(0));
  });
  await page.setInputFiles('#sav-input', { name: 'x.sav', mimeType: 'application/octet-stream', buffer: Buffer.alloc(32768, 9) });
  await expect(page.locator('#toast')).toContainText('Partida importada');
  await page.click('#menu-button');
  const [download] = await Promise.all([
    page.waitForEvent('download'),
    page.getByRole('button', { name: /Exportar copia anterior/ }).click(),
  ]);
  expect(download.suggestedFilename()).toBe('PM_CRYSTAL_BYTS-copia.sav');
  expect([...readFileSync(await download.path())]).toEqual(before);
});

test('asking for the previous save before any import explains there is none', async ({ page }) => {
  await page.goto('/?test=1');
  await ready(page);
  await page.setInputFiles('#rom-input', romPath('BYTS'));
  await page.waitForFunction(() => window.__crystal.session.romInfo !== null);
  await page.click('#menu-button');
  await page.getByRole('button', { name: /Exportar copia anterior/ }).click();
  await expect(page.locator('#toast')).toContainText('Aún no hay copias de seguridad');
});

test('the licence notice is linked from the welcome screen and mentions the GPL', async ({ page, request }) => {
  await page.goto('/?test=1');
  await ready(page);
  const href = await page.getByRole('link', { name: 'Licencias' }).getAttribute('href');
  const body = await (await request.get(`/${href}`)).text();
  expect(body).toContain('GNU General Public License');
  expect(body).toContain('gambatte');
});
