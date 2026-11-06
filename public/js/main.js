import { createCore } from './core.js';
import { openStorage } from './storage.js';
import { Session } from './session.js';
import { loadNames } from './names.js';
import { createScreen } from './screen.js';
import { mountControls } from './controls.js';
import { createMenu } from './menu.js';
import { AudioOut } from './audio.js';
import { installLifecycle } from './lifecycle.js';
import { mountTradeUI } from './trade-ui.js';

const $ = (selector) => document.querySelector(selector);
const params = new URLSearchParams(location.search);
const testMode = params.has('test');

async function main() {
  const [core, storage, names] = await Promise.all([createCore(), openStorage(), loadNames()]);
  const session = await Session.create({ core, storage, names });
  const screen = createScreen($('#screen'), $('#screen-wrap'));
  const menu = createMenu($('#menu-button'), $('#menu'));
  mountTradeUI(document.body, { session, storage, names, menu });
  const audio = new AudioOut();
  audio.setMuted((await storage.get('kv', 'muted')) === true);
  mountControls($('#controls'), (mask) => session.setInput(mask));

  // ---- frame loop: one emulated frame per 1/fps of wall time, whatever the display's refresh rate ----
  let running = false;
  let last = 0;
  let acc = 0;
  const step = 1000 / core.fps;

  function tick(now) {
    if (!running) return;
    acc += Math.min(now - last, 100);
    last = now;
    let frames = 0;
    while (acc >= step && frames < 4) {
      session.frame();
      acc -= step;
      frames++;
    }
    if (acc > step * 4) acc = 0;
    if (frames > 0) {
      screen.draw(core.frame);
      audio.push(core.readAudio(), core.audioRate);
    }
    requestAnimationFrame(tick);
  }

  const runner = {
    get running() {
      return running;
    },
    start() {
      if (running) return;
      running = true;
      last = performance.now();
      acc = 0;
      requestAnimationFrame(tick);
    },
    pause() {
      running = false;
    },
  };

  const welcome = $('#welcome');
  const error = $('#error');
  const showError = (text) => {
    error.textContent = text;
    error.hidden = !text;
  };

  let persistAsked = false;
  function begin() {
    if (!persistAsked) {
      persistAsked = true;
      // Ask the browser not to evict our storage (saves live there). Safari may ignore it; the .sav export is the backup.
      navigator.storage?.persist?.().catch(() => {});
    }
    welcome.hidden = true;
    screen.resize();
    screen.draw(core.frame);
    runner.start();
  }

  async function loadFile(bytes) {
    runner.pause();
    showError('');
    const r = await session.loadRom(bytes);
    if (!r.ok) {
      welcome.hidden = false;
      showError(r.error);
      return;
    }
    begin();
  }

  const input = $('#rom-input');
  input.addEventListener('change', async () => {
    const file = input.files[0];
    input.value = '';
    if (file) await loadFile(new Uint8Array(await file.arrayBuffer()));
  });

  const toast = $('#toast');
  let toastTimer;
  const notify = (text) => {
    toast.textContent = text;
    toast.hidden = false;
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => { toast.hidden = true; }, 5000);
  };

  async function exportSav() {
    const bytes = session.exportSram();
    if (!bytes || !session.romInfo) return notify('Carga primero un juego.');
    const name = `${session.romInfo.baseName}.sav`;
    const file = new File([bytes], name, { type: 'application/octet-stream' });
    // On iOS the share sheet offers "Guardar en Archivos"; elsewhere a normal download.
    if (navigator.canShare?.({ files: [file] })) {
      try {
        await navigator.share({ files: [file], title: name });
        return;
      } catch (e) {
        if (e.name === 'AbortError') return;
      }
    }
    const url = URL.createObjectURL(file);
    const a = Object.assign(document.createElement('a'), { href: url, download: name });
    document.body.append(a);
    a.click();
    a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 10_000);
  }

  const savInput = $('#sav-input');
  savInput.addEventListener('change', async () => {
    const file = savInput.files[0];
    savInput.value = '';
    if (!file) return;
    const r = await session.importSram(new Uint8Array(await file.arrayBuffer()));
    notify(r.ok ? 'Partida importada. Tu partida anterior quedó guardada como copia de seguridad.' : r.message);
  });

  menu.add('Exportar partida (.sav)', exportSav);
  menu.add('Importar partida (.sav)…', () => savInput.click());
  menu.add('Cargar otra ROM…', () => input.click());

  const soundItem = menu.add('', async () => {
    audio.setMuted(!audio.muted);
    showSound();
    await storage.put('kv', 'muted', audio.muted);
  });
  const showSound = () => {
    soundItem.textContent = audio.muted ? '🔇 Sonido: no' : '🔊 Sonido: sí';
  };
  showSound();

  installLifecycle({
    session,
    audio,
    pause: () => runner.pause(),
    resume: () => {
      if (session.romInfo) runner.start();
    },
  });

  const hint = $('#install-hint');
  const isIOS = /iPad|iPhone|iPod/.test(navigator.userAgent) || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);
  if (isIOS && navigator.standalone === false && (await storage.get('kv', 'hintDismissed')) !== true) hint.hidden = false;
  hint.querySelector('button').addEventListener('click', async () => {
    await storage.put('kv', 'hintDismissed', true);
    hint.hidden = true;
  });

  if ('serviceWorker' in navigator) navigator.serviceWorker.register('sw.js').catch((e) => console.warn('Crystal+: sin service worker', e));

  window.addEventListener('resize', () => screen.resize());
  screen.resize();

  if (testMode) {
    window.__crystal = {
      core,
      session,
      storage,
      runner,
      menu,
      audio,
      advance(n) {
        for (let i = 0; i < n; i++) session.frame();
        screen.draw(core.frame);
      },
    };
  }

  const testRom = testMode && params.get('testrom');
  if (testRom) {
    await loadFile(new Uint8Array(await (await fetch(testRom)).arrayBuffer()));
  } else if (await session.loadLastRom()) {
    begin();
  }
  document.documentElement.dataset.ready = '1';
}

main().catch((e) => {
  console.error(e);
  const error = $('#error');
  error.textContent = `No se pudo iniciar: ${e.message}`;
  error.hidden = false;
});
