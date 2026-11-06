// Edits the party directly in WRAM, ported from Mons.java. Must run between frames and only
// outside battle (the battle engine keeps its own copy of the active Pokémon).
// Walking features (levelUp, verify) are not ported: steps are out of scope for the web app.

import * as P from './party.js';
import { EVOLVE_TRADE, NO_ITEM } from './gamedata.js';
import { encodeName } from './text.js';

export const monAddr = (index) => P.PARTY_MON1 + index * P.MON_LENGTH;

export const count = (w) => w.u8(P.PARTY_COUNT);

/** Gen 2 stat formula; HP adds level + 10 instead of 5. */
function stat(base, dv, statExp, level, hp) {
  const bonus = Math.floor(Math.min(255, Math.ceil(Math.sqrt(statExp))) / 4);
  const v = Math.floor((((base + dv) * 2 + bonus) * level) / 100);
  return v + (hp ? level + 10 : 5);
}

/** The six stats (HP, Atk, Def, Spd, SpAtk, SpDef) the game would compute for this struct. */
export function stats(w, a, g) {
  const species = w.u8(a + P.M_SPECIES);
  const level = w.u8(a + P.M_LEVEL);
  const base = g.baseStats[species];
  const dv1 = w.u8(a + P.M_DVS);
  const dv2 = w.u8(a + P.M_DVS + 1);
  const atk = dv1 >> 4;
  const def = dv1 & 0xf;
  const spd = dv2 >> 4;
  const spc = dv2 & 0xf;
  const hpDv = ((atk & 1) << 3) | ((def & 1) << 2) | ((spd & 1) << 1) | (spc & 1);
  const dvs = [hpDv, atk, def, spd, spc, spc];
  const exp = [0, 1, 2, 3, 4].map((i) => w.u16(a + P.M_STAT_EXP + 2 * i));
  exp.push(exp[4]);
  return dvs.map((dv, i) => stat(base[i], dv, exp[i], level, i === 0));
}

/** Recomputes the six stats for the current species and level, keeping the same HP lost. */
export function recalc(w, a, g) {
  const oldMax = w.u16(a + P.M_MAX_HP);
  const oldHp = w.u16(a + P.M_HP);
  const st = stats(w, a, g);
  for (let i = 0; i < 6; i++) w.w16(a + P.M_MAX_HP + 2 * i, st[i]);
  const newMax = st[0];
  w.w16(a + P.M_HP, oldHp === 0 ? 0 : Math.max(1, Math.min(newMax, oldHp + newMax - oldMax)));
}

const sameBytes = (x, y) => x.length === y.length && x.every((b, i) => b === y[i]);

/** Applies a trade evolution if the species has one (with or without held item). Returns the new species or 0. */
export function tradeEvolve(w, index, g, names) {
  const a = monAddr(index);
  if (w.u8(P.PARTY_SPECIES + index) === P.EGG) return 0;
  const species = w.u8(a + P.M_SPECIES);
  const item = w.u8(a + P.M_ITEM);
  for (const e of g.evos[species]) {
    if (e[0] !== EVOLVE_TRADE || (e[1] !== NO_ITEM && e[1] !== item)) continue;
    const target = e[2];
    if (e[1] !== NO_ITEM) w.w8(a + P.M_ITEM, 0);
    const nickAddr = P.NICKNAMES + index * P.NAME_LENGTH;
    const defaultName = names != null && species < names.length
      && sameBytes(w.bytes(nickAddr, P.NAME_LENGTH), encodeName(names[species]));
    w.w8(a + P.M_SPECIES, target);
    w.w8(P.PARTY_SPECIES + index, target);
    if (defaultName && target < names.length) w.put(nickAddr, encodeName(names[target]));
    recalc(w, a, g);
    markDex(w, target);
    return target;
  }
  return 0;
}

export function markDex(w, species) {
  const i = species - 1;
  w.w8(P.DEX_CAUGHT + (i >> 3), w.u8(P.DEX_CAUGHT + (i >> 3)) | (1 << (i & 7)));
  w.w8(P.DEX_SEEN + (i >> 3), w.u8(P.DEX_SEEN + (i >> 3)) | (1 << (i & 7)));
}

/** Raw data of one party member, as carried in a trade code: { listed, struct, ot, nick }. */
export function take(w, index) {
  return {
    listed: w.u8(P.PARTY_SPECIES + index),
    struct: w.bytes(monAddr(index), P.MON_LENGTH),
    ot: w.bytes(P.PARTY_OT + index * P.NAME_LENGTH, P.NAME_LENGTH),
    nick: w.bytes(P.NICKNAMES + index * P.NAME_LENGTH, P.NAME_LENGTH),
  };
}

export function remove(w, index) {
  const n = count(w);
  for (let i = index; i < n - 1; i++) {
    w.w8(P.PARTY_SPECIES + i, w.u8(P.PARTY_SPECIES + i + 1));
    w.copy(monAddr(i + 1), monAddr(i), P.MON_LENGTH);
    w.copy(P.PARTY_OT + (i + 1) * P.NAME_LENGTH, P.PARTY_OT + i * P.NAME_LENGTH, P.NAME_LENGTH);
    w.copy(P.NICKNAMES + (i + 1) * P.NAME_LENGTH, P.NICKNAMES + i * P.NAME_LENGTH, P.NAME_LENGTH);
  }
  w.w8(P.PARTY_COUNT, n - 1);
  w.w8(P.PARTY_SPECIES + n - 1, 0xff);
}

/** Appends to the party; the caller checks there is room. Returns the new index. */
export function add(w, p) {
  const i = count(w);
  w.w8(P.PARTY_SPECIES + i, p.listed);
  w.w8(P.PARTY_SPECIES + i + 1, 0xff);
  w.put(monAddr(i), p.struct);
  w.put(P.PARTY_OT + i * P.NAME_LENGTH, p.ot);
  w.put(P.NICKNAMES + i * P.NAME_LENGTH, p.nick);
  w.w8(P.PARTY_COUNT, i + 1);
  if (p.listed !== P.EGG) markDex(w, p.struct[P.M_SPECIES]);
  return i;
}
