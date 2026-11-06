package dev.jam.crystal;

import java.io.File;
import java.nio.charset.StandardCharsets;
import java.nio.file.Files;
import java.nio.file.Path;
import java.security.MessageDigest;
import java.util.ArrayList;
import java.util.Arrays;
import java.util.Base64;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.Random;
import java.util.zip.CRC32;

/**
 * Runs the original Java code to produce the reference fixtures the JS port is tested against.
 * Lives in package dev.jam.crystal to reach the package-private classes.
 */
public final class RefGen {
    static String[] names;

    private RefGen() {
    }

    // ---- minimal JSON writer (no org.json at runtime) ----

    static void ser(StringBuilder sb, Object o) {
        if (o == null) {
            sb.append("null");
        } else if (o instanceof String) {
            sb.append('"');
            String s = (String) o;
            for (int i = 0; i < s.length(); i++) {
                char c = s.charAt(i);
                if (c == '"' || c == '\\') {
                    sb.append('\\').append(c);
                } else if (c < 0x20) {
                    sb.append(String.format("\\u%04x", (int) c));
                } else {
                    sb.append(c);
                }
            }
            sb.append('"');
        } else if (o instanceof Number || o instanceof Boolean) {
            sb.append(o);
        } else if (o instanceof int[]) {
            sb.append('[');
            int[] a = (int[]) o;
            for (int i = 0; i < a.length; i++) {
                if (i > 0) {
                    sb.append(',');
                }
                sb.append(a[i]);
            }
            sb.append(']');
        } else if (o instanceof Object[]) {
            sb.append('[');
            Object[] a = (Object[]) o;
            for (int i = 0; i < a.length; i++) {
                if (i > 0) {
                    sb.append(',');
                }
                ser(sb, a[i]);
            }
            sb.append(']');
        } else if (o instanceof List) {
            sb.append('[');
            boolean first = true;
            for (Object e : (List<?>) o) {
                if (!first) {
                    sb.append(',');
                }
                first = false;
                ser(sb, e);
            }
            sb.append(']');
        } else if (o instanceof Map) {
            sb.append('{');
            boolean first = true;
            for (Map.Entry<?, ?> e : ((Map<?, ?>) o).entrySet()) {
                if (!first) {
                    sb.append(',');
                }
                first = false;
                ser(sb, e.getKey().toString());
                sb.append(':');
                ser(sb, e.getValue());
            }
            sb.append('}');
        } else {
            throw new IllegalArgumentException(o.getClass().toString());
        }
    }

    static String json(Object o) {
        StringBuilder sb = new StringBuilder();
        ser(sb, o);
        return sb.toString();
    }

    static Map<String, Object> map(Object... kv) {
        Map<String, Object> m = new LinkedHashMap<>();
        for (int i = 0; i < kv.length; i += 2) {
            m.put((String) kv[i], kv[i + 1]);
        }
        return m;
    }

    static String sha256(String s) throws Exception {
        byte[] h = MessageDigest.getInstance("SHA-256").digest(s.getBytes(StandardCharsets.UTF_8));
        return hex(h);
    }

    static String hex(byte[] b) {
        StringBuilder sb = new StringBuilder();
        for (byte x : b) {
            sb.append(String.format("%02x", x & 0xFF));
        }
        return sb.toString();
    }

    static String b64(byte[] b) {
        return Base64.getEncoder().encodeToString(b);
    }

    // ---- gamedata ----

    static Map<String, Object> gamedataFor(File rom) throws Exception {
        GameData g = GameData.get(rom);
        if (g == null) {
            throw new IllegalStateException("GameData.get returned null for " + rom);
        }
        Map<String, Object> sha = map(
                "baseStats", sha256(json(g.baseStats)),
                "growth", sha256(json(g.growth)),
                "evos", sha256(json(g.evos)),
                "learnset", sha256(json(g.learnset)),
                "movePp", sha256(json(g.movePp)),
                "moveNames", sha256(json(g.moveNames)));
        Map<String, Object> spot = new LinkedHashMap<>();
        for (int sp : new int[]{1, 25, 151, 251}) {
            spot.put(String.valueOf(sp), map(
                    "baseStats", g.baseStats[sp], "growth", g.growth[sp],
                    "evos", g.evos[sp], "learnset", g.learnset[sp]));
        }
        Map<String, Object> sample = new LinkedHashMap<>();
        for (int m : new int[]{1, 33, 251}) {
            sample.put(String.valueOf(m), g.moveNames[m]);
        }
        // One species per growth rate, plus a few well-known ones, at several levels.
        List<Integer> species = new ArrayList<>(List.of(1, 25, 151, 251));
        boolean[] seen = new boolean[8];
        for (int sp = 1; sp <= 251; sp++) {
            if (!seen[g.growth[sp]]) {
                seen[g.growth[sp]] = true;
                species.add(sp);
            }
        }
        List<Object> exp = new ArrayList<>();
        for (int sp : species) {
            for (int lv : new int[]{1, 2, 5, 50, 100}) {
                exp.add(new int[]{sp, lv, g.expAt(sp, lv)});
            }
        }
        return map("sha256", sha, "spot", spot, "moveNamesSample", sample, "expAt", exp);
    }

