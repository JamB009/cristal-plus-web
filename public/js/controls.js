// On-screen Game Boy controls (multi-touch pointer events) plus a keyboard fallback.

import { A, B, SELECT, START, UP, DOWN, LEFT, RIGHT } from './core.js';

const BUTTONS = { a: A, b: B, start: START, select: SELECT };
const KEYS = {
  ArrowUp: UP, ArrowDown: DOWN, ArrowLeft: LEFT, ArrowRight: RIGHT,
  x: A, z: B, Enter: START, Shift: SELECT, Backspace: SELECT,
};

/** Direction mask for a thumb offset (pixels) from the pad's centre. */
export function dpadMask(dx, dy, dead = 12) {
  const ax = Math.abs(dx);
  const ay = Math.abs(dy);
  const big = Math.max(ax, ay);
  if (big < dead) return 0;
  const counts = (a) => a >= dead && a >= big * 0.5;
  let m = 0;
  if (counts(ax)) m |= dx > 0 ? RIGHT : LEFT;
  if (counts(ay)) m |= dy > 0 ? DOWN : UP;
  return m;
}

function el(tag, className, attrs = {}) {
  const e = document.createElement(tag);
  e.className = className;
  for (const [k, v] of Object.entries(attrs)) e.setAttribute(k, v);
  return e;
}

/** Builds the controls inside `root` and reports the combined button mask. Returns an unmount function. */
export function mountControls(root, onInput) {
  const dpad = el('div', 'dpad', { 'data-key': 'dpad' });
  const ab = el('div', 'ab');
  const ss = el('div', 'ss');
  const buttons = {
    a: el('button', 'btn btn-a', { 'data-key': 'a', 'aria-label': 'A', type: 'button' }),
    b: el('button', 'btn btn-b', { 'data-key': 'b', 'aria-label': 'B', type: 'button' }),
    select: el('button', 'pill', { 'data-key': 'select', type: 'button' }),
    start: el('button', 'pill', { 'data-key': 'start', type: 'button' }),
  };
  buttons.a.textContent = 'A';
  buttons.b.textContent = 'B';
  buttons.select.textContent = 'SELECT';
  buttons.start.textContent = 'START';
  ab.append(buttons.b, buttons.a);
  ss.append(buttons.select, buttons.start);
  root.append(dpad, ab, ss);

  const dpadPointers = new Map(); // pointerId -> mask
  const held = new Map(); // pointerId -> key name
  const keys = new Set();
  let last = 0;

  const emit = () => {
    let m = 0;
    for (const v of dpadPointers.values()) m |= v;
    for (const k of held.values()) m |= BUTTONS[k];
    for (const k of keys) m |= KEYS[k];
    if (m !== last) {
      last = m;
      onInput(m);
    }
  };

  const capture = (target, id) => {
    try {
      target.setPointerCapture(id);
    } catch {
      // synthetic pointers (tests) have nothing to capture
    }
  };

  const padMask = (e) => {
    const r = dpad.getBoundingClientRect();
    return dpadMask(e.clientX - (r.left + r.width / 2), e.clientY - (r.top + r.height / 2), r.width * 0.12);
  };

  dpad.addEventListener('pointerdown', (e) => {
    e.preventDefault();
    capture(dpad, e.pointerId);
    dpadPointers.set(e.pointerId, padMask(e));
    dpad.classList.add('active');
    emit();
  });
  dpad.addEventListener('pointermove', (e) => {
    if (!dpadPointers.has(e.pointerId)) return;
    dpadPointers.set(e.pointerId, padMask(e));
    emit();
  });
  const padRelease = (e) => {
    dpadPointers.delete(e.pointerId);
    if (dpadPointers.size === 0) dpad.classList.remove('active');
    emit();
  };
  dpad.addEventListener('pointerup', padRelease);
  dpad.addEventListener('pointercancel', padRelease);

  for (const [name, button] of Object.entries(buttons)) {
    button.addEventListener('pointerdown', (e) => {
      e.preventDefault();
      capture(button, e.pointerId);
      held.set(e.pointerId, name);
      button.classList.add('active');
      emit();
    });
    const release = (e) => {
      held.delete(e.pointerId);
      if (![...held.values()].includes(name)) button.classList.remove('active');
      emit();
    };
    button.addEventListener('pointerup', release);
    button.addEventListener('pointercancel', release);
  }

  const stopMenu = (e) => e.preventDefault();
  root.addEventListener('contextmenu', stopMenu);
  const onKeyDown = (e) => {
    if (e.key in KEYS && !e.repeat) {
      keys.add(e.key);
      emit();
      e.preventDefault();
    }
  };
  const onKeyUp = (e) => {
    if (keys.delete(e.key)) emit();
  };
  window.addEventListener('keydown', onKeyDown);
  window.addEventListener('keyup', onKeyUp);

  return () => {
    window.removeEventListener('keydown', onKeyDown);
    window.removeEventListener('keyup', onKeyUp);
    root.replaceChildren();
  };
}
