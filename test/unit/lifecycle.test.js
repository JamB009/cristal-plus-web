import test from 'node:test';
import assert from 'node:assert/strict';
import { installLifecycle } from '../../public/js/lifecycle.js';

function setup(flush = async () => {}) {
  const calls = [];
  const doc = Object.assign(new EventTarget(), { visibilityState: 'visible' });
  const win = new EventTarget();
  const session = { flush: async () => { calls.push('flush'); await flush(); } };
  const audio = { ensureRunning: async () => { calls.push('audio'); } };
  const uninstall = installLifecycle({
    session, audio, doc, win,
    pause: () => calls.push('pause'),
    resume: () => calls.push('resume'),
  });
  return { calls, doc, win, uninstall };
}

const tick = () => new Promise((r) => setTimeout(r, 0));

test('going to the background pauses first, then flushes', async () => {
  const { calls, doc } = setup();
  doc.visibilityState = 'hidden';
  doc.dispatchEvent(new Event('visibilitychange'));
  await tick();
  assert.deepEqual(calls, ['pause', 'flush']);
});

test('coming back resumes', async () => {
  const { calls, doc } = setup();
  doc.visibilityState = 'hidden';
  doc.dispatchEvent(new Event('visibilitychange'));
  doc.visibilityState = 'visible';
  doc.dispatchEvent(new Event('visibilitychange'));
  await tick();
  assert.deepEqual(calls, ['pause', 'flush', 'resume']);
});

test('pagehide flushes', async () => {
  const { calls, win } = setup();
  win.dispatchEvent(new Event('pagehide'));
  await tick();
  assert.deepEqual(calls, ['pause', 'flush']);
});

test('a failing flush is reported but never thrown', async () => {
  const { calls, doc } = setup(async () => { throw new Error('quota'); });
  const original = console.error;
  const logged = [];
  console.error = (...a) => logged.push(a);
  try {
    doc.visibilityState = 'hidden';
    doc.dispatchEvent(new Event('visibilitychange'));
    await tick();
  } finally {
    console.error = original;
  }
  assert.deepEqual(calls, ['pause', 'flush']);
  assert.equal(logged.length, 1);
});

for (const gesture of ['pointerup', 'touchend', 'click', 'keydown']) {
  test(`a ${gesture} gesture asks the audio to run`, async () => {
    const { calls, doc } = setup();
    doc.dispatchEvent(new Event(gesture));
    await tick();
    assert.deepEqual(calls, ['audio']);
  });
}

test('uninstall removes every listener', async () => {
  const { calls, doc, win, uninstall } = setup();
  uninstall();
  doc.visibilityState = 'hidden';
  doc.dispatchEvent(new Event('visibilitychange'));
  win.dispatchEvent(new Event('pagehide'));
  doc.dispatchEvent(new Event('click'));
  await tick();
  assert.deepEqual(calls, []);
});
