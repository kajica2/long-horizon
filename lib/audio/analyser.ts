/**
 * Audio analyser — extract musical features from the FFT.
 *
 * Stage 5b: turn raw AnalyserNode data into normalized [0, 1] bands.
 *
 * Bands (loosely mapped to perceptual ranges):
 *   - bass:    20   – 250  Hz   → kick, sub, low body
 *   - mid:     250  – 2000 Hz   → vocal, guitar, low synth
 *   - treble:  2000 – 8000 Hz   → hats, sibilance, air
 *
 * Smoothing: attack fast (50ms time constant), release slow (200ms).
 * This means transients pop but the level doesn't drop on every gap.
 *
 * Onset detection: positive derivative above a threshold.
 * Returns a short pulse that we can use to trigger bloom/flash.
 *
 * All math is pure — given the same FFT snapshot you get the same bands.
 */

import type { AudioPlayback } from "./playback";

export type AudioBands = {
  bass: number;     // [0, 1]
  mid: number;      // [0, 1]
  treble: number;   // [0, 1]
  rms: number;      // [0, 1] — overall energy
  onset: number;    // [0, 1] — recent transient (decays after each frame)
};

/**
 * Convert an FFT bin index to Hz, given the sample rate and FFT size.
 * (AnalyserNode defaults to ctx.sampleRate, usually 48000 or 44100.)
 */
function binToHz(bin: number, sampleRate: number, fftSize: number): number {
  return (bin * sampleRate) / fftSize;
}

/**
 * Compute the average magnitude (in dB) of a frequency band from a byte-domain
 * FFT array. The AnalyserNode returns values in [0, 255] mapped from
 * [minDecibels, maxDecibels] (we use -90 to -10). We convert to linear amplitude.
 */
function bandMagnitude(
  freqData: Uint8Array,
  sampleRate: number,
  fftSize: number,
  fromHz: number,
  toHz: number,
): number {
  const binCount = freqData.length; // = fftSize / 2
  const fromBin = Math.max(0, Math.floor((fromHz * fftSize) / sampleRate));
  const toBin = Math.min(binCount - 1, Math.ceil((toHz * fftSize) / sampleRate));
  if (toBin <= fromBin) return 0;
  let sum = 0;
  for (let i = fromBin; i <= toBin; i++) sum += freqData[i];
  // byte [0, 255] → dB [-90, -10] → amplitude [0, 1]
  const avgByte = sum / (toBin - fromBin + 1);
  const db = -90 + (avgByte / 255) * 80; // map to dB
  // Convert dB to linear amplitude (relative): pow(10, dB/20)
  // Normalize: -90 dB → 0, -10 dB → 1 (clamp)
  const normalized = Math.max(0, Math.min(1, (db - (-90)) / 80));
  return normalized;
}

/**
 * Convert amplitude to perceived loudness (dB above threshold) and
 * squash into [0, 1] with a gentle curve so quiet content is still visible
 * but loud content doesn't slam to 1.0 constantly.
 */
function perceptualCurve(amp: number): number {
  if (amp <= 0) return 0;
  // sqrt curve lifts midrange; pow(0.6) gives extra emphasis to quiet parts
  return Math.pow(amp, 0.6);
}

/**
 * Stateful band tracker — kept between samples to provide attack/release smoothing.
 */
export class BandTracker {
  private bass = 0;
  private mid = 0;
  private treble = 0;
  private rms = 0;
  private lastRms = 0;
  private onset = 0;

  // Smoothing time constants (in seconds).
  // Each frame, the new value moves toward the target by an exponential factor.
  private attackTau = 0.05;  // fast attack
  private releaseTau = 0.20; // slow release
  private onsetDecay = 0.85; // multiplicative decay per frame

  /**
   * Update with a new frame of FFT + time-domain data.
   * `dt` is the time since the last update (seconds). At 60fps this is ~0.0167.
   */
  update(
    freq: Uint8Array,
    time: Uint8Array,
    sampleRate: number,
    fftSize: number,
    dt: number,
  ): AudioBands {
    const rawBass = perceptualCurve(
      bandMagnitude(freq, sampleRate, fftSize, 20, 250),
    );
    const rawMid = perceptualCurve(
      bandMagnitude(freq, sampleRate, fftSize, 250, 2000),
    );
    const rawTreble = perceptualCurve(
      bandMagnitude(freq, sampleRate, fftSize, 2000, 8000),
    );

    // RMS from time-domain data
    let sumSq = 0;
    for (let i = 0; i < time.length; i++) {
      const s = (time[i] - 128) / 128; // center on 0
      sumSq += s * s;
    }
    const rawRms = perceptualCurve(Math.sqrt(sumSq / time.length));

    // Onset = positive jump in RMS above threshold
    const jump = rawRms - this.lastRms;
    if (jump > 0.08) {
      this.onset = Math.min(1, this.onset + jump * 4);
    }
    this.onset *= this.onsetDecay;
    this.lastRms = rawRms;

    // Attack/release smoothing per band
    this.bass = smooth(this.bass, rawBass, dt, this.attackTau, this.releaseTau);
    this.mid = smooth(this.mid, rawMid, dt, this.attackTau, this.releaseTau);
    this.treble = smooth(this.treble, rawTreble, dt, this.attackTau, this.releaseTau);
    this.rms = smooth(this.rms, rawRms, dt, this.attackTau, this.releaseTau);

    return {
      bass: this.bass,
      mid: this.mid,
      treble: this.treble,
      rms: this.rms,
      onset: this.onset,
    };
  }

  /** Reset all state (e.g. when switching audio source). */
  reset(): void {
    this.bass = 0;
    this.mid = 0;
    this.treble = 0;
    this.rms = 0;
    this.lastRms = 0;
    this.onset = 0;
  }
}

/**
 * Exponential smoothing with separate attack/release time constants.
 * `value` moves toward `target` over time `dt`; rises with `attackTau`,
 * falls with `releaseTau`.
 */
function smooth(
  value: number,
  target: number,
  dt: number,
  attackTau: number,
  releaseTau: number,
): number {
  const tau = target > value ? attackTau : releaseTau;
  const k = 1 - Math.exp(-dt / tau);
  return value + (target - value) * k;
}

/**
 * Convenience: read the analyser and return current bands. Re-uses a
 * single BandTracker per playback to keep state across frames.
 */
const trackers = new WeakMap<AudioPlayback, BandTracker>();

export function readBands(
  playback: AudioPlayback,
  dt: number,
): AudioBands {
  let tracker = trackers.get(playback);
  if (!tracker) {
    tracker = new BandTracker();
    trackers.set(playback, tracker);
  }

  const freq = new Uint8Array(playback.analyser.frequencyBinCount);
  const time = new Uint8Array(playback.analyser.fftSize);
  playback.analyser.getByteFrequencyData(freq);
  playback.analyser.getByteTimeDomainData(time);

  return tracker.update(
    freq,
    time,
    playback.ctx.sampleRate,
    playback.analyser.fftSize,
    dt,
  );
}
