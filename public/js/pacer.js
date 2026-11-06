// Decides how many emulated frames to run per display tick, at 1x, 4x, 8x... of the game's real speed.

export function createPacer(fps) {
  const frameMs = 1000 / fps;
  let speed = 1;
  let acc = 0; // emulated time not yet run, in ms of wall time at the current speed

  return {
    get speed() {
      return speed;
    },

    /** Anything that isn't a finite number >= 1 means normal speed. */
    setSpeed(n) {
      const next = Number.isFinite(n) && n >= 1 ? n : 1;
      acc = (acc / (frameMs / speed)) * (frameMs / next); // keep the fraction of a frame already owed
      speed = next;
    },

    reset() {
      acc = 0;
    },

    /** Frames to run now, given the wall time since the previous tick. */
    advance(deltaMs) {
      const step = frameMs / speed;
      acc += Math.min(deltaMs, 100); // a background tab must not trigger a long catch-up
      const cap = Math.ceil(speed) * 2 + 2; // per tick: protects slow devices
      let n = 0;
      while (acc >= step && n < cap) {
        acc -= step;
        n++;
      }
      if (acc >= step) acc = 0; // cannot keep up: drop the backlog instead of spiralling
      return n;
    },
  };
}