    // ---- WRAM scenarios ----

    static final class Bank {
        final byte[] b = new byte[Party.SIZE];

        void w8(int addr, int v) {
            b[addr - Party.BASE] = (byte) v;
        }

        void w16(int addr, int v) {
            w8(addr, v >> 8);
            w8(addr + 1, v);
        }

        void put(int addr, byte[] d) {
            System.arraycopy(d, 0, b, addr - Party.BASE, d.length);
        }
    }

    static final class MonSpec {
        int species;
        boolean egg;
        int item;
        boolean custom;
    }

    static byte[] name(String s) {
        return Party.encode(s);
    }

    static byte[] buildStruct(Random r, MonSpec s, int level) {
        byte[] m = new byte[Party.MON_LENGTH];
        r.nextBytes(m);
        m[Party.M_SPECIES] = (byte) s.species;
        m[Party.M_ITEM] = (byte) s.item;
        m[Party.M_LEVEL] = (byte) level;
        int maxHp = 20 + r.nextInt(280);
        int hp = s.egg ? r.nextInt(5) : r.nextInt(maxHp + 1);
        m[Party.M_MAX_HP] = (byte) (maxHp >> 8);
        m[Party.M_MAX_HP + 1] = (byte) maxHp;
        m[Party.M_HP] = (byte) (hp >> 8);
        m[Party.M_HP + 1] = (byte) hp;
        if (s.egg) {
            m[Party.M_HAPPINESS] = (byte) (1 + r.nextInt(40));
        }
        return m;
    }

    static Bank build(long seed, boolean spanish, boolean battle, List<MonSpec> mons, boolean random) {
        Random r = new Random(seed);
        Bank bank = new Bank();
        if (random) {
            r.nextBytes(bank.b);
        }
        bank.put(Party.PLAYER_NAME, Party.encode("JAM"));
        bank.w8(Party.BATTLE_MODE, battle ? 1 : 0);
        bank.w8(Party.PARTY_COUNT, mons.size());
        for (int i = 0; i < mons.size(); i++) {
            MonSpec s = mons.get(i);
            bank.w8(Party.PARTY_SPECIES + i, s.egg ? Party.EGG : s.species);
            bank.put(Party.PARTY_MON1 + i * Party.MON_LENGTH, buildStruct(r, s, 2 + r.nextInt(99)));
            bank.put(Party.PARTY_OT + i * Party.NAME_LENGTH, Party.encode("JAM"));
            bank.put(Party.NICKNAMES + i * Party.NAME_LENGTH,
                    Party.encode(s.custom ? "JAMMER" : names[s.species]));
        }
        bank.w8(Party.PARTY_SPECIES + mons.size(), 0xFF);
        return bank;
    }

    static MonSpec spec(int species, boolean egg, int item, boolean custom) {
        MonSpec s = new MonSpec();
        s.species = species;
        s.egg = egg;
        s.item = item;
        s.custom = custom;
        return s;
    }

    static Map<String, Object> snapshot(Party.Snapshot s) {
        if (s == null) {
            return null;
        }
        List<Object> mons = new ArrayList<>();
        for (Party.Mon m : s.mons) {
            mons.add(map("species", m.species, "egg", m.egg, "shiny", m.shiny, "nick", m.nick,
                    "level", m.level, "hp", m.hp, "maxHp", m.maxHp, "key", m.key, "eggCycles", m.eggCycles));
        }
        return map("player", s.player, "mons", mons, "johtoBadges", s.johtoBadges, "kantoBadges", s.kantoBadges,
                "hallOfFame", s.hallOfFame, "money", s.money, "dexCaught", s.dexCaught, "dexSeen", s.dexSeen,
                "caught", hex(s.caught), "inBattle", s.inBattle);
    }

