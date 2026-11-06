import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { loadNames, nameOf } from '../../public/js/names.js';

const json = readFileSync(new URL('../../public/data/pokemon.json', import.meta.url), 'utf8');

test('loadNames reads the names array through fetch', async () => {
  const names = await loadNames('data/pokemon.json', async () => ({ ok: true, json: async () => JSON.parse(json) }));
  assert.equal(names.length, 252);
  assert.equal(names[25], 'PIKACHU');
});

test('loadNames rejects when the request fails', async () => {
  await assert.rejects(loadNames('x', async () => ({ ok: false, status: 404 })), /404/);
});

test('nameOf falls back to #n', () => {
  const names = ['', 'BULBASAUR'];
  assert.equal(nameOf(names, 1), 'BULBASAUR');
  assert.equal(nameOf(names, 0), '#0');
  assert.equal(nameOf(names, 99), '#99');
});
