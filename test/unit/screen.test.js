import test from 'node:test';
import assert from 'node:assert/strict';
import { integerScale } from '../../public/js/screen.js';

test('integerScale picks the largest integer factor in physical pixels', () => {
  assert.deepEqual(integerScale(390, 300, 3), { scale: 6, cssWidth: 320, cssHeight: 288 });
  assert.deepEqual(integerScale(1000, 1000, 1), { scale: 6, cssWidth: 960, cssHeight: 864 });
});

test('integerScale never goes below 1', () => {
  assert.equal(integerScale(50, 50, 1).scale, 1);
});