    static Map<String, Object> packedJson(Mons.Packed p) {
        return map("listed", p.listed, "struct", hex(p.struct), "ot", hex(p.ot), "nick", hex(p.nick));
    }

    static byte[] unhex(String h) {
        byte[] out = new byte[h.length() / 2];
        for (int i = 0; i < out.length; i++) {
            out[i] = (byte) Integer.parseInt(h.substring(2 * i, 2 * i + 2), 16);
        }
        return out;
    }

    static void load(byte[] bank) {
        Core.wram = new byte[0x8000];
        System.arraycopy(bank, 0, Core.wram, 0x1000, Party.SIZE);
    }

    static byte[] bankNow() {
        return Arrays.copyOfRange(Core.wram, 0x1000, 0x1000 + Party.SIZE);
    }

    static Map<String, Object> scenario(String name, boolean spanish, Bank bank, GameData g, boolean full, Random r) {
        List<Object> ops = new ArrayList<>();
        byte[] in = bank.b.clone();
        load(in);
        Party.Snapshot snap = Party.read(in, spanish);
        ops.add(map("op", "readParty", "result", snapshot(snap)));
        if (full && snap != null) {
            int n = snap.mons.size();
            for (int i = 0; i < n; i++) {
                load(in);
                Mons.Wram w = Mons.Wram.read();
                int a = Mons.monAddr(i);
                ops.add(map("op", "stats", "args", List.of(i), "result", Mons.stats(w, a, g)));

                load(in);
                ops.add(map("op", "take", "args", List.of(i), "result", packedJson(Mons.take(Mons.Wram.read(), i))));

                load(in);
                w = Mons.Wram.read();
                Mons.remove(w, i);
                w.commit();
                ops.add(map("op", "remove", "args", List.of(i), "bankAfter", b64(bankNow())));

                load(in);
                w = Mons.Wram.read();
                int to = Mons.tradeEvolve(w, i, g, names);
                w.commit();
                ops.add(map("op", "tradeEvolve", "args", List.of(i), "result", to, "bankAfter", b64(bankNow())));
            }
            if (n < 6) {
                MonSpec extra = spec(1 + r.nextInt(251), r.nextInt(5) == 0, 0, r.nextBoolean());
                Mons.Packed p = new Mons.Packed();
                p.listed = extra.egg ? Party.EGG : extra.species;
                p.struct = buildStruct(r, extra, 5 + r.nextInt(50));
                p.ot = Party.encode("JAM");
                p.nick = Party.encode(extra.custom ? "JAMMER" : names[extra.species]);
                load(in);
                Mons.Wram w = Mons.Wram.read();
                int idx = Mons.add(w, p);
                w.commit();
                ops.add(map("op", "add", "args", List.of(packedJson(p)), "result", idx, "bankAfter", b64(bankNow())));
            }
            int dex = 1 + r.nextInt(251);
            load(in);
            Mons.Wram w = Mons.Wram.read();
            Mons.markDex(w, dex);
            w.commit();
            ops.add(map("op", "markDex", "args", List.of(dex), "bankAfter", b64(bankNow())));
        }
        return map("name", name, "spanish", spanish, "bank", b64(in), "ops", ops);
    }

