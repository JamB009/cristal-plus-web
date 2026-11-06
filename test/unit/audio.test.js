import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';
import { resample, AudioOut } from '../../public/js/audio.js';

const stereo = (n, value = 0) => new Int16Array(n * 2).fill(value);

test('resample 32768 to 48000 over one second yields 48000 +/- 1 stereo frames in 60 chunks', () => {
  let carry;
  let frames = 0;
  const chunk = Math.floor(32768 / 60);
  let fed = 0;
  for (let i = 0; i < 60; i++) {
    const n = i === 59 ? 32768 - fed : chunk;
    fed += n;
    const r = resample(stereo(n, 1000), 32768, 48000, carry);
    carry = r.carry;
    frames += r.out.length / 2;
  }
  assert.ok(Math.abs(frames - 48000) <= 1, `${frames} frames`);
});

test('resample keeps a constant signal constant across chunk boundaries', () => {
  let carry;
  for (let i = 0; i < 10; i++) {
    const r = resample(stereo(548, 16384), 32768, 44100, carry);
    carry = r.carry;
    for (const v of r.out) assert.ok(Math.abs(v - 0.5) < 1e-6, `got ${v}`);
  }
});

test('resample: silence in, silence out; empty input changes nothing', () => {
  const r = resample(stereo(500), 32768, 48000);
  assert.ok(r.out.every((v) => v === 0));
  const again = resample(new Int16Array(0), 32768, 48000, r.carry);
  assert.equal(again.out.length, 0);
  assert.deepEqual(again.carry, r.carry);
});

test('resample interpolates linearly and keeps left and right apart', () => {
  const input = new Int16Array([0, 32767, 16384, -16384]); // two frames
  const { out } = resample(input, 1, 2); // double the rate
  assert.equal(out.length, 4); // frames at pos 0 and 0.5 (pos 1 waits for the next chunk)
  assert.ok(Math.abs(out[0] - 0) < 1e-6 && Math.abs(out[1] - 32767 / 32768) < 1e-6);
  assert.ok(Math.abs(out[2] - 0.25) < 1e-3 && Math.abs(out[3] - 0.25) < 1e-3);
});

// ---- AudioOut with a fake AudioContext (no audioWorklet, so the ScriptProcessor fallback is used) ----

function fakeContext(state) {
  const ctx = {
    state,
    sampleRate: 48000,
    resumes: 0,
    destination: {},
    processor: null,
    async resume() {
      ctx.resumes++;
      ctx.state = 'running';
    },
    createScriptProcessor() {
      ctx.processor = { connect() {}, onaudioprocess: null };
      return ctx.processor;
    },
  };
  return ctx;
}

const pull = (ctx, frames) => {
  const left = new Float32Array(frames);
  const right = new Float32Array(frames);
  ctx.processor.onaudioprocess({ outputBuffer: { getChannelData: (c) => (c === 0 ? left : right) } });
  return left;
};

// RF5: iOS suspends or interrupts the context when the app is backgrounded or a call comes in.
for (const state of ['suspended', 'interrupted']) {
  test(`ensureRunning resumes a context whose state is "${state}"`, async () => {
    const ctx = fakeContext(state);
    const audio = new AudioOut({ makeContext: () => ctx });
    await audio.ensureRunning();
    assert.equal(ctx.resumes, 1);
    assert.equal(audio.state, 'running');
    ctx.state = state; // iOS interrupts it again later
    await audio.ensureRunning();
    assert.equal(ctx.resumes, 2);
  });
}

test('ensureRunning does nothing more when the context is already running', async () => {
  const ctx = fakeContext('running');
  const audio = new AudioOut({ makeContext: () => ctx });
  await audio.ensureRunning();
  await audio.ensureRunning();
  assert.equal(ctx.resumes, 0);
});

test('no context is created before the first ensureRunning (needs a user gesture)', () => {
  let made = 0;
  const audio = new AudioOut({ makeContext: () => { made++; return fakeContext('running'); } });
  audio.push(stereo(500, 1000), 32768);
  assert.equal(made, 0);
  assert.equal(audio.state, 'none');
});

test('push before unlock does not throw and queues nothing', async () => {
  const ctx = fakeContext('running');
  const audio = new AudioOut({ makeContext: () => ctx });
  assert.doesNotThrow(() => audio.push(stereo(5000, 1000), 32768));
  await audio.ensureRunning();
  assert.ok(pull(ctx, 256).every((v) => v === 0));
});

