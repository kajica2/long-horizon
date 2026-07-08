/**
 * Normalize raw audio features to the [0, 1] ranges defined in AudioDNA.
 *
 * Calibration strategy: each feature is mapped through an empirically-derived
 * reference range. The reference values below come from synthetic test signals
 * (sines + kicks + envelopes) that span the realistic feature space.
 *
 * For production we'd replace these with ranges derived from a labeled corpus
 * of real music across genres. This is a v1 honest approximation.
 *
 * Reference of "no value": if a feature has no signal (e.g. no rhythm in a
 * pure tone), it normalizes to 0. That's a feature, not a bug.
 */

import type { RawFeatures } from "./analyze";
import type { AudioDNA } from "../types";

/**
 * Reference ranges. Values outside [lo, hi] are clamped to [0, 1].
 *
 * Tuned against the synthetic benchmark corpus in scripts/benchmark.ts.
 */
const RANGES = {
  tempo: { lo: 40, hi: 200 }, // BPM
  brightness: { lo: 100, hi: 8000 }, // Hz (spectral centroid)
  warmth: { lo: 0, hi: 1 }, // low/mid ratio, already 0..1 in computeWarmth
  texture: { lo: 0, hi: 1 }, // MFCC entropy, already [0, 1]
  energy: { lo: 0, hi: 0.5 }, // RMS — empirical upper bound from normalized tracks
  aggression: { lo: 0, hi: 5 }, // spectral flux — typical tracks rarely exceed ~3
  complexity: { lo: 0, hi: 1 }, // normalized flux
  motion: { lo: 0, hi: 10 }, // onsets per second — most tracks < 5
  entropy: { lo: 0, hi: 0.3 }, // zero-crossing rate — typical tracks < 0.15
} as const;

function map01(value: number, lo: number, hi: number): number {
  if (hi === lo) return 0;
  return Math.max(0, Math.min(1, (value - lo) / (hi - lo)));
}

export function normalize(raw: RawFeatures): AudioDNA {
  // Complexity derived from flux (frame-to-frame magnitude difference).
  // Map through aggression's range — same underlying signal.
  const complexity = map01(raw.flux, RANGES.aggression.lo, RANGES.aggression.hi);

  // Warmth: we don't have a direct band-ratio here, so we derive it
  // from brightness — low brightness → warm, high brightness → cold.
  // brightness low (200Hz) → warmth 1, brightness high (8000Hz) → warmth 0
  const warmth = 1 - map01(raw.brightnessHz, RANGES.brightness.lo, RANGES.brightness.hi);

  return {
    tempo: raw.tempoBpm,
    key: raw.key,
    mode: raw.scale,
    brightness: map01(raw.brightnessHz, RANGES.brightness.lo, RANGES.brightness.hi),
    warmth,
    texture: map01(raw.mfccEntropy, RANGES.texture.lo, RANGES.texture.hi),
    energy: map01(raw.rms, RANGES.energy.lo, RANGES.energy.hi),
    aggression: map01(raw.flux, RANGES.aggression.lo, RANGES.aggression.hi),
    complexity,
    motion: map01(raw.onsetRate, RANGES.motion.lo, RANGES.motion.hi),
    entropy: map01(raw.zcr, RANGES.entropy.lo, RANGES.entropy.hi),
  };
}