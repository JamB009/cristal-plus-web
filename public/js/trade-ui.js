// Trade screens: send (party → code → share/copy), receive (paste → confirm), and sent history.
// Texts follow GameActivity.java so both apps speak the same way.

import * as Trade from './trade.js';
import { textRaw } from './text.js';
import { nameOf } from './names.js';

function h(tag, attrs = {}, ...children) {
  const e = document.createElement(tag);
  for (const [k, v] of Object.entries(attrs)) {
    if (k === 'class') e.className = v;
    else if (k.startsWith('on')) e.addEventListener(k.slice(2), v);
    else e.setAttribute(k, v);
  }
  e.append(...children.flat().filter((c) => c != null));
  return e;
}

const SAVE_NOTE = '💾 Guarda la partida en el juego para que el cambio quede guardado.';

async function copyText(text) {
  try {
    await navigator.clipboard.writeText(text);
    return true;
  } catch {
    // Older Safari / no permission: fall back to a selected hidden textarea.
    const ta = h('textarea', { 'aria-hidden': 'true', style: 'position:fixed;opacity:0' });
    ta.value = text;
    document.body.append(ta);
    ta.select();
    let ok = false;
    try {
      ok = document.execCommand('copy');
    } catch {
      ok = false;
    }
    ta.remove();
    return ok;
  }
}

