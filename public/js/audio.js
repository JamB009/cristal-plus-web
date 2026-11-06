// Audio output. The core produces stereo Int16 at 32768 Hz; we resample to the device rate and feed
// an AudioWorklet (ScriptProcessor as a fallback). iOS only starts audio from a user gesture and
// suspends/interrupts it when backgrounded or on a call, so ensureRunning() must be called from
// gesture handlers and is cheap to call repeatedly.

const CAP_SECONDS = 0.25;
const PRIME_SECONDS = 0.04;

/**
 * Linear-interpolation resampler for interleaved stereo. `carry` ({pos, last}) links consecutive
 * chunks so there are no clicks at the joins. Returns { out: Float32Array (stereo), carry }.
 */
export function resample(input, srcRate, dstRate, carry = { pos: 0, last: [0, 0] }) {
  const n = input.length >> 1;
  if (n === 0) return { out: new Float32Array(0), carry };
  const step = srcRate / dstRate;
  const out = new Float32Array((Math.ceil((n - 1 - carry.pos) / step) + 1) * 2);
  let o = 0;
  let pos = carry.pos;
  while (pos < n - 1) {
    const i0 = Math.floor(pos);
    const frac = pos - i0;
    const aL = i0 < 0 ? carry.last[0] : input[2 * i0];
    const aR = i0 < 0 ? carry.last[1] : input[2 * i0 + 1];
    const bL = input[2 * (i0 + 1)];
    const bR = input[2 * (i0 + 1) + 1];
    out[o++] = (aL + (bL - aL) * frac) / 32768;
    out[o++] = (aR + (bR - aR) * frac) / 32768;
    pos += step;
  }
  return {
    out: out.subarray(0, o),
    carry: { pos: pos - n, last: [input[2 * (n - 1)], input[2 * (n - 1) + 1]] },
  };
}

/** Bounded queue for the ScriptProcessor fallback; mirrors audio-worklet.js. */
class Ring {
  constructor(rate) {
    this.cap = Math.ceil(rate * CAP_SECONDS);
    this.prime = Math.ceil(rate * PRIME_SECONDS);
    this.buf = new Float32Array(this.cap * 2);
    this.head = 0;
    this.count = 0;
    this.playing = false;
  }

  write(chunk) {
    for (let i = 0; i < chunk.length >> 1; i++) {
      if (this.count === this.cap) {
        this.head = (this.head + 1) % this.cap;
        this.count--;
      }
      const at = ((this.head + this.count) % this.cap) * 2;
      this.buf[at] = chunk[2 * i];
      this.buf[at + 1] = chunk[2 * i + 1];
      this.count++;
    }
  }

  read(left, right) {
    if (!this.playing && this.count >= this.prime) this.playing = true;
    for (let i = 0; i < left.length; i++) {
      if (this.playing && this.count > 0) {
        const at = this.head * 2;
        left[i] = this.buf[at];
        right[i] = this.buf[at + 1];
        this.head = (this.head + 1) % this.cap;
        this.count--;
      } else {
        left[i] = 0;
        right[i] = 0;
        this.playing = false;
      }
    }
  }
}

const defaultContext = () => new (globalThis.AudioContext || globalThis.webkitAudioContext)({ latencyHint: 'interactive' });

export class AudioOut {
  constructor({ makeContext = defaultContext, workletUrl = new URL('./audio-worklet.js', import.meta.url).href } = {}) {
    this.makeContext = makeContext;
    this.workletUrl = workletUrl;
    this.ctx = null;
    this.sink = null;
    this.carry = undefined;
    this.muted = false;
    this.pushedFrames = 0;
    this.setup = null;
  }

  /** 'none' until the first ensureRunning(), then the AudioContext's own state. */
  get state() {
    return this.ctx ? this.ctx.state : 'none';
  }

  /** Creates the context on first use and resumes it if iOS (or autoplay policy) left it suspended. */
  async ensureRunning() {
    if (!this.ctx) {
      this.ctx = this.makeContext();
      this.setup = this.#setup();
    }
    await this.setup;
    if (this.ctx.state !== 'running') await this.ctx.resume();
  }

  async #setup() {
    const ctx = this.ctx;
    try {
      if (!ctx.audioWorklet) throw new Error('no AudioWorklet');
      await ctx.audioWorklet.addModule(this.workletUrl);
      const node = new AudioWorkletNode(ctx, 'crystal-out', { numberOfInputs: 0, outputChannelCount: [2] });
      node.connect(ctx.destination);
      this.sink = (chunk) => node.port.postMessage(chunk, [chunk.buffer]);
    } catch {
      const ring = new Ring(ctx.sampleRate);
      const sp = ctx.createScriptProcessor(2048, 0, 2);
      sp.onaudioprocess = (e) => ring.read(e.outputBuffer.getChannelData(0), e.outputBuffer.getChannelData(1));
      sp.connect(ctx.destination);
      this.sink = (chunk) => ring.write(chunk);
    }
  }

  /** Queues Int16 stereo samples recorded at srcRate. Dropped until audio is unlocked, or when muted. */
  push(samples, srcRate) {
    if (!this.sink || this.muted || samples.length === 0) return;
    const r = resample(samples, srcRate, this.ctx.sampleRate, this.carry);
    this.carry = r.carry;
    this.pushedFrames += r.out.length >> 1;
    this.sink(r.out.slice());
  }

  setMuted(muted) {
    this.muted = muted;
  }
}
