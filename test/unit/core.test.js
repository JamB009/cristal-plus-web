import test from 'node:test';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { loadRom } from '../helpers/roms.js';
import { createCore, MEM_SRAM, MEM_WRAM, WIDTH, HEIGHT } from '../../public/js/core.js';

const hash = (core) => createHash('sha1').update(core.frame).digest('hex');
const run = (core, n) => { for (let i = 0; i < n; i++) core.runFrame(); };

for (const code of ['BYTE', 'BYTS']) {
  test(`${code}: loads and reports the frame rate`, async () => {
    const core = await createCore();
    assert.equal(core.load(loadRom(code)), true);
    assert.ok(core.fps > 59.7 && core.fps < 59.8, `fps ${core.fps}`);
    assert.equal(core.frame.length, WIDTH * HEIGHT * 4);
  });

  test(`${code}: renders something after 300 frames`, async () => {
    const core = await createCore();
    core.load(loadRom(code));
    run(core, 300);
    const colors = new Set(new Uint32Array(core.frame.buffer, core.frame.byteOffset, WIDTH * HEIGHT));
    assert.ok(colors.size >= 2, `only ${colors.size} color(s)`);
  });

  test(`${code}: SRAM and WRAM have the expected sizes`, async () => {
    const core = await createCore();
    core.load(loadRom(code));
    assert.equal(core.getMemory(MEM_SRAM).length, 32768);
    assert.equal(core.getMemory(MEM_WRAM).length, 32768);
  });

  test(`${code}: writeWram then readWram round-trips at 0xD000`, async () => {
    const core = await createCore();
    core.load(loadRom(code));
    assert.equal(core.writeWram(0xd000, new Uint8Array([1, 2, 3, 4])), true);
    assert.deepEqual([...core.readWram(0xd000, 4)], [1, 2, 3, 4]);
    assert.equal(core.getMemory(MEM_WRAM)[0x1000], 1);
  });

  test(`${code}: setMemory(MEM_SRAM) is visible through getMemory`, async () => {
    const core = await createCore();
    core.load(loadRom(code));
    const sram = new Uint8Array(32768).fill(0xa5);
    assert.equal(core.setMemory(MEM_SRAM, sram), true);
    assert.deepEqual(core.getMemory(MEM_SRAM), sram);
  });

  test(`${code}: state round trip is deterministic`, async () => {
    const core = await createCore();
    core.load(loadRom(code));
    run(core, 100);
    const state = core.saveState();
    assert.ok(state && state.length > 1000);
    run(core, 50);
    const h1 = hash(core);
    assert.equal(core.loadState(state), true);
    run(core, 50);
    assert.equal(hash(core), h1);
  });

  test(`${code}: produces stereo audio at the reported rate`, async () => {
    const core = await createCore();
    core.load(loadRom(code));
    run(core, 120);
    const audio = core.readAudio();
    assert.equal(audio.length % 2, 0);
    // 120 frames at 59.7275 fps is ~2.009 s of audio.
    const seconds = audio.length / 2 / core.audioRate;
    assert.ok(Math.abs(seconds - 120 / core.fps) < 0.05, `${seconds}s of audio`);
    assert.equal(core.readAudio().length, 0, 'second read must be empty');
  });
}

test('load returns false for garbage without throwing', async () => {
  const core = await createCore();
  const junk = new Uint8Array(100).map((_, i) => (i * 37) & 0xff);
  assert.equal(core.load(junk), false);
});

test('input mask reaches the game: START changes the title screen', async () => {
  const core = await createCore();
  core.load(loadRom('BYTS'));
  run(core, 900);
  const before = hash(core);
  core.setInput(8); // START
  run(core, 10);
  core.setInput(0);
  run(core, 60);
  assert.notEqual(hash(core), before);
});

// ---- colour modes ----

import { COLOR_VIVID, COLOR_SOFT, COLOR_LCD } from '../../public/js/core.js';

async function hashWith(mode, rom = 'BYTS', first = null) {
  const core = await createCore();
  if (first) core.load(loadRom(first));
  assert.equal(core.setColorMode(mode), true);
  core.load(loadRom(rom));
  run(core, 1500); // the intro scene has plenty of colour
  return hash(core);
}

test('each colour mode renders the same emulation with different colours', async () => {
  const hashes = [await hashWith(COLOR_VIVID), await hashWith(COLOR_SOFT), await hashWith(COLOR_LCD)];
  assert.equal(new Set(hashes).size, 3);
});

test('a colour mode is deterministic and survives loading another ROM', async () => {
  const direct = await hashWith(COLOR_SOFT, 'BYTE');
  assert.equal(await hashWith(COLOR_SOFT, 'BYTE'), direct);
  assert.equal(await hashWith(COLOR_SOFT, 'BYTE', 'BYTS'), direct);
  assert.notEqual(await hashWith(COLOR_LCD, 'BYTE'), direct);
});

test('unknown colour modes are rejected and the current one is kept', async () => {
  const core = await createCore();
  assert.equal(core.setColorMode(99), false);
  assert.equal(core.setColorMode(-1), false);
  assert.equal(core.colorMode, COLOR_LCD, 'the default matches the Android app');
  assert.equal(core.setColorMode(COLOR_SOFT), true);
  assert.equal(core.colorMode, COLOR_SOFT);
});

// ---- brightness: gambatte returns 5-bit channels, they must be expanded to the full 0-255 range ----

test('the picture uses the full 8-bit range (a bright scene reaches near-white)', async () => {
  const core = await createCore();
  core.load(loadRom('BYTS'));
  let max = 0;
  for (let i = 0; i < 4000; i++) {
    core.runFrame();
    if (i % 50 === 0) for (const v of core.frame) max = Math.max(max, v === 255 ? 0 : v); // skip alpha
  }
  assert.ok(max > 200, `brightest colour channel in the whole intro: ${max} (5-bit values stop at 31)`);
});

test('no colour channel is stuck in the 5-bit range: values are 8-bit expansions', async () => {
  const core = await createCore();
  core.load(loadRom('BYTS'));
  let above31 = false;
  for (let i = 0; i < 3000 && !above31; i++) {
    core.runFrame();
    if (i % 100 === 0) for (let p = 0; p < core.frame.length; p += 4) if (core.frame[p] > 31 || core.frame[p + 1] > 31 || core.frame[p + 2] > 31) above31 = true;
  }
  assert.ok(above31);
});