    static List<Object> scenarios(GameData gE, GameData gS) {
        List<Object> out = new ArrayList<>();
        Random r = new Random(1234);

        // Species that evolve by trade, with the item they need (0xFF = none).
        List<int[]> trade = new ArrayList<>();
        for (int sp = 1; sp <= 251; sp++) {
            for (int[] e : gS.evos[sp]) {
                if (e[0] == GameData.EVOLVE_TRADE) {
                    trade.add(new int[]{sp, e[1], e[2]});
                }
            }
        }
        int[] onix = null;
        for (int[] t : trade) {
            if (t[0] == 95) {
                onix = t;
            }
        }
        if (onix == null || onix[1] == GameData.NO_ITEM) {
            throw new IllegalStateException("Onix should evolve by trade holding an item");
        }

        out.add(scenario("party3", true, build(1, true, false,
                List.of(spec(25, false, 0, false), spec(133, false, 0, true), spec(6, false, 0, false)), true), gS, true, r));
        out.add(scenario("party6", true, build(2, true, false,
                List.of(spec(1, false, 0, false), spec(4, false, 0, false), spec(7, false, 0, false),
                        spec(25, false, 0, false), spec(39, true, 0, false), spec(150, false, 0, true)), true), gS, true, r));
        out.add(scenario("party1", true, build(3, true, false, List.of(spec(152, false, 0, false)), true), gS, true, r));
        out.add(scenario("battle", true, build(4, true, true,
                List.of(spec(25, false, 0, false), spec(133, false, 0, false), spec(6, false, 0, false)), true), gS, true, r));
        out.add(scenario("onix-metal-coat", true, build(5, true, false,
                List.of(spec(25, false, 0, false), spec(95, false, onix[1], false)), true), gS, true, r));
        out.add(scenario("onix-metal-coat-english", false, build(6, false, false,
                List.of(spec(25, false, 0, false), spec(95, false, onix[1], false)), true), gE, true, r));
        out.add(scenario("onix-wrong-item", true, build(7, true, false,
                List.of(spec(95, false, 0, false), spec(25, false, 0, false)), true), gS, true, r));
        out.add(scenario("empty", true, new Bank(), gS, false, r));

        // Invalid WRAM images: readParty must return null.
        Bank b = build(10, true, false, List.of(spec(25, false, 0, false)), true);
        b.w8(Party.PARTY_COUNT, 7);
        out.add(scenario("invalid-count7", true, b, gS, false, r));
        b = build(11, true, false, List.of(spec(25, false, 0, false), spec(6, false, 0, false)), true);
        b.w8(Party.PARTY_SPECIES + 2, 0x33);
        out.add(scenario("invalid-no-terminator", true, b, gS, false, r));
        b = build(12, true, false, List.of(spec(25, false, 0, false)), true);
        b.w16(Party.PARTY_MON1 + Party.M_HP, 500);
        b.w16(Party.PARTY_MON1 + Party.M_MAX_HP, 100);
        out.add(scenario("invalid-hp", true, b, gS, false, r));
        b = build(13, true, false, List.of(spec(25, false, 0, false)), true);
        b.w8(Party.PARTY_MON1 + Party.M_SPECIES, 0);
        out.add(scenario("invalid-species0", true, b, gS, false, r));
        b = build(14, true, false, List.of(spec(25, false, 0, false)), true);
        b.w8(Party.PLAYER_NAME, 0x50);
        out.add(scenario("invalid-name", true, b, gS, false, r));

        // Random but valid parties, both languages, with trade-evolution candidates mixed in.
        for (int k = 0; k < 14; k++) {
            boolean spanish = k % 2 == 0;
            int count = 1 + r.nextInt(6);
            List<MonSpec> mons = new ArrayList<>();
            for (int i = 0; i < count; i++) {
                int[] t = trade.get(r.nextInt(trade.size()));
                int roll = r.nextInt(10);
                MonSpec s;
                if (roll < 4) {
                    int item = t[1] == GameData.NO_ITEM ? 0 : (r.nextInt(5) == 0 ? 0 : t[1]);
                    s = spec(t[0], false, item, r.nextBoolean());
                } else {
                    s = spec(1 + r.nextInt(251), roll == 9, r.nextInt(3) == 0 ? 1 + r.nextInt(250) : 0, r.nextBoolean());
                }
                mons.add(s);
            }
            Bank bank = build(100 + k, spanish, r.nextInt(4) == 0, mons, true);
            out.add(scenario("random-" + k, spanish, bank, spanish ? gS : gE, true, r));
        }
        return out;
    }

    // ---- trade codes ----

    static final String B32 = "ABCDEFGHIJKLMNOPQRSTUVWXYZ234567";
    static final int TLEN = 3 + Party.MON_LENGTH + 2 * Party.NAME_LENGTH + 4;

    static String base32(byte[] d) {
        StringBuilder sb = new StringBuilder();
        int buf = 0;
        int bits = 0;
        for (byte b : d) {
            buf = (buf << 8) | (b & 0xFF);
            bits += 8;
            while (bits >= 5) {
                sb.append(B32.charAt((buf >> (bits - 5)) & 31));
                bits -= 5;
            }
        }
        if (bits > 0) {
            sb.append(B32.charAt((buf << (5 - bits)) & 31));
        }
        return sb.toString();
    }

    static byte[] unbase32(String s) {
        java.io.ByteArrayOutputStream out = new java.io.ByteArrayOutputStream();
        int buf = 0;
        int bits = 0;
        for (char c : s.toCharArray()) {
            int v = B32.indexOf(c);
            buf = (buf << 5) | v;
            bits += 5;
            if (bits >= 8) {
                out.write((buf >> (bits - 8)) & 0xFF);
                bits -= 8;
            }
        }
        return out.toByteArray();
    }

