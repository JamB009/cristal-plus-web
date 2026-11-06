import test from 'node:test';
import assert from 'node:assert/strict';
import { dpadMask } from '../../public/js/controls.js';
import { UP, DOWN, LEFT, RIGHT } from '../../public/js/core.js';

test('dpadMask maps cardinal directions', () => {
  assert.equal(dpadMask(30, 0), RIGHT);
  assert.equal(dpadMask(-30, 0), LEFT);
  assert.equal(dpadMask(0, -30), UP);
  assert.equal(dpadMask(0, 30), DOWN);
  assert.equal([RIGHT, LEFT, UP, DOWN].join(), '128,64,16,32');
});

test('dpadMask maps diagonals to two directions', () => {
  assert.equal(dpadMask(-30, -30), LEFT | UP);
  assert.equal(dpadMask(-30, -30), 80);
  assert.equal(dpadMask(30, 30), RIGHT | DOWN);
});

test('dpadMask has a dead zone', () => {
  assert.equal(dpadMask(2, 2), 0);
  assert.equal(dpadMask(0, 0), 0);
  assert.equal(dpadMask(11, 0), 0);
});

test('dpadMask ignores the minor axis below half of the major one', () => {
  assert.equal(dpadMask(30, 5), RIGHT);
  assert.equal(dpadMask(5, -30), UP);
  assert.equal(dpadMask(30, 15), RIGHT | DOWN);
});

test('dpadMask honours a custom dead zone', () => {
  assert.equal(dpadMask(20, 0, 25), 0);
  assert.equal(dpadMask(30, 0, 25), RIGHT);
});
