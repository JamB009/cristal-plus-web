import test from 'node:test';
import assert from 'node:assert/strict';
import { createPacer } from '../../public/js/pacer.js';

const FPS = 4194304 / 70224;

/** Frames run over `seconds` of 60 Hz display ticks at the given speed. */
function simulate(speed, seconds = 10) {
  const pacer = createPacer(FPS);
  pacer.setSpeed(speed);
  let frames = 0;
  for (let t = 0; t < seconds * 60; t++) frames += pacer.advance(1000 / 60);
  return frames / seconds;
}

test('speed 1 keeps real time: ~59.7 frames per second on a 60 Hz display', () => {
  assert.ok(Math.abs(simulate(1) - FPS) < 0.5, `${simulate(1)}`);
});

test('speed 4 and 8 run 4x and 8x as many frames per second', () => {
  assert.ok(Math.abs(simulate(4) - 4 * FPS) < 2, `${simulate(4)}`);
  assert.ok(Math.abs(simulate(8) - 8 * FPS) < 3, `${simulate(8)}`);
});

test('it also works on a 120 Hz display', () => {
  const pacer = createPacer(FPS);
  pacer.setSpeed(4);
  let frames = 0;
  for (let t = 0; t < 1200; t++) frames += pacer.advance(1000 / 120);
  assert.ok(Math.abs(frames / 10 - 4 * FPS) < 2);
});

test('a long stall (background tab, slow device) is capped and leaves no backlog', () => {
  const pacer = createPacer(FPS);
  pacer.setSpeed(8);
  const burst = pacer.advance(5000);
  assert.ok(burst > 0 && burst <= 20, `${burst}`);
  assert.ok(pacer.advance(1000 / 60) <= 10, 'no catch-up spiral after the stall');
});

test('changing speed does not spike or lose frames', () => {
  const pacer = createPacer(FPS);
  for (let i = 0; i < 30; i++) pacer.advance(1000 / 60);
  pacer.setSpeed(8);
  const first = pacer.advance(1000 / 60);
  assert.ok(first >= 6 && first <= 10, `${first}`);
  pacer.setSpeed(1);
  assert.ok(pacer.advance(1000 / 60) <= 2);
});

test('nonsense speeds fall back to 1', () => {
  for (const bad of [0, -3, NaN, undefined, Infinity]) {
    const pacer = createPacer(FPS);
    pacer.setSpeed(bad);
    assert.equal(pacer.speed, 1);
  }
});