    static String withCrc(byte[] d) {
        CRC32 crc = new CRC32();
        crc.update(d, 0, TLEN);
        long c = crc.getValue();
        for (int i = 0; i < 4; i++) {
            d[TLEN + i] = (byte) (c >> (24 - 8 * i));
        }
        return Trade.PREFIX + base32(d);
    }

    static Map<String, Object> decodedJson(String code) {
        Trade.Offer o = Trade.decode(code);
        if (o == null) {
            return null;
        }
        Map<String, Object> m = packedJson(o.mon);
        m.put("fromSpanish", o.fromSpanish);
        m.put("id", o.id);
        m.put("species", o.species());
        m.put("level", o.level());
        m.put("egg", o.egg());
        return m;
    }

    static List<Object> tradeVectors(List<Object> scenarios) {
        List<Object> out = new ArrayList<>();
        String firstValid = null;
        for (Object o : scenarios) {
            Map<?, ?> sc = (Map<?, ?>) o;
            String sname = (String) sc.get("name");
            if (!sname.startsWith("party") && !sname.startsWith("random") && !sname.startsWith("onix")) {
                continue;
            }
            boolean spanish = (Boolean) sc.get("spanish");
            byte[] bank = Base64.getDecoder().decode((String) sc.get("bank"));
            load(bank);
            Mons.Wram w = Mons.Wram.read();
            int n = Mons.count(w);
            for (int i = 0; i < n && i < 2; i++) {
                Mons.Packed p = Mons.take(w, i);
                String code = Trade.encode(p, spanish);
                byte[] raw = unbase32(code.substring(Trade.PREFIX.length()));
                byte[] nonce = Arrays.copyOfRange(raw, TLEN - 4, TLEN);
                out.add(map("name", sname + "#" + i, "spanish", spanish, "listed", p.listed,
                        "struct", hex(p.struct), "ot", hex(p.ot), "nick", hex(p.nick),
                        "nonce", hex(nonce), "code", code, "decoded", decodedJson(code)));
                if (firstValid == null) {
                    firstValid = code;
                }
            }
        }
        // Invalid variants of a valid code.
        byte[] d = unbase32(firstValid.substring(Trade.PREFIX.length()));
        byte[] x = d.clone();
        x[x.length - 1] ^= 0x55;
        out.add(map("name", "invalid-crc", "code", Trade.PREFIX + base32(x), "decoded", null));
        x = d.clone();
        x[0] = 2;
        out.add(map("name", "invalid-version2", "code", withCrc(x), "decoded", null));
        x = d.clone();
        x[3 + Party.M_SPECIES] = 0;
        out.add(map("name", "invalid-species0", "code", withCrc(x), "decoded", null));
        x = d.clone();
        x[3 + Party.M_SPECIES] = (byte) 252;
        x[2] = (byte) 252;
        out.add(map("name", "invalid-species252", "code", withCrc(x), "decoded", null));
        x = d.clone();
        x[3 + Party.M_LEVEL] = 101;
        out.add(map("name", "invalid-level101", "code", withCrc(x), "decoded", null));
        x = d.clone();
        x[3 + Party.M_LEVEL] = 0;
        out.add(map("name", "invalid-level0", "code", withCrc(x), "decoded", null));
        x = d.clone();
        x[2] = (byte) (x[2] + 1);
        out.add(map("name", "invalid-listed-mismatch", "code", withCrc(x), "decoded", null));
        out.add(map("name", "invalid-truncated", "code", firstValid.substring(0, 100), "decoded", null));
        char[] chars = firstValid.toCharArray();
        chars[30] = '1';
        out.add(map("name", "invalid-bad-char", "code", new String(chars), "decoded", null));
        return out;
    }

    public static void main(String[] args) throws Exception {
        Path outDir = Path.of(args[0]);
        List<String> lines = Files.readAllLines(Path.of(args[1]), StandardCharsets.UTF_8);
        names = lines.toArray(new String[0]);
        File romE = new File(args[2]);
        File romS = new File(args[3]);

        GameData gE = GameData.get(romE);
        Map<String, Object> dataE = gamedataFor(romE);
        GameData gS = GameData.get(romS);
        Map<String, Object> dataS = gamedataFor(romS);
        Files.writeString(outDir.resolve("gamedata.json"), json(map("BYTE", dataE, "BYTS", dataS)));

        List<Object> sc = scenarios(gE, gS);
        Files.writeString(outDir.resolve("mons.json"), json(sc));
        Files.writeString(outDir.resolve("trade.json"), json(tradeVectors(sc)));
        System.out.println("scenarios: " + sc.size());
    }
}
