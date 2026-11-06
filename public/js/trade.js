// Trade codes: one party Pokémon (struct, OT name, nickname) plus a random nonce and a CRC, in
// Base32 so WhatsApp formatting (_italics_, *bold*) and autocorrect can't break it.
// Byte-for-byte compatible with Trade.java.

import { MON_LENGTH, NAME_LENGTH, EGG, M_SPECIES, M_LEVEL } from './party.js';

export const PREFIX = 'PKC1-';
const CODE = /PKC1-([A-Z2-7]{40,})/i;
const B32 = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ234567';
const VERSION = 1;
const LENGTH = 3 + MON_LENGTH + 2 * NAME_LENGTH + 4;

const CRC_TABLE = new Uint32Array(256).map((_, n) => {
  let c = n;
  for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
  return c >>> 0;
});

export function crc32(bytes) {
  let c = 0xffffffff;
  for (const b of bytes) c = CRC_TABLE[(c ^ b) & 0xff] ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
}

function base32(d) {
  let out = '';
  let buf = 0;
  let bits = 0;
  for (const b of d) {
    buf = ((buf << 8) | b) & 0xffff;
    bits += 8;
    while (bits >= 5) {
      out += B32[(buf >> (bits - 5)) & 31];
      bits -= 5;
    }
  }
  if (bits > 0) out += B32[(buf << (5 - bits)) & 31];
  return out;
}

function unbase32(s) {
  const out = [];
  let buf = 0;
  let bits = 0;
  for (const ch of s) {
    const v = B32.indexOf(ch.toUpperCase());
    if (v < 0) return null;
    buf = ((buf << 5) | v) & 0xffff;
    bits += 5;
    if (bits >= 8) {
      out.push((buf >> (bits - 8)) & 0xff);
      bits -= 8;
    }
  }
  return Uint8Array.from(out);
}

/** `p` is { listed, struct, ot, nick } (see mons.take). The nonce is injectable for tests. */
export function encode(p, spanish, nonce = globalThis.crypto.getRandomValues(new Uint8Array(4))) {
  const d = new Uint8Array(LENGTH + 4);
  d[0] = VERSION;
  d[1] = spanish ? 1 : 0;
  d[2] = p.listed;
  let o = 3;
  d.set(p.struct, o);
  o += MON_LENGTH;
  d.set(p.ot, o);
  o += NAME_LENGTH;
  d.set(p.nick, o);
  o += NAME_LENGTH;
  d.set(nonce, o);
  o += 4;
  const c = crc32(d.subarray(0, o));
  for (let i = 0; i < 4; i++) d[o + i] = (c >>> (24 - 8 * i)) & 0xff;
  return PREFIX + base32(d);
}

/** Finds a code anywhere in the text (a forwarded WhatsApp message, the clipboard...). */
export function find(text) {
  if (typeof text !== 'string') return null;
  const m = CODE.exec(text);
  return m ? PREFIX + m[1].toUpperCase() : null;
}

/** Returns { mon, fromSpanish, id, species, level, egg } or null if the code is invalid. */
export function decode(code) {
  const found = find(code);
  if (found === null) return null;
  const d = unbase32(found.slice(PREFIX.length));
  if (d === null || d.length < LENGTH + 4 || d[0] !== VERSION) return null;
  const c = crc32(d.subarray(0, LENGTH));
  for (let i = 0; i < 4; i++) {
    if (d[LENGTH + i] !== ((c >>> (24 - 8 * i)) & 0xff)) return null;
  }
  const listed = d[2];
  let o = 3;
  const struct = d.slice(o, o + MON_LENGTH);
  o += MON_LENGTH;
  const ot = d.slice(o, o + NAME_LENGTH);
  o += NAME_LENGTH;
  const nick = d.slice(o, o + NAME_LENGTH);
  const species = struct[M_SPECIES];
  const level = struct[M_LEVEL];
  const listedOk = listed === EGG || listed === species;
  if (species < 1 || species > 251 || level < 1 || level > 100 || !listedOk) return null;
  return {
    mon: { listed, struct, ot, nick },
    fromSpanish: d[1] === 1,
    id: c.toString(16).padStart(8, '0'),
    species,
    level,
    egg: listed === EGG,
  };
}
