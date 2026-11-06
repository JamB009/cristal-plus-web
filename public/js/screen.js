// Canvas output: 160x144 pixels scaled by an integer factor of the device's physical pixels.

import { WIDTH, HEIGHT } from './core.js';

/** Largest integer scale (in physical pixels) that fits the box; returns {scale, cssWidth, cssHeight}. */
export function integerScale(availW, availH, dpr = 1) {
  const scale = Math.max(1, Math.floor(Math.min((availW * dpr) / WIDTH, (availH * dpr) / HEIGHT)));
  return { scale, cssWidth: (WIDTH * scale) / dpr, cssHeight: (HEIGHT * scale) / dpr };
}

export function createScreen(canvas, wrap) {
  const ctx = canvas.getContext('2d');
  canvas.width = WIDTH;
  canvas.height = HEIGHT;

  function resize() {
    const cs = getComputedStyle(wrap);
    const pad = (a, b) => parseFloat(cs[a]) + parseFloat(cs[b]);
    const ring = 8; // room for the canvas' box-shadow frame
    const availW = wrap.clientWidth - pad('paddingLeft', 'paddingRight') - ring;
    const availH = wrap.clientHeight - pad('paddingTop', 'paddingBottom') - ring;
    const { cssWidth, cssHeight } = integerScale(availW, availH, window.devicePixelRatio || 1);
    canvas.style.width = `${cssWidth}px`;
    canvas.style.height = `${cssHeight}px`;
  }

  return {
    resize,
    draw(rgba) {
      ctx.putImageData(new ImageData(rgba, WIDTH, HEIGHT), 0, 0);
    },
  };
}
