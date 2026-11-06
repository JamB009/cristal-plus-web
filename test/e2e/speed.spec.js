import { test, expect } from '@playwright/test';
import { romPath } from '../helpers/roms.js';

async function boot(page) {
  await page.goto('/?test=1');
  await page.waitForFunction(() => document.documentElement.dataset.ready === '1');
  await page.setInputFiles('#rom-input', romPath('BYTS'));
  await page.waitForFunction(() => window.__crystal.session.romInfo !== null);
}

/** Emulated frames in one second of wall time. */
const fps = async (page) => {
  const before = await page.evaluate(() => window.__crystal.session.frames);
  await page.waitForTimeout(1000);
  return (await page.evaluate(() => window.__crystal.session.frames)) - before;
};
const speed = (page) => page.evaluate(() => window.__crystal.runner.speed);
const x4 = (page) => page.getByRole('button', { name: '×4' });
const x8 = (page) => page.getByRole('button', { name: '×8' });

test('the ×4 and ×8 buttons are visible and not pressed at start', async ({ page }) => {
  await boot(page);
  for (const b of [x4(page), x8(page)]) {
    await expect(b).toBeVisible();
    await expect(b).toHaveAttribute('aria-pressed', 'false');
  }
  expect(await speed(page)).toBe(1);
});

test('×4 and ×8 speed the game up, and tapping again goes back to normal', async ({ page }) => {
  await boot(page);
  const normal = await fps(page);
  expect(normal).toBeGreaterThan(40);
  expect(normal).toBeLessThan(80);

  await x4(page).click();
  expect(await speed(page)).toBe(4);
  await expect(x4(page)).toHaveAttribute('aria-pressed', 'true');
  expect(await fps(page)).toBeGreaterThan(normal * 2.5);

  await x8(page).click();
  expect(await speed(page)).toBe(8);
  await expect(x4(page)).toHaveAttribute('aria-pressed', 'false');
  await expect(x8(page)).toHaveAttribute('aria-pressed', 'true');
  expect(await fps(page)).toBeGreaterThan(normal * 4);

  await x8(page).click();
  expect(await speed(page)).toBe(1);
  await expect(x8(page)).toHaveAttribute('aria-pressed', 'false');
  expect(await fps(page)).toBeLessThan(normal * 1.5);
});

test('sound is silent while fast-forwarding and comes back at normal speed', async ({ page }) => {
  await boot(page);
  await page.touchscreen.tap(195, 120);
  await page.waitForFunction(() => window.__crystal.audio.state === 'running');
  await page.waitForFunction(() => window.__crystal.audio.pushedFrames > 4800);

  await x4(page).click();
  const before = await page.evaluate(() => window.__crystal.audio.pushedFrames);
  await page.waitForTimeout(500);
  expect(await page.evaluate(() => window.__crystal.audio.pushedFrames)).toBe(before);

  await x4(page).click();
  await page.waitForFunction((n) => window.__crystal.audio.pushedFrames > n + 4800, before);
});

test('the speed is not remembered across reloads (never starts fast by accident)', async ({ page }) => {
  await boot(page);
  await x8(page).click();
  await page.reload();
  await page.waitForFunction(() => document.documentElement.dataset.ready === '1');
  expect(await speed(page)).toBe(1);
  await expect(x8(page)).toHaveAttribute('aria-pressed', 'false');
});

test('the buttons fit next to the menu in portrait and landscape', async ({ page }) => {
  for (const size of [{ width: 390, height: 664 }, { width: 844, height: 390 }]) {
    await page.setViewportSize(size);
    await boot(page);
    const boxes = await page.evaluate(() => ['#speed-4', '#speed-8', '#menu-button'].map((s) => document.querySelector(s).getBoundingClientRect().toJSON()));
    for (const b of boxes) {
      expect(b.left).toBeGreaterThanOrEqual(0);
      expect(b.right).toBeLessThanOrEqual(size.width);
      expect(b.width).toBeGreaterThanOrEqual(36);
      expect(b.height).toBeGreaterThanOrEqual(36);
    }
    const [a, b, m] = boxes;
    expect(a.right).toBeLessThanOrEqual(b.left + 0.5);
    expect(b.right).toBeLessThanOrEqual(m.left + 0.5);
  }
});
