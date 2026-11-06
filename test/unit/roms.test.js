import test from 'node:test';
import assert from 'node:assert/strict';
import { loadRom } from '../helpers/roms.js';
import { title, gameCode, baseName, displayName, supported, spanish } from '../../public/js/roms.js';

test('reads the header of the English ROM', () => {
  const rom = loadRom('BYTE');
  assert.equal(title(rom), 'PM_CRYSTAL');
  assert.equal(gameCode(rom), 'BYTE');
  assert.equal(baseName(rom), 'PM_CRYSTAL_BYTE');
  assert.equal(displayName(rom), 'Pokémon Crystal (inglés)');
  assert.equal(supported(rom), true);
  assert.equal(spanish(rom), false);
});

test('reads the header of the Spanish ROM', () => {
  const rom = loadRom('BYTS');
  assert.equal(title(rom), 'PM_CRYSTAL');
  assert.equal(gameCode(rom), 'BYTS');
  assert.equal(baseName(rom), 'PM_CRYSTAL_BYTS');
  assert.equal(displayName(rom), 'Pokémon Cristal (español)');
  assert.equal(supported(rom), true);
  assert.equal(spanish(rom), true);
});

test('a ROM shorter than the header is treated as zeros', () => {
  const rom = new Uint8Array(10);
  assert.equal(title(rom), '');
  assert.equal(gameCode(rom), '');
  assert.equal(baseName(rom), 'game');
});

test('an unknown ROM is not supported', () => {
  assert.equal(supported(new Uint8Array(0x200)), false);
});

test('a non-ASCII game code is ignored', () => {
  const rom = new Uint8Array(0x200);
  rom.set([0x50, 0x4d], 0x134);
  rom.set([0xff, 0x01, 0x02, 0x03], 0x13f);
  assert.equal(gameCode(rom), '');
});
