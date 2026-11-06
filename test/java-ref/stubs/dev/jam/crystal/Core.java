package dev.jam.crystal;

/** Test double for the JNI Core: only WRAM, backed by a static buffer (bank 0xD000 sits at offset 0x1000). */
final class Core {
    static final int MEM_SRAM = 0;
    static final int MEM_RTC = 1;
    static final int MEM_WRAM = 2;

    static byte[] wram = new byte[0x8000];

    private Core() {
    }

    static byte[] getMemory(int which) {
        return which == MEM_WRAM ? wram.clone() : null;
    }

    static boolean setMemory(int which, byte[] data) {
        if (which != MEM_WRAM) {
            return false;
        }
        System.arraycopy(data, 0, wram, 0, data.length);
        return true;
    }
}
