import { test, expect } from '@playwright/test';
import { readFileSync } from 'node:fs';
import { romPath } from '../helpers/roms.js';

async function boot(page) {
  await page.goto('/?test=1');
  await page.waitForFunction(() => document.documentElement.dataset.ready === '1');
  await page.setInputFiles('#rom-input', romPath('BYTS'));
  await page.waitForFunction(() => window.__crystal.session.romInfo !== null);
  await page.evaluate(() => window.__crystal.runner.pause());
}

const sram = (page) => page.evaluate(() => Array.from(window.__crystal.core.getMemory(0)));
const pattern = (seed) => Buffer.from(Array.from({ length: 32768 }, (_, i) => (i * seed + 1) & 255));

test('export downloads the current save as <ROM>.sav', async ({ page }) => {
  await boot(page);
  await page.evaluate(() => window.__crystal.core.setMemory(0, new Uint8Array(32768).map((_, i) => (i * 3 + 7) & 255)));
  await page.click('#menu-button');
  const [download] = await Promise.all([
    page.waitForEvent('download'),
    page.getByRole('button', { name: /Exportar partida/ }).click(),
  ]);
  expect(download.suggestedFilename()).toBe('PM_CRYSTAL_BYTS.sav');
  const bytes = readFileSync(await download.path());
  expect(bytes.length).toBe(32768);
  expect([...bytes]).toEqual(await sram(page));
});

test('import replaces the save, keeps a backup and says so', async ({ page }) => {
  await boot(page);
  const next = pattern(5);
  await page.setInputFiles('#sav-input', { name: 'mi-partida.sav', mimeType: 'application/octet-stream', buffer: next });
  await expect(page.locator('#toast')).toContainText('Partida importada');
  expect(await sram(page)).toEqual([...next]);
  const backups = await page.evaluate(async () => (await window.__crystal.storage.keys('saves')).filter((k) => k.startsWith('backup-')));
  expect(backups.length).toBe(1);
});

for (const [name, size] of [['an empty file', 0], ['a file of the wrong size', 100]]) {
  test(`import rejects ${name} and keeps the current save`, async ({ page }) => {
    await boot(page);
    const before = await sram(page);
    await page.setInputFiles('#sav-input', { name: 'mal.sav', mimeType: 'application/octet-stream', buffer: Buffer.alloc(size) });
    await expect(page.locator('#toast')).toContainText('no es válido');
    expect(await sram(page)).toEqual(before);
  });
}

test('export and import without a loaded game explain what to do', async ({ page }) => {
  await page.goto('/?test=1');
  await page.waitForFunction(() => document.documentElement.dataset.ready === '1');
  await page.click('#menu-button');
  await page.getByRole('button', { name: /Exportar partida/ }).click();
  await expect(page.locator('#toast')).toContainText('Carga primero un juego');
});
