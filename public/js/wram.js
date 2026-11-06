// A 32 KB WRAM image; addresses are absolute (0xC000 is index 0), 16 bit values big-endian.
// Ported from Mons.Wram. Callers read it from the core, edit it, and write it back.

export class Wram {
  constructor(bytes) {
    this.m = bytes;
  }

  u8(addr) {
    return this.m[addr - 0xc000];
  }

  w8(addr, v) {
    this.m[addr - 0xc000] = v;
  }

  u16(addr) {
    return (this.u8(addr) << 8) | this.u8(addr + 1);
  }

  w16(addr, v) {
    this.w8(addr, v >> 8);
    this.w8(addr + 1, v);
  }

  bytes(addr, n) {
    return this.m.slice(addr - 0xc000, addr - 0xc000 + n);
  }

  put(addr, data) {
    this.m.set(data, addr - 0xc000);
  }

  copy(from, to, n) {
    this.m.copyWithin(to - 0xc000, from - 0xc000, from - 0xc000 + n);
  }

  /** Copy of the 4 KB bank at 0xD000, as Party.read expects it. */
  bank1() {
    return this.bytes(0xd000, 4096);
  }
}
