import test from 'node:test';
import assert from 'node:assert/strict';
import { loadRom } from '../helpers/roms.js';

test('loads both ROMs', () => {
  assert.equal(loadRom('BYTE').length, 2097152);
  assert.equal(loadRom('BYTS').length, 2097152);
});