export function mountTradeUI(root, { session, storage, names, menu }) {
  const overlay = h('div', { id: 'trade', class: 'overlay', hidden: '' });
  const sheet = h('div', { class: 'sheet' });
  overlay.append(sheet);
  root.append(overlay);
  overlay.addEventListener('click', (e) => {
    if (e.target === overlay) close();
  });

  const close = () => {
    overlay.hidden = true;
    sheet.replaceChildren();
  };
  const show = (...content) => {
    sheet.replaceChildren(...content.flat());
    overlay.hidden = false;
  };
  const btn = (label, onclick, cls = '', attrs = {}) => h('button', { type: 'button', class: cls, onclick, ...attrs }, label);
  const closeBtn = (label = 'Cerrar') => btn(label, close, 'secondary');
  const notice = (title, message, back) => show(h('h2', {}, title), h('p', { class: 'trade-message' }, message), h('div', { class: 'actions' }, back ?? closeBtn()));

  const label = (m) => {
    if (m.egg) return 'HUEVO';
    const name = nameOf(names, m.species);
    return `${m.shiny ? '✦ ' : ''}${m.nick} · Nv. ${m.level}${m.nick.toLowerCase() === name.toLowerCase() ? '' : ` (${name})`}`;
  };

  function home() {
    if (!session.romInfo?.supported) {
      return notice('Intercambiar Pokémon', 'Los intercambios solo funcionan con Pokémon Crystal en inglés o español.');
    }
    session.refresh();
    if (!session.snapshot) return notice('Intercambiar Pokémon', 'Carga tu partida primero.');
    show(
      h('h2', {}, 'Intercambiar Pokémon'),
      h('div', { class: 'choices' },
        btn('📤 Enviar un Pokémon', pick),
        btn('📥 Recibir con un código', () => receiveScreen()),
        btn('🕘 Códigos enviados', sent)),
      h('div', { class: 'actions' }, closeBtn()),
    );
  }

  function pick() {
    session.refresh();
    const snap = session.snapshot;
    if (!snap) return home();
    if (snap.mons.length < 2) {
      return notice('¿Qué Pokémon envías?', 'Necesitas al menos 2 Pokémon en el equipo para enviar uno.', btn('Atrás', home, 'secondary'));
    }
    show(
      h('h2', {}, '¿Qué Pokémon envías?'),
      h('div', { class: 'choices' }, snap.mons.map((m, i) => btn(label(m), () => confirmSend(i, label(m)), '', { 'data-index': String(i) }))),
      h('div', { class: 'actions' }, btn('Cancelar', home, 'secondary')),
    );
  }

  function confirmSend(index, name) {
    show(
      h('h2', {}, `Enviar ${name}`),
      h('p', {}, 'Saldrá de tu equipo y se creará un código para que tu amigo lo reciba en su juego.'),
      h('p', {}, 'Si al final no lo envías, puedes recuperarlo desde «Códigos enviados».'),
      h('div', { class: 'actions' },
        btn('Enviar', async () => {
          const r = await session.sendMon(index);
          if (!r.ok) return notice('No se pudo enviar', r.message, btn('Atrás', home, 'secondary'));
          const copied = await copyText(r.code);
          showCode(r.code, r.message, copied);
        }, 'primary'),
        btn('Cancelar', pick, 'secondary')),
    );
  }

  const shareText = (code, name) => `🎁 ¡Te envío a ${name} desde Pokémon Cristal!\n\n`
    + 'Para recibirlo: copia este mensaje y pégalo en Pokémon Cristal+ (MENÚ → Intercambiar → Recibir con un código).\n\n'
    + code;

  function showCode(code, name, copied) {
    const actions = [];
    if (navigator.share) {
      actions.push(btn('Compartir', async () => {
        try {
          await navigator.share({ text: shareText(code, name) });
        } catch {
          // dismissed by the user
        }
      }, 'primary'));
    }
    actions.push(btn('Copiar', async (e) => {
      e.target.textContent = (await copyText(shareText(code, name))) ? '¡Copiado!' : 'No se pudo copiar';
    }, actions.length ? '' : 'primary'));
    actions.push(closeBtn());
    show(
      h('h2', {}, `Enviar ${name}`),
      copied ? h('p', {}, 'Código copiado. Envíaselo a tu amigo:') : null,
      h('pre', { id: 'trade-code' }, code),
      h('p', {}, SAVE_NOTE),
      h('div', { class: 'actions' }, actions),
    );
  }

  function receiveScreen(prefill = '', error = '') {
    const input = h('textarea', { id: 'trade-input', rows: '4', placeholder: 'Pega aquí el mensaje o el código PKC1-…' });
    input.value = prefill;
    const err = h('p', { class: 'trade-error', role: 'alert' }, error);
    err.hidden = !error;
    const paste = navigator.clipboard?.readText
      ? btn('Pegar', async () => {
        try {
          input.value = await navigator.clipboard.readText();
        } catch {
          // permission denied: the user can paste by hand
        }
      }, 'secondary')
      : null;
    show(
      h('h2', {}, 'Recibir un Pokémon'),
      input,
      err,
      h('div', { class: 'actions' },
        btn('Recibir', async () => {
          const offer = Trade.decode(input.value);
          if (!offer) return receiveScreen(input.value, 'No es un código válido. Comprueba que esté completo.');
          if (await storage.tradeUsed(offer.id)) return notice('Intercambio', 'Ese código ya se usó en este teléfono.', btn('Atrás', () => receiveScreen(input.value), 'secondary'));
          confirmReceive(offer);
        }, 'primary'),
        paste,
        btn('Cancelar', home, 'secondary')),
    );
  }

  function confirmReceive(offer) {
    const ot = textRaw(offer.mon.ot, offer.fromSpanish);
    const what = offer.egg
      ? 'un HUEVO'
      : `${textRaw(offer.mon.nick, offer.fromSpanish)} (${nameOf(names, offer.species)}, Nv. ${offer.level})`;
    show(
      h('h2', {}, 'Intercambio'),
      h('p', {}, `¿Recibir a ${what}?`),
      h('p', {}, `Entrenador original: ${ot}`),
      h('div', { class: 'actions' },
        btn('Recibir', async () => {
          const r = await session.receive(offer);
          if (!r.ok) return notice('No se pudo recibir', r.message);
          show(
            h('h2', {}, '🎉 ¡Intercambio completado!'),
            h('p', { class: 'trade-message' }, r.message),
            h('p', {}, SAVE_NOTE),
            h('div', { class: 'actions' }, btn('¡Genial!', close, 'primary')),
          );
        }, 'primary'),
        btn('Ahora no', close, 'secondary')),
    );
  }

  async function sent() {
    const list = await storage.tradeSent();
    if (list.length === 0) return notice('Códigos enviados', 'Aún no has enviado ningún Pokémon.', btn('Atrás', home, 'secondary'));
    const fmt = new Intl.DateTimeFormat('es', { dateStyle: 'short', timeStyle: 'short' });
    show(
      h('h2', {}, 'Códigos enviados'),
      h('div', { class: 'choices' }, list.map((o, i) => btn(`${o.label} · ${fmt.format(new Date(o.time))}`, () => sentDetail(o), '', { 'data-sent': String(i) }))),
      h('div', { class: 'actions' }, btn('Atrás', home, 'secondary')),
    );
  }

  async function sentDetail(o) {
    const offer = Trade.decode(o.code);
    const back = offer && !(await storage.tradeUsed(offer.id));
    show(
      h('h2', {}, o.label),
      h('pre', {}, o.code),
      h('div', { class: 'actions' },
        btn('Reenviar', () => showCode(o.code, o.label, false), 'primary'),
        back ? btn('Recuperarlo', () => confirmReceive(offer)) : null,
        btn('Atrás', sent, 'secondary')),
    );
  }

  menu.add('Intercambiar', home);
  return { open: home, close };
}
