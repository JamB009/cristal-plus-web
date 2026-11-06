// Page lifecycle: save when the page goes away, resume when it comes back, and (re)start audio on
// user gestures. Safari kills backgrounded PWAs without warning, so the save happens on the way out.

const GESTURES = ['pointerup', 'touchend', 'click', 'keydown'];

export function installLifecycle({ session, pause, resume, audio, doc = document, win = window }) {
  async function hide() {
    pause();
    try {
      await session.flush();
    } catch (e) {
      console.error('Crystal+: no se pudo guardar al salir', e);
    }
  }

  const onVisibility = () => {
    if (doc.visibilityState === 'hidden') hide();
    else resume();
  };
  const onPageHide = () => {
    hide();
  };
  const onPageShow = () => {
    if (doc.visibilityState !== 'hidden') resume();
  };
  // iOS only lets audio start (or restart after an interruption) from a gesture handler.
  const unlock = () => {
    audio.ensureRunning().catch(() => {});
  };

  doc.addEventListener('visibilitychange', onVisibility);
  win.addEventListener('pagehide', onPageHide);
  win.addEventListener('pageshow', onPageShow);
  for (const g of GESTURES) doc.addEventListener(g, unlock, { capture: true, passive: true });

  return () => {
    doc.removeEventListener('visibilitychange', onVisibility);
    win.removeEventListener('pagehide', onPageHide);
    win.removeEventListener('pageshow', onPageShow);
    for (const g of GESTURES) doc.removeEventListener(g, unlock, { capture: true });
  };
}
