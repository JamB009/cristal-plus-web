import { readFileSync, existsSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));
const dir = process.env.CRYSTAL_ROMS || join(here, '..', 'roms');

export function romPath(code) {
  return join(dir, `PM_CRYSTAL_${code}.gbc`);
}

export function loadRom(code) {
  const p = romPath(code);
  if (!existsSync(p)) {
    throw new Error(`Falta la ROM ${code}: ${p} (copia las ROMs con adb pull o define CRYSTAL_ROMS)`);
  }
  return new Uint8Array(readFileSync(p));
}
