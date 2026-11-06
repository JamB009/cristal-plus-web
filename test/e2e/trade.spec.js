import { test, expect } from '@playwright/test';
import { readFileSync } from 'node:fs';
import { romPath } from '../helpers/roms.js';

const scenarios = Object.fromEntries(
  JSON.parse(readFileSync(new URL('../fixtures/mons.json', import.meta.url), 'utf8')).map((s) => [s.name, s]),
);

async function boot(page, scenario = 'party3') {
  await page.goto('/?test=1');
  await page.waitForFunction(() => document.documentElement.dataset.ready === '1');
  await page.setInputFiles('#rom-input', romPath('BYTS'));
  await page.waitForFunction(() => window.__crystal.session.romInfo !== null);
  await page.evaluate((bank) => {
    window.__crystal.runner.pause();
    window.__crystal.core.writeWram(0xd000, Uint8Array.from(atob(bank), (c) => c.charCodeAt(0)));
  }, scenarios[scenario].bank);
}

const partyCount = (page) => page.evaluate(() => window.__crystal.core.readWram(0xdcd7, 1)[0]);
const openTrade = async (page) => {
  await page.click('#menu-button');
  await page.getByRole('button', { name: 'Intercambiar' }).click();
};
const sheet = (page) => page.locator('#trade');

async function sendSecond(page) {
  await openTrade(page);
  await sheet(page).getByRole('button', { name: /Enviar un Pokémon/ }).click();
  await sheet(page).locator('[data-index="1"]').click();
  await sheet(page).getByRole('button', { name: 'Enviar', exact: true }).click();
  const code = (await page.locator('#trade-code').textContent()).trim();
  await sheet(page).getByRole('button', { name: 'Cerrar' }).click();
  return code;
}

async function receive(page, text) {
  await openTrade(page);
  await sheet(page).getByRole('button', { name: /Recibir con un código/ }).click();
  await page.locator('#trade-input').fill(text);
  await sheet(page).getByRole('button', { name: 'Recibir', exact: true }).click();
}

test('send shows a code matching PKC1-<130 Base32> and the party drops to 2', async ({ page }) => {
  await boot(page);
  expect(await partyCount(page)).toBe(3);
  const code = await sendSecond(page);
  expect(code).toMatch(/^PKC1-[A-Z2-7]{130}$/);
  expect(await partyCount(page)).toBe(2);
});

test('receiving that code restores 3 and a second attempt shows the already-used message', async ({ page }) => {
  await boot(page);
  const code = await sendSecond(page);

  await receive(page, code);
  await expect(sheet(page)).toContainText('¿Recibir a');
  await sheet(page).getByRole('button', { name: 'Recibir', exact: true }).click();
  await expect(sheet(page)).toContainText('Intercambio completado');
  expect(await partyCount(page)).toBe(3);
  await sheet(page).getByRole('button', { name: /Genial/ }).click();

  await receive(page, code);
  await expect(sheet(page)).toContainText('Ese código ya se usó en este teléfono.');
  expect(await partyCount(page)).toBe(3);
});

test('pasting a WhatsApp message containing the code finds it', async ({ page }) => {
  await boot(page);
  const code = await sendSecond(page);
  await receive(page, `Hola! 🎁 ¡Te envío un Pokémon!\n\n*${code}*\n\n¡Disfrútalo!`);
  await expect(sheet(page)).toContainText('¿Recibir a');
  await expect(sheet(page)).toContainText('Entrenador original: JAM');
});

test('an invalid code shows an error and stays on the receive screen', async ({ page }) => {
  await boot(page);
  await receive(page, 'PKC1-ESTONOESUNCODIGO');
  await expect(sheet(page)).toContainText('No es un código válido');
  await expect(page.locator('#trade-input')).toBeVisible();
});

test('in battle shows "Termina el combate antes de intercambiar."', async ({ page }) => {
  await boot(page, 'battle');
  await openTrade(page);
  await sheet(page).getByRole('button', { name: /Enviar un Pokémon/ }).click();
  await sheet(page).locator('[data-index="0"]').click();
  await sheet(page).getByRole('button', { name: 'Enviar', exact: true }).click();
  await expect(sheet(page)).toContainText('Termina el combate antes de intercambiar.');
  expect(await partyCount(page)).toBe(3);
});

test('a single Pokémon cannot be sent', async ({ page }) => {
  await boot(page, 'party1');
  await openTrade(page);
  await sheet(page).getByRole('button', { name: /Enviar un Pokémon/ }).click();
  await expect(sheet(page)).toContainText('Necesitas al menos 2 Pokémon en el equipo para enviar uno.');
});

test('without a loaded game the trade screen asks to load one', async ({ page }) => {
  await boot(page, 'empty');
  await openTrade(page);
  await expect(sheet(page)).toContainText('Carga tu partida primero');
});

test('the history lists the sent code and lets you resend or recover it', async ({ page }) => {
  await boot(page);
  const code = await sendSecond(page);
  await openTrade(page);
  await sheet(page).getByRole('button', { name: /Códigos enviados/ }).click();
  await sheet(page).locator('[data-sent="0"]').click();
  await expect(sheet(page)).toContainText(code);
  await sheet(page).getByRole('button', { name: 'Recuperarlo' }).click();
  await sheet(page).getByRole('button', { name: 'Recibir', exact: true }).click();
  await expect(sheet(page)).toContainText('Intercambio completado');
  expect(await partyCount(page)).toBe(3);
});

test('an empty history says so', async ({ page }) => {
  await boot(page);
  await openTrade(page);
  await sheet(page).getByRole('button', { name: /Códigos enviados/ }).click();
  await expect(sheet(page)).toContainText('Aún no has enviado ningún Pokémon.');
});
