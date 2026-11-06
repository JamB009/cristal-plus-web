#!/usr/bin/env bash
# Builds web/public/wasm/gambatte.{js,wasm} from libgambatte (GPL v2) pinned in GAMBATTE_COMMIT.
# Needs emscripten: either `emcc` on PATH, or EMSDK_ENV pointing at an emsdk_env.sh.
set -euo pipefail
HERE=$(cd "$(dirname "$0")" && pwd)
OUT=$HERE/../public/wasm
VENDOR=$HERE/vendor/gambatte
COMMIT=$(cat "$HERE/GAMBATTE_COMMIT")

if [[ -n ${EMSDK_ENV:-} ]]; then
    # shellcheck disable=SC1090
    source "$EMSDK_ENV" >/dev/null
fi
command -v emcc >/dev/null || { echo "falta emcc (instala emscripten o define EMSDK_ENV=/ruta/emsdk_env.sh)" >&2; exit 1; }

if [[ ! -d $VENDOR/.git ]]; then
    mkdir -p "$VENDOR"
    git -C "$VENDOR" init -q
    git -C "$VENDOR" remote add origin https://github.com/libretro/gambatte-libretro.git
fi
if [[ $(git -C "$VENDOR" rev-parse HEAD 2>/dev/null || true) != "$COMMIT" ]]; then
    git -C "$VENDOR" fetch -q --depth 1 origin "$COMMIT"
    git -C "$VENDOR" checkout -q FETCH_HEAD
fi

CORE=$VENDOR/libgambatte/src
SOURCES=(
    bootloader cpu gambatte initstate interrupter interruptrequester gambatte-memory sound statesaver tima
    video video_libretro mem/cartridge mem/cartridge_libretro mem/huc3 mem/memptrs mem/rtc
    sound/channel1 sound/channel2 sound/channel3 sound/channel4 sound/duty_unit sound/envelope_unit
    sound/length_counter video/ly_counter video/lyc_irq video/next_m0_time video/ppu video/sprite_mapper
)
FILES=()
for s in "${SOURCES[@]}"; do FILES+=("$CORE/$s.cpp"); done

mkdir -p "$OUT"
TMP=$(mktemp -d)
trap 'rm -rf "$TMP"' EXIT
emcc -O3 -DNDEBUG -D__LIBRETRO__ -DHAVE_STDINT_H -I"$VENDOR/libgambatte/libretro-common/include" \
    -c "$VENDOR/libgambatte/libretro/gambatte_log.c" -o "$TMP/gambatte_log.o"
em++ -O3 -std=c++11 -fno-exceptions -DNDEBUG -D__LIBRETRO__ -DHAVE_STDINT_H -DINLINE=inline \
    -I"$CORE" -I"$VENDOR/libgambatte/include" -I"$VENDOR/common" -I"$VENDOR/libgambatte/libretro" \
    -I"$VENDOR/libgambatte/libretro-common/include" \
    "${FILES[@]}" "$TMP/gambatte_log.o" "$HERE/glue.cpp" \
    -sMODULARIZE=1 -sEXPORT_ES6=1 -sEXPORT_NAME=createGambatte -sENVIRONMENT=web,node \
    -sALLOW_MEMORY_GROWTH=1 -sFILESYSTEM=0 -sASSERTIONS=0 \
    -sEXPORTED_FUNCTIONS=_malloc,_free,_gb_load,_gb_reset,_gb_set_input,_gb_run_frame,_gb_rgba_ptr,_gb_audio_ptr,_gb_audio_count,_gb_audio_clear,_gb_sram_ptr,_gb_sram_size,_gb_rtc_ptr,_gb_rtc_size,_gb_wram_ptr,_gb_wram_size,_gb_state_size,_gb_save_state,_gb_load_state \
    -sEXPORTED_RUNTIME_METHODS=HEAPU8,HEAP16 \
    -o "$OUT/gambatte.js"
echo "OK: $OUT/gambatte.wasm ($(stat -c %s "$OUT/gambatte.wasm") bytes)"
node "$HERE/../tools/stamp-sw.mjs"
