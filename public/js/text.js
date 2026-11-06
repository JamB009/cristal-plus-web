// Game Boy Pokémon charset helpers, ported from Party.java (text, encode, decodeChar).

export const NAME_LENGTH = 11;

const SPANISH = {
  0xcf: 'á', 0xd1: 'í', 0xd2: 'ñ', 0xd4: 'ó', 0xd5: 'ú', 0xe4: '¿', 0xe5: '¡',
  0xbf: 'Á', 0xc2: 'Ü', 0xc7: 'É', 0xc9: 'Í', 0xca: 'Ñ', 0xcc: 'Ó', 0xce: 'Ú',
};

const SYMBOLS = {
  0x7f: ' ', 0x9a: '(', 0x9b: ')', 0x9c: ':', 0x9d: ';', 0x9e: '[', 0x9f: ']',
  0xe0: "'", 0xe1: 'PK', 0xe2: 'MN', 0xe3: '-', 0xe6: '?', 0xe7: '!', 0xe8: '.',
  0xe9: '&', 0xea: 'é', 0xef: '♂', 0xf1: '×', 0xf3: '/', 0xf4: ',', 0xf5: '♀',
};

function charOf(c) {
  if (c >= 0x80 && c <= 0x99) return String.fromCharCode(65 + c - 0x80);
  if (c >= 0xa0 && c <= 0xb9) return String.fromCharCode(97 + c - 0xa0);
  if (c >= 0xf6) return String.fromCharCode(48 + c - 0xf6);
  return SYMBOLS[c] ?? null;
}

/** Decodes one character of the game's charset; null if it isn't printable text. */
export function decodeChar(c, spanish) {
  const es = spanish ? SPANISH[c] : undefined;
  return es ?? charOf(c);
}

/** Reads a 0x50-terminated string of at most max+1 bytes starting at w[offset]; null if invalid. */
export function textAt(w, offset, max, spanish) {
  let s = '';
  for (let i = 0; i <= max; i++) {
    const c = w[offset + i];
    if (c === undefined) return null;
    if (c === 0x50) return s.length > 0 ? s : null;
    if (c < 0x7f) return null;
    s += decodeChar(c, spanish) ?? '?';
  }
  return null;
}

/** Decodes a raw name (as stored in a trade code); "?" if it doesn't decode. */
export function textRaw(raw, spanish) {
  const buf = new Uint8Array(NAME_LENGTH);
  buf.set(raw.subarray(0, NAME_LENGTH));
  return textAt(buf, 0, NAME_LENGTH - 1, spanish) ?? '?';
}

/** Encodes an uppercase species name in the game's charset, padded with terminators. */
export function encodeName(name) {
  const out = new Uint8Array(NAME_LENGTH).fill(0x50);
  let n = 0;
  for (let i = 0; i < name.length && n < NAME_LENGTH - 1; i++) {
    const c = name[i];
    let b;
    if (c >= 'A' && c <= 'Z') b = 0x80 + c.charCodeAt(0) - 65;
    else if (c >= '0' && c <= '9') b = 0xf6 + c.charCodeAt(0) - 48;
    else if (c === '♀') b = 0xf5;
    else if (c === '♂') b = 0xef;
    else if (c === '.') b = 0xe8;
    else if (c === '-') b = 0xe3;
    else if (c === "'") b = 0xe0;
    else b = 0x7f;
    out[n++] = b;
  }
  return out;
}
