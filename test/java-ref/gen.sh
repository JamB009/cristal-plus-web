#!/usr/bin/env bash
# Generates web/test/fixtures/{gamedata,mons,trade}.json by running the ORIGINAL Java sources
# (app/src/dev/jam/crystal/{GameData,Party,Mons,Trade,Io,CrystalApp}.java, unmodified) against the
# local ROMs. Needs javac, java, jq and the Android SDK's android.jar (only for compiling/loading stubs).
set -euo pipefail
HERE=$(cd "$(dirname "$0")" && pwd)
ROOT=$(cd "$HERE/../../.." && pwd)
SDK=${ANDROID_HOME:-$HOME/Android/Sdk}
JAR=$SDK/platforms/android-36/android.jar
ROMS=${CRYSTAL_ROMS:-$ROOT/web/test/roms}
SRC=$ROOT/app/src/dev/jam/crystal

for tool in javac java jq; do
    command -v "$tool" >/dev/null || { echo "falta $tool" >&2; exit 1; }
done
[[ -f $JAR ]] || { echo "falta $JAR (Android SDK platform 36)" >&2; exit 1; }
for code in BYTE BYTS; do
    [[ -f $ROMS/PM_CRYSTAL_$code.gbc ]] || { echo "falta la ROM $ROMS/PM_CRYSTAL_$code.gbc" >&2; exit 1; }
done

OUT=$(mktemp -d)
trap 'rm -rf "$OUT"' EXIT
javac -nowarn -encoding UTF-8 -cp "$JAR" -d "$OUT" \
    "$SRC"/GameData.java "$SRC"/Party.java "$SRC"/Mons.java "$SRC"/Trade.java "$SRC"/Io.java "$SRC"/CrystalApp.java \
    "$HERE"/stubs/dev/jam/crystal/Core.java "$HERE"/RefGen.java
jq -r '.names[]' "$ROOT/app/assets/pokemon.json" > "$OUT/names.txt"
mkdir -p "$ROOT/web/test/fixtures"
java -cp "$OUT:$JAR" dev.jam.crystal.RefGen "$ROOT/web/test/fixtures" "$OUT/names.txt" \
    "$ROMS/PM_CRYSTAL_BYTE.gbc" "$ROMS/PM_CRYSTAL_BYTS.gbc"
