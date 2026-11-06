// ROM header helpers, ported from Roms.java (header-only parts).

function header(rom, offset, length) {
  const out = new Uint8Array(length);
  if (offset + length <= rom.length) out.set(rom.subarray(offset, offset + length));
  return out;
}

const printable = (b) => b >= 32 && b < 127;
const ascii = (bytes) => String.fromCharCode(...bytes);

export function title(rom) {
  const h = header(rom, 0x134, 15);
  let n = 0;
  while (n < h.length && printable(h[n])) n++;
  return ascii(h.subarray(0, n)).trim();
}

export function gameCode(rom) {
  const h = header(rom, 0x13f, 4);
  return h.every(printable) ? ascii(h) : '';
}

export function baseName(rom) {
  let t = title(rom);
  const code = gameCode(rom);
  if (code && !t.endsWith(code)) t = `${t}_${code}`;
  const name = t.replace(/[^A-Za-z0-9_]/g, '_');
  return name || 'game';
}

const NAMES = {
  BYTE: 'Pokémon Crystal (inglés)',
  BYTS: 'Pokémon Cristal (español)',
  BYTF: 'Pokémon Crystal (francés)',
  BYTD: 'Pokémon Kristall (alemán)',
  BYTI: 'Pokémon Cristallo (italiano)',
};

export function displayName(rom) {
  if (title(rom) === 'PM_CRYSTAL' && NAMES[gameCode(rom)]) return NAMES[gameCode(rom)];
  return title(rom) || 'ROM';
}

export function supported(rom) {
  const code = gameCode(rom);
  return title(rom) === 'PM_CRYSTAL' && (code === 'BYTE' || code === 'BYTS');
}

export function spanish(rom) {
  return gameCode(rom) === 'BYTS';
}
