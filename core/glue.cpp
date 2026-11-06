// Thin C API over libgambatte for the web build. JS owns the policy; this file only moves bytes:
// RGBA video, 32768 Hz stereo audio (2 MHz / 64, box-filtered), input, SRAM/RTC/WRAM, save states.

#include "gambatte.h"

#include <cstddef>
#include <cstdint>
#include <cstring>

// Rumble cartridges call this hook, which libgambatte expects the front end to define.
void cartridge_set_rumble(unsigned) {}

namespace {

constexpr int kWidth = 160;
constexpr int kHeight = 144;
constexpr int kPitch = 256;
constexpr unsigned kSamplesPerRun = 2064;
constexpr unsigned kSoundBuf = 16384;  // runFor can overshoot its request
constexpr unsigned kDecimation = 64;   // 2097152 Hz / 64 = 32768 Hz
constexpr unsigned kAudioCap = 2 * 2 * 32768;  // int16 values: ~2 s of stereo if JS stops reading

struct Input : gambatte::InputGetter {
  unsigned mask = 0;
  unsigned operator()() override { return mask; }
};

gambatte::GB gb;
Input input;
bool loaded = false;

gambatte::video_pixel_t video[kPitch * kHeight];
uint32_t rgba[kWidth * kHeight];
uint32_t sound[kSoundBuf];

int16_t audioOut[kAudioCap];
unsigned audioCount = 0;
int64_t accL = 0;
int64_t accR = 0;
unsigned accN = 0;

void pushAudio(unsigned samples) {
  for (unsigned i = 0; i < samples; i++) {
    const uint32_t v = sound[i];
    accL += static_cast<int16_t>(v & 0xffff);
    accR += static_cast<int16_t>(v >> 16);
    if (++accN == kDecimation) {
      if (audioCount + 2 <= kAudioCap) {
        audioOut[audioCount++] = static_cast<int16_t>(accL / kDecimation);
        audioOut[audioCount++] = static_cast<int16_t>(accR / kDecimation);
      }
      accL = accR = 0;
      accN = 0;
    }
  }
}

void convertVideo() {
  for (int y = 0; y < kHeight; y++) {
    const gambatte::video_pixel_t* src = video + y * kPitch;
    uint32_t* dst = rgba + y * kWidth;
    for (int x = 0; x < kWidth; x++) {
      const uint32_t p = src[x];
      dst[x] = 0xff000000u | ((p & 0xff) << 16) | (p & 0xff00) | ((p >> 16) & 0xff);
    }
  }
}

// JS mask -> gambatte mask. JS: B=1 SELECT=4 START=8 UP=16 DOWN=32 LEFT=64 RIGHT=128 A=256.
unsigned toGambatte(unsigned js) {
  unsigned m = 0;
  if (js & 256) m |= gambatte::InputGetter::A;
  if (js & 1) m |= gambatte::InputGetter::B;
  if (js & 4) m |= gambatte::InputGetter::SELECT;
  if (js & 8) m |= gambatte::InputGetter::START;
  if (js & 16) m |= gambatte::InputGetter::UP;
  if (js & 32) m |= gambatte::InputGetter::DOWN;
  if (js & 64) m |= gambatte::InputGetter::LEFT;
  if (js & 128) m |= gambatte::InputGetter::RIGHT;
  return m;
}

}  // namespace

extern "C" {

// Returns 1 on success.
int gb_load(const uint8_t* rom, unsigned size) {
  loaded = false;
  audioCount = 0;
  accL = accR = 0;
  accN = 0;
  std::memset(video, 0, sizeof(video));
  std::memset(rgba, 0, sizeof(rgba));
  gb.setInputGetter(&input);
  if (gb.load(rom, size, 0) != 0) return 0;
  gb.setColorCorrection(gb.isCgb());
  loaded = true;
  return 1;
}

void gb_reset() {
  if (loaded) gb.reset();
}

void gb_set_input(unsigned jsMask) { input.mask = toGambatte(jsMask); }

// Runs until a video frame is ready. Returns 1 if one was drawn.
int gb_run_frame() {
  if (!loaded) return 0;
  for (int guard = 0; guard < 64; guard++) {
    unsigned samples = kSamplesPerRun;
    const long frameAt = gb.runFor(video, kPitch, sound, kSoundBuf, samples);
    pushAudio(samples);
    if (frameAt >= 0) {
      convertVideo();
      return 1;
    }
  }
  return 0;
}

const uint8_t* gb_rgba_ptr() { return reinterpret_cast<const uint8_t*>(rgba); }
const int16_t* gb_audio_ptr() { return audioOut; }
unsigned gb_audio_count() { return audioCount; }
void gb_audio_clear() { audioCount = 0; }

uint8_t* gb_sram_ptr() { return loaded ? static_cast<uint8_t*>(gb.savedata_ptr()) : nullptr; }
unsigned gb_sram_size() { return loaded ? gb.savedata_size() : 0; }
uint8_t* gb_rtc_ptr() { return loaded ? static_cast<uint8_t*>(gb.rtcdata_ptr()) : nullptr; }
unsigned gb_rtc_size() { return loaded ? gb.rtcdata_size() : 0; }

// All of WRAM: bank n lives at 0x1000 * n, so offset 0 is address 0xC000.
uint8_t* gb_wram_ptr() { return loaded ? static_cast<uint8_t*>(gb.rambank0_ptr()) : nullptr; }
unsigned gb_wram_size() { return loaded ? (gb.isCgb() ? 8u : 2u) * 0x1000u : 0; }

unsigned gb_state_size() { return loaded ? static_cast<unsigned>(gb.stateSize()) : 0; }
void gb_save_state(uint8_t* out) {
  if (loaded) gb.saveState(out);
}
int gb_load_state(const uint8_t* data, unsigned size) {
  return loaded && gb.loadState(data, size) ? 1 : 0;
}

}  // extern "C"
