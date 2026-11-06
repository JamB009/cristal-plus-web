// JS wrapper over the gambatte wasm module (web/core/glue.cpp). Mirrors the shape of Core.java.

import createGambatte from '../wasm/gambatte.js';

export const WIDTH = 160;
export const HEIGHT = 144;

export const A = 256;
export const B = 1;
export const SELECT = 4;
export const START = 8;
export const UP = 16;
export const DOWN = 32;
export const LEFT = 64;
export const RIGHT = 128;

export const MEM_SRAM = 0;
export const MEM_RTC = 1;
/** Full 32 KB of WRAM; offset 0 is address 0xC000, bank n lives at 0x1000 * n. */
export const MEM_WRAM = 2;

/** Colour looks: raw GBC colours, gambatte's fast correction, and the dim "real GBC LCD" look. */
export const COLOR_VIVID = 0;
export const COLOR_SOFT = 1;
export const COLOR_LCD = 2;

const WRAM_BASE = 0xc000;

export async function createCore() {
  return new Core(await createGambatte());
}

export class Core {
  constructor(mod) {
    this.m = mod;
    this.fps = 4194304 / 70224;
    /** Native rate of readAudio(): 2 MHz box-filtered by 64. */
    this.audioRate = 32768;
    this.loaded = false;
    this.colorMode = COLOR_LCD; // same default as glue.cpp: matches the Android app's look
    this._frame = null;
  }

  load(rom) {
    const m = this.m;
    const p = m._malloc(rom.length);
    m.HEAPU8.set(rom, p);
    this.loaded = m._gb_load(p, rom.length) === 1;
    m._free(p);
    return this.loaded;
  }

  /** Returns false for an unknown mode. Persists across ROM loads. */
  setColorMode(mode) {
    const ok = this.m._gb_set_color_mode(mode) === 1;
    if (ok) this.colorMode = mode;
    return ok;
  }

  reset() {
    this.m._gb_reset();
    this.m._gb_audio_clear();
  }

  /** Runs one video frame. Returns true if a new frame was drawn. */
  runFrame() {
    return this.m._gb_run_frame() === 1;
  }

  /** RGBA 160x144 view over the wasm heap; re-created if the heap grew. */
  get frame() {
    const buf = this.m.HEAPU8.buffer;
    if (this._frame === null || this._frame.buffer !== buf) {
      this._frame = new Uint8ClampedArray(buf, this.m._gb_rgba_ptr(), WIDTH * HEIGHT * 4);
    }
    return this._frame;
  }

  setInput(mask) {
    this.m._gb_set_input(mask);
  }

  /** Interleaved stereo Int16 samples (at audioRate) produced since the last call. */
  readAudio() {
    const m = this.m;
    const n = m._gb_audio_count();
    const start = m._gb_audio_ptr() >> 1;
    const out = m.HEAP16.slice(start, start + n);
    m._gb_audio_clear();
    return out;
  }

  _area(which) {
    const m = this.m;
    switch (which) {
      case MEM_SRAM: return [m._gb_sram_ptr(), m._gb_sram_size()];
      case MEM_RTC: return [m._gb_rtc_ptr(), m._gb_rtc_size()];
      case MEM_WRAM: return [m._gb_wram_ptr(), m._gb_wram_size()];
      default: return [0, 0];
    }
  }

  /** Copy of a memory area, or null if nothing is loaded or the area is empty. */
  getMemory(which) {
    const [ptr, size] = this._area(which);
    return ptr === 0 || size === 0 ? null : this.m.HEAPU8.slice(ptr, ptr + size);
  }

  /** Overwrites a memory area; the length must match exactly. */
  setMemory(which, bytes) {
    const [ptr, size] = this._area(which);
    if (ptr === 0 || bytes.length !== size) return false;
    this.m.HEAPU8.set(bytes, ptr);
    return true;
  }

  readWram(addr, len) {
    const [ptr, size] = this._area(MEM_WRAM);
    const off = addr - WRAM_BASE;
    if (ptr === 0 || off < 0 || off + len > size) return null;
    return this.m.HEAPU8.slice(ptr + off, ptr + off + len);
  }

  writeWram(addr, bytes) {
    const [ptr, size] = this._area(MEM_WRAM);
    const off = addr - WRAM_BASE;
    if (ptr === 0 || off < 0 || off + bytes.length > size) return false;
    this.m.HEAPU8.set(bytes, ptr + off);
    return true;
  }

  saveState() {
    const m = this.m;
    const size = m._gb_state_size();
    if (size === 0) return null;
    const p = m._malloc(size);
    m._gb_save_state(p);
    const out = m.HEAPU8.slice(p, p + size);
    m._free(p);
    return out;
  }

  loadState(bytes) {
    const m = this.m;
    const p = m._malloc(bytes.length);
    m.HEAPU8.set(bytes, p);
    const ok = m._gb_load_state(p, bytes.length) === 1;
    m._free(p);
    if (ok) m._gb_audio_clear();
    return ok;
  }
}
