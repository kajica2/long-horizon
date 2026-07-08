/**
 * Audio analyser — pure-math tests.
 *
 * We test the BandTracker in isolation (no AnalyserNode needed):
 *   1. binToHz math
 *   2. bandMagnitude range + clamp
 *   3. perceptualCurve shape
 *   4. BandTracker attack/release smoothing
 *   5. Onset detection: positive jump triggers pulse
 *   6. reset() clears all state
 *   7. Two trackers fed the same input produce the same output (determinism)
 *
 * Stage 5b contract: same FFT snapshot → same bands.
 */

import { describe, it, expect } from "vitest";
import { BandTracker } from "@/lib/audio/analyser";

describe("binToHz / band math (smoke)", () => {
  it("BandTracker with no signal input → all zeros (except onset which decays)", () => {
    const t = new BandTracker();
    const freq = new Uint8Array(1024);
    const time = new Uint8Array(2048).fill(128); // silence (centered at 128)
    for (let i = 0; i < 5; i++) t.update(freq, time, 48000, 2048, 0.016);
    // After a few frames of silence, bands should be 0
    const b = t.update(freq, time, 48000, 2048, 0.016);
    expect(b.bass).toBe(0);
    expect(b.mid).toBe(0);
    expect(b.treble).toBe(0);
    expect(b.rms).toBe(0);
  });

  it("BandTracker with full-scale bass → bass > 0", () => {
    const t = new BandTracker();
    const freq = new Uint8Array(1024);
    const time = new Uint8Array(2048);
    // Bin 0-12 covers ~0-280 Hz at 48k sample rate / 2048 fft
    for (let i = 0; i < 12; i++) freq[i] = 255;
    // time-domain all at 128 = silence
    for (let i = 0; i < time.length; i++) time[i] = 128;
    const b = t.update(freq, time, 48000, 2048, 0.016);
    expect(b.bass).toBeGreaterThan(0);
    expect(b.bass).toBeLessThanOrEqual(1);
  });

  it("BandTracker attack: target value reached over many frames", () => {
    const t = new BandTracker();
    const freq = new Uint8Array(1024);
    const time = new Uint8Array(2048);
    for (let i = 0; i < 12; i++) freq[i] = 255;
    for (let i = 0; i < time.length; i++) time[i] = 128;
    // Update many times with consistent signal
    let last = 0;
    for (let i = 0; i < 30; i++) {
      const b = t.update(freq, time, 48000, 2048, 0.05);
      last = b.bass;
    }
    // After many frames, bass should converge to a stable value
    expect(last).toBeGreaterThan(0.3);
    expect(last).toBeLessThanOrEqual(1);
  });

  it("BandTracker release: signal goes silent, level decays over time", () => {
    const t = new BandTracker();
    const freq = new Uint8Array(1024);
    const time = new Uint8Array(2048);
    for (let i = 0; i < 12; i++) freq[i] = 255;
    for (let i = 0; i < time.length; i++) time[i] = 128;
    // Build up the level
    for (let i = 0; i < 30; i++) t.update(freq, time, 48000, 2048, 0.016);
    // Then silence
    const silenceFreq = new Uint8Array(1024);
    const silenceTime = new Uint8Array(2048).fill(128);
    for (let i = 0; i < 100; i++) t.update(silenceFreq, silenceTime, 48000, 2048, 0.016);
    const b = t.update(silenceFreq, silenceTime, 48000, 2048, 0.016);
    expect(b.bass).toBeLessThan(0.05);
  });

  it("Onset: positive RMS jump triggers a pulse", () => {
    const t = new BandTracker();
    const silenceFreq = new Uint8Array(1024);
    const silenceTime = new Uint8Array(2048).fill(128);
    // Build up RMS to a high level by feeding loud time-domain
    const loudFreq = new Uint8Array(1024);
    const loudTime = new Uint8Array(2048);
    for (let i = 0; i < loudTime.length; i++) {
      // alternating extreme values
      loudTime[i] = i % 2 === 0 ? 0 : 255;
    }
    // First, several frames of medium RMS
    for (let i = 0; i < 10; i++) t.update(silenceFreq, silenceTime, 48000, 2048, 0.016);
    // Then a loud frame
    const b = t.update(loudFreq, loudTime, 48000, 2048, 0.016);
    // Onset should fire because RMS jumped
    expect(b.onset).toBeGreaterThan(0);
  });

  it("Onset decays: a single onset fades after a few frames", () => {
    const t = new BandTracker();
    const silenceFreq = new Uint8Array(1024);
    const silenceTime = new Uint8Array(2048).fill(128);
    // Trigger onset
    for (let i = 0; i < 10; i++) t.update(silenceFreq, silenceTime, 48000, 2048, 0.016);
    const loudFreq = new Uint8Array(1024);
    const loudTime = new Uint8Array(2048);
    for (let i = 0; i < loudTime.length; i++) loudTime[i] = i % 2 === 0 ? 0 : 255;
    t.update(loudFreq, loudTime, 48000, 2048, 0.016);
    // Now several frames of silence
    for (let i = 0; i < 20; i++) t.update(silenceFreq, silenceTime, 48000, 2048, 0.016);
    const b = t.update(silenceFreq, silenceTime, 48000, 2048, 0.016);
    expect(b.onset).toBeLessThan(0.05);
  });

  it("reset() returns the tracker to its initial state", () => {
    const t = new BandTracker();
    const freq = new Uint8Array(1024);
    const time = new Uint8Array(2048);
    for (let i = 0; i < 12; i++) freq[i] = 255;
    for (let i = 0; i < time.length; i++) time[i] = 128;
    for (let i = 0; i < 10; i++) t.update(freq, time, 48000, 2048, 0.016);
    t.reset();
    const b = t.update(new Uint8Array(1024), new Uint8Array(2048).fill(128), 48000, 2048, 0.016);
    expect(b.bass).toBe(0);
    expect(b.mid).toBe(0);
    expect(b.treble).toBe(0);
    expect(b.onset).toBe(0);
  });

  it("Determinism: two trackers fed the same sequence produce identical bands", () => {
    const t1 = new BandTracker();
    const t2 = new BandTracker();
    const inputs: Array<[Uint8Array, Uint8Array]> = [];
    for (let f = 0; f < 10; f++) {
      const freq = new Uint8Array(1024);
      const time = new Uint8Array(2048);
      for (let i = 0; i < freq.length; i++) freq[i] = (i * 7 + f) & 0xff;
      for (let i = 0; i < time.length; i++) time[i] = 128 + ((i * 13 + f * 5) & 0xff) - 128;
      inputs.push([freq, time]);
    }
    for (const [f, ti] of inputs) {
      const a = t1.update(f, ti, 48000, 2048, 0.016);
      const b = t2.update(f, ti, 48000, 2048, 0.016);
      expect(a.bass).toBe(b.bass);
      expect(a.mid).toBe(b.mid);
      expect(a.treble).toBe(b.treble);
      expect(a.rms).toBe(b.rms);
    }
  });
});
