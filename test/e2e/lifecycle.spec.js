import { test, expect } from '@playwright/test';
import { romPath } from '../helpers/roms.js';

async function boot(page) {
  await page.goto('/?test=1');
  await page.waitForFunction(() => document.documentElement.dataset.ready === '1');
  await page.setInputFiles('#rom-input', romPath('BYTS'));
  await page.waitForFunction(() => window.__crystal.session.romInfo !== null);
}

const hide = (page) => page.evaluate(() => {
  Object.defineProperty(document, 'visibilityState', { configurable: true, get: () => 'hidden' });
  document.dispatchEvent(new Event('visibilitychange'));
});

// RF5: the app is backgrounded right after the game saved; iOS may then kill it.
test('backgrounding saves the game and it survives a reload', async ({ page }) => {
  await boot(page);
  const pattern = Array.from({ length: 32768 }, (_, i) => (i * 13 + 5) & 255);
  await page.evaluate((p) => {
    window.__crystal.runner.pause();
    window.__crystal.advance(1000); // let the game finish its boot-time SRAM handling
    window.__crystal.core.setMemory(0, new Uint8Array(p));
  }, pattern);

  await hide(page);
  expect(await page.evaluate(() => window.__crystal.runner.running)).toBe(false);
  await page.waitForFunction(async (p) => {
    const saved = await window.__crystal.storage.get('saves', 'PM_CRYSTAL_BYTS.srm');
    return !!saved && saved.every((b, i) => b === p[i]);
  }, pattern);

  await page.reload();
  await page.waitForFunction(() => document.documentElement.dataset.ready === '1');
  const live = await page.evaluate(() => {
    window.__crystal.runner.pause();
    return Array.from(window.__crystal.core.getMemory(0));
  });
  expect(live).toEqual(pattern);
  expect(await page.evaluate(() => window.__crystal.session.romInfo.baseName)).toBe('PM_CRYSTAL_BYTS');
});

test('the game resumes when the page becomes visible again', async ({ page }) => {
  await boot(page);
  await hide(page);
  expect(await page.evaluate(() => window.__crystal.runner.running)).toBe(false);
  await page.evaluate(() => {
    Object.defineProperty(document, 'visibilityState', { configurable: true, get: () => 'visible' });
    document.dispatchEvent(new Event('visibilitychange'));
  });
  expect(await page.evaluate(() => window.__crystal.runner.running)).toBe(true);
});

test('a tap unlocks the audio and the game starts feeding it', async ({ page }) => {
  await boot(page);
  expect(await page.evaluate(() => window.__crystal.audio.state)).toBe('none');
  await page.touchscreen.tap(195, 120);
  await page.waitForFunction(() => window.__crystal.audio.state === 'running');
  await page.waitForFunction(() => window.__crystal.audio.pushedFrames > 4800);
});

test('the sound switch in the menu mutes and unmutes, and is remembered', async ({ page }) => {
  await boot(page);
  await page.touchscreen.tap(195, 120);
  await page.waitForFunction(() => window.__crystal.audio.state === 'running');
  await page.click('#menu-button');
  const item = page.getByRole('button', { name: /Sonido/ });
  await expect(item).toContainText('sí');
  await item.click();
  expect(await page.evaluate(() => window.__crystal.audio.muted)).toBe(true);
  const before = await page.evaluate(() => window.__crystal.audio.pushedFrames);
  await page.waitForTimeout(300);
  expect(await page.evaluate(() => window.__crystal.audio.pushedFrames)).toBe(before);

  await page.reload();
  await page.waitForFunction(() => document.documentElement.dataset.ready === '1');
  expect(await page.evaluate(() => window.__crystal.audio.muted)).toBe(true);
  await page.click('#menu-button');
  await expect(page.getByRole('button', { name: /Sonido/ })).toContainText('no');
});
