// AudioWorklet processor: plays interleaved stereo Float32 chunks posted from the main thread.
// Self-contained on purpose (no imports) so it loads in every browser's worklet scope; the same
// queue logic lives in audio.js (Ring) for the ScriptProcessor fallback.

const CAP_SECONDS = 0.25; // never hold more than this: latency stays bounded
const PRIME_SECONDS = 0.04; // after an underrun, rebuffer this much before playing again

class CrystalOut extends AudioWorkletProcessor {
  constructor() {
    super();
    this.cap = Math.ceil(sampleRate * CAP_SECONDS);
    this.prime = Math.ceil(sampleRate * PRIME_SECONDS);
    this.buf = new Float32Array(this.cap * 2);
    this.head = 0; // frame index of the oldest queued frame
    this.count = 0; // queued frames
    this.playing = false;
    this.port.onmessage = (e) => this.write(e.data);
  }

  write(chunk) {
    const frames = chunk.length >> 1;
    for (let i = 0; i < frames; i++) {
      if (this.count === this.cap) {
        this.head = (this.head + 1) % this.cap; // drop the oldest frame
        this.count--;
      }
      const at = ((this.head + this.count) % this.cap) * 2;
      this.buf[at] = chunk[2 * i];
      this.buf[at + 1] = chunk[2 * i + 1];
      this.count++;
    }
  }

  process(inputs, outputs) {
    const out = outputs[0];
    const left = out[0];
    const right = out[1] || out[0];
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
    return true;
  }
}

registerProcessor('crystal-out', CrystalOut);