test('the queue holds at most 250 ms of audio', async () => {
  const ctx = fakeContext('running');
  const audio = new AudioOut({ makeContext: () => ctx });
  await audio.ensureRunning();
  for (let i = 0; i < 60; i++) audio.push(stereo(546, 16384), 32768); // ~1 s, never consumed
  let played = 0;
  for (let i = 0; i < 200; i++) {
    const block = pull(ctx, 512);
    played += block.filter((v) => v !== 0).length;
  }
  assert.ok(played <= 0.25 * 48000 + 1024, `${played} frames`);
  assert.ok(played >= 0.2 * 48000, `${played} frames`);
});

test('muted audio is dropped', async () => {
  const ctx = fakeContext('running');
  const audio = new AudioOut({ makeContext: () => ctx });
  await audio.ensureRunning();
  audio.setMuted(true);
  audio.push(stereo(2000, 16384), 32768);
  assert.ok(pull(ctx, 512).every((v) => v === 0));
  audio.setMuted(false);
  for (let i = 0; i < 5; i++) audio.push(stereo(546, 16384), 32768);
  assert.ok(pull(ctx, 512).some((v) => v !== 0));
});

// ---- the worklet processor itself, run in a sandbox with the worklet globals ----

function loadWorklet(rate = 48000) {
  let Registered;
  const sandbox = {
    sampleRate: rate,
    AudioWorkletProcessor: class { constructor() { this.port = { onmessage: null }; } },
    registerProcessor: (name, cls) => { assert.equal(name, 'crystal-out'); Registered = cls; },
  };
  vm.runInNewContext(readFileSync(new URL('../../public/js/audio-worklet.js', import.meta.url), 'utf8'), sandbox);
  const p = new Registered();
  const send = (frames, value) => p.port.onmessage({ data: new Float32Array(frames * 2).fill(value) });
  const block = (n = 128) => {
    const l = new Float32Array(n);
    const r = new Float32Array(n);
    p.process([], [[l, r]]);
    return { l, r };
  };
  return { send, block };
}

test('worklet plays queued audio and keeps the processor alive', () => {
  const w = loadWorklet();
  w.send(4800, 0.5);
  const { l, r } = w.block();
  assert.ok(l.every((v) => v === 0.5) && r.every((v) => v === 0.5));
});

test('worklet caps its queue at 250 ms by dropping the oldest audio', () => {
  const w = loadWorklet();
  w.send(24000, 0.25); // 500 ms of old audio
  w.send(12000, 0.75); // 250 ms of new audio
  let total = 0;
  let last = 0;
  for (let i = 0; i < 400; i++) {
    const { l } = w.block();
    for (const v of l) if (v !== 0) { total++; last = v; }
  }
  assert.ok(total <= 0.25 * 48000 + 128, `${total} frames`);
  assert.equal(last, 0.75);
});

test('worklet waits to rebuffer 40 ms after an underrun instead of crackling', () => {
  const w = loadWorklet();
  w.send(4800, 0.5);
  for (let i = 0; i < 60; i++) w.block(); // drains and underruns
  w.send(1000, 0.5); // 21 ms: not enough to restart
  assert.ok(w.block().l.every((v) => v === 0));
  w.send(2000, 0.5); // 3000 frames buffered now: restarts
  assert.ok(w.block().l.some((v) => v !== 0));
});

test('resume() is called synchronously inside the gesture, before the worklet module loads', async () => {
  const ctx = fakeContext('suspended');
  let release;
  ctx.audioWorklet = { addModule: () => new Promise((r) => { release = r; }) };
  const audio = new AudioOut({ makeContext: () => ctx });
  const pending = audio.ensureRunning();
  assert.equal(ctx.resumes, 1, 'resume must not wait for addModule (iOS drops the user activation)');
  release();
  await pending;
  assert.equal(audio.state, 'running');
});

test('audio pushed while the context is suspended or interrupted is dropped, not queued', async () => {
  for (const state of ['suspended', 'interrupted']) {
    const ctx = fakeContext('running');
    const audio = new AudioOut({ makeContext: () => ctx });
    await audio.ensureRunning();
    ctx.state = state;
    for (let i = 0; i < 20; i++) audio.push(stereo(546, 16384), 32768);
    ctx.state = 'running';
    assert.ok(pull(ctx, 512).every((v) => v === 0), state);
  }
});
