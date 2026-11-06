import { Wram } from '../../public/js/wram.js';

export const hex = (u8) => Buffer.from(u8).toString('hex');
export const unhex = (h) => new Uint8Array(Buffer.from(h, 'hex'));
export const bankOf = (b64) => new Uint8Array(Buffer.from(b64, 'base64'));
export const b64Of = (u8) => Buffer.from(u8).toString('base64');

/** A 32 KB WRAM image holding a 4 KB bank at 0xD000 (offset 0x1000), like the core returns. */
export function wramFromBank(bank) {
  const m = new Uint8Array(0x8000);
  m.set(bank, 0x1000);
  return new Wram(m);
}
