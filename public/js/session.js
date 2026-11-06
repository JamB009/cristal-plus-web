// Ties the core, storage and trading together; the web counterpart of Emulator.java.

import { MEM_SRAM, MEM_RTC, MEM_WRAM } from './core.js';
import { parseGameData } from './gamedata.js';
import { baseName, displayName, spanish, supported } from './roms.js';
import { readParty } from './party.js';
import { Wram } from './wram.js';
import * as Mons from './mons.js';
import * as Trade from './trade.js';
import { textRaw } from './text.js';
import { nameOf } from './names.js';

const MSG = {
  notCrystal: 'Los intercambios solo funcionan con Pokémon Crystal en inglés o español.',
  noGame: 'Carga tu partida primero (el intercambio funciona con el juego en marcha).',
  battle: 'Termina el combate antes de intercambiar.',
  gone: 'Ese Pokémon ya no está en tu equipo.',
  only: 'No puedes enviar a tu único Pokémon.',
  full: 'Tu equipo está lleno. Deja un Pokémon en el PC y vuelve a intentarlo.',
  memory: 'No se pudo leer la memoria del juego.',
  used: 'Ese código ya se usó en este teléfono.',
  badCode: 'El código de intercambio no es válido o está incompleto.',
  claimFailed: 'No se pudo registrar el intercambio. Inténtalo de nuevo; tu equipo no ha cambiado.',
};

const SRAM_SIZE_TOLERANCE = 64; // RTC footer some emulators append to .sav files
const SRAM_SAVE_FRAMES = 600; // ~10 s
const PARTY_CHECK_FRAMES = 60; // ~1 s
const AUTO_SLOT = 'slot0';

const fail = (message) => ({ ok: false, message });

function hash(bytes) {
  let h = 0x811c9dc5;
  for (const b of bytes) h = Math.imul(h ^ b, 0x01000193);
  return h >>> 0;
}

export class Session {
  static async create({ core, storage, names }) {
    return new Session(core, storage, names);
  }

  constructor(core, storage, names) {
    this.core = core;
    this.storage = storage;
    this.names = names;
    /** { baseName, displayName, spanish, supported } once a ROM is running, else null. */
    this.romInfo = null;
    /** Party snapshot refreshed about once a second; null when no game is loaded. */
    this.snapshot = null;
    this.data = null;
    this.frames = 0;
    this.lastSramHash = 0;
    this.pendingIds = new Set();
    this.tasks = new Set();
  }

  async loadRom(rom) {
    return this.#load(rom, true);
  }

  async loadLastRom() {
    const base = await this.storage.get('kv', 'lastRom');
    const rec = base && (await this.storage.get('roms', base));
    return rec ? (await this.#load(rec.bytes, false)).ok : false;
  }

  async #load(rom, persist) {
    // Switching games: save the running one first, or whatever happened since the last save is lost.
    if (this.romInfo) await this.#flushQuietly();
    // No romInfo until the saves are restored: a flush in between would overwrite them with a blank SRAM.
    this.romInfo = null;
    this.snapshot = null;
    if (!this.core.load(rom)) return { ok: false, error: 'No se pudo cargar la ROM.' };
    const base = baseName(rom);
    const info = { baseName: base, displayName: displayName(rom), spanish: spanish(rom), supported: supported(rom) };
    this.data = info.supported ? parseGameData(rom) : null;

    // The auto state goes first and the saves over it, so progress saved after it is never rolled back.
    const state = await this.storage.get('states', `${base}/${AUTO_SLOT}`);
    if (state) this.core.loadState(state);
    const sram = await this.storage.get('saves', `${base}.srm`);
    if (sram) this.core.setMemory(MEM_SRAM, sram);
    const rtc = await this.storage.get('saves', `${base}.rtc`);
    if (rtc) this.core.setMemory(MEM_RTC, rtc);
    this.lastSramHash = hash(this.core.getMemory(MEM_SRAM) ?? new Uint8Array());

    if (persist) {
      await this.storage.put('roms', base, { name: info.displayName, bytes: rom, lastUsed: Date.now() });
      await this.storage.put('kv', 'lastRom', base);
    }
    this.frames = 0;
    this.romInfo = info;
    return { ok: true };
  }

  setInput(mask) {
    this.core.setInput(mask);
  }

  /** One emulated frame plus the periodic work. Returns true if a new video frame is ready. */
  frame() {
    if (!this.romInfo) return false;
    const video = this.core.runFrame();
    this.frames++;
    if (this.frames % PARTY_CHECK_FRAMES === 0) this.refresh();
    if (this.frames % SRAM_SAVE_FRAMES === 0) this.#track(this.persistSram());
    return video;
  }

  #track(promise) {
    const p = promise.catch((e) => console.error('Crystal+: fallo al guardar', e)).finally(() => this.tasks.delete(p));
    this.tasks.add(p);
  }

  /** Resolves when background saves have finished. */
  async idle() {
    await Promise.all([...this.tasks]);
  }

  /** Re-reads the party from the game's memory into `snapshot`. */
  refresh() {
    const bank = this.romInfo?.supported ? this.core.readWram(0xd000, 4096) : null;
    this.snapshot = bank ? readParty(bank, this.romInfo.spanish) : null;
  }

  /** Writes SRAM (when it changed) and RTC to storage. */
  async persistSram() {
    const info = this.romInfo;
    if (!info) return;
    const sram = this.core.getMemory(MEM_SRAM);
    if (sram) {
      const h = hash(sram);
      if (h !== this.lastSramHash) {
        await this.storage.put('saves', `${info.baseName}.srm`, sram);
        this.lastSramHash = h;
      }
    }
    const rtc = this.core.getMemory(MEM_RTC);
    if (rtc) await this.storage.put('saves', `${info.baseName}.rtc`, rtc);
  }

  /** Saves everything: call when the page goes to the background or closes. */
  async flush() {
    const info = this.romInfo;
    if (!info) return;
    await this.persistSram();
    const state = this.core.saveState();
    if (state) await this.storage.put('states', `${info.baseName}/${AUTO_SLOT}`, state);
  }

  async #flushQuietly() {
    try {
      await this.flush();
    } catch (e) {
      console.error('Crystal+: no se pudo guardar', e);
    }
  }

  /** The newest save that importSram replaced, as { key, bytes }, or null. */
  async latestBackup() {
    const info = this.romInfo;
    if (!info) return null;
    const mine = (await this.storage.keys('saves'))
      .filter((k) => k.startsWith('backup-') && k.endsWith(`-${info.baseName}`))
      .sort((a, b) => Number(a.split('-')[1]) - Number(b.split('-')[1]));
    const key = mine.at(-1);
    return key ? { key, bytes: await this.storage.get('saves', key) } : null;
  }

  exportSram() {
    return this.core.getMemory(MEM_SRAM);
  }

  async importSram(bytes) {
    const info = this.romInfo;
    const old = this.core.getMemory(MEM_SRAM);
    if (!info || !old) return { ok: false, message: 'Carga primero un juego.' };
    const size = old.length;
    if (bytes.length < size || bytes.length > size + SRAM_SIZE_TOLERANCE) {
      return {
        ok: false,
        message: `El archivo .sav no es válido (${bytes.length} bytes; se esperaban ${size}).`,
      };
    }
    const data = bytes.slice(0, size);
    await this.storage.put('saves', `backup-${Date.now()}-${info.baseName}`, old);
    this.core.setMemory(MEM_SRAM, data);
    await this.storage.put('saves', `${info.baseName}.srm`, data);
    this.lastSramHash = hash(data);
    await this.storage.del('states', `${info.baseName}/${AUTO_SLOT}`);
    this.core.reset();
    this.snapshot = null;
    return { ok: true, message: 'Partida importada.' };
  }

  // ---- Trades (the synchronous parts mirror Emulator.send / Emulator.receive) ----

  #readParty() {
    const bank = this.core.readWram(0xd000, 4096);
    return bank ? readParty(bank, this.romInfo.spanish) : null;
  }

  #wram() {
    const m = this.core.getMemory(MEM_WRAM);
    return m && m.length >= 0x2000 ? new Wram(m) : null;
  }

  #checkReady(snap) {
    if (!this.romInfo?.supported) return MSG.notCrystal;
    if (snap === null) return MSG.noGame;
    if (snap.inBattle) return MSG.battle;
    return null;
  }

  /** Takes a Pokémon out of the party and returns its trade code. */
  async sendMon(index) {
    const result = this.#sendNow(index);
    if (result.ok) {
      try {
        await this.storage.tradeRemember(result.code, result.message);
      } catch (e) {
        console.error('Crystal+: no se pudo guardar el código enviado', e);
      }
      await this.#flushQuietly(); // iOS may kill the app any time: persist the new party now
    }
    return result;
  }

  #sendNow(index) {
    const snap = this.romInfo?.supported ? this.#readParty() : null;
    const busy = this.#checkReady(snap);
    if (busy) return fail(busy);
    if (!Number.isInteger(index) || index < 0 || index >= snap.mons.length) return fail(MSG.gone);
    if (snap.mons.length < 2) return fail(MSG.only);
    const w = this.#wram();
    if (!w) return fail(MSG.memory);
    const m = snap.mons[index];
    const packed = Mons.take(w, index);
    Mons.remove(w, index);
    this.core.setMemory(MEM_WRAM, w.m);
    const code = Trade.encode(packed, this.romInfo.spanish);
    const label = (m.egg ? 'HUEVO' : m.nick) + (m.egg ? '' : ` Nv. ${m.level}`);
    this.refresh();
    return { ok: true, message: label, code };
  }

  /** Puts a traded Pokémon in the party, evolving it if it evolves by trade. */
  async receive(offer) {
    if (!offer) return fail(MSG.badCode);
    if (this.pendingIds.has(offer.id)) return fail(MSG.used);
    this.pendingIds.add(offer.id);
    try {
      // Claim the code atomically (also across tabs) before touching the party.
      let claimed;
      try {
        claimed = await this.storage.tradeClaim(offer.id);
      } catch (e) {
        console.error('Crystal+: no se pudo registrar el código', e);
        return fail(MSG.claimFailed);
      }
      if (!claimed) return fail(MSG.used);
      let result;
      try {
        result = this.#receiveNow(offer);
      } catch (e) {
        console.error('Crystal+: fallo al recibir', e);
        result = fail(MSG.memory);
      }
      if (!result.ok) {
        await this.storage.tradeRelease(offer.id).catch((e) => console.error('Crystal+: no se pudo liberar el código', e));
        return result;
      }
      await this.#flushQuietly();
      return result;
    } finally {
      this.pendingIds.delete(offer.id);
    }
  }

  #receiveNow(offer) {
    const snap = this.romInfo?.supported ? this.#readParty() : null;
    const busy = this.#checkReady(snap);
    if (busy) return fail(busy);
    if (snap.mons.length >= 6) return fail(MSG.full);
    const w = this.#wram();
    if (!w) return fail(MSG.memory);
    const i = Mons.add(w, offer.mon);
    const name = offer.egg ? 'un HUEVO' : textRaw(offer.mon.nick, offer.fromSpanish);
    let message = `¡Has recibido a ${name}!`;
    if (this.data) {
      const from = offer.species;
      const to = Mons.tradeEvolve(w, i, this.data, this.names);
      if (to !== 0) {
        message += `\n\n¿Eh? ¡${nameOf(this.names, from)} está evolucionando! … ¡Se ha convertido en ${nameOf(this.names, to)}!`;
      }
    }
    this.core.setMemory(MEM_WRAM, w.m);
    this.refresh();
    return { ok: true, message };
  }
}

