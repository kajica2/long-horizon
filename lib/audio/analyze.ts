/**
 * Audio analysis — PCM samples → raw feature values via essentia.js.
 *
 * Returns RAW feature values. Normalization to [0, 1] happens in normalize.ts.
 *
 * The essentia.js WASM module is loaded once per Node process and shared
 * across requests. Stage 5 will add a per-track streaming path for the
 * client; this server-side path is for upload-time analysis.
 */

import { EssentiaWASM, Essentia } from "essentia.js";

export type RawFeatures = {
  tempoBpm: number;
  tempoConfidence: number;
  key: string; // e.g. "A", "F#"
  scale: "major" | "minor";
  keyStrength: number;
  brightnessHz: number; // spectral centroid (Hz)
  rms: number;          // mean RMS across frames
  zcr: number;          // mean zero-crossing rate across frames
  flux: number;         // mean spectral flux across frames
  mfccEntropy: number;  // entropy of MFCC histogram [0, 1]
  onsetRate: number;    // onsets per second
};

// One Essentia instance per Node process — WASM init is expensive.
let essentiaInstance: Essentia | null = null;

function getEssentia(): Essentia {
  if (!essentiaInstance) {
    essentiaInstance = new Essentia(EssentiaWASM);
  }
  return essentiaInstance;
}

const FRAME_SIZE = 2048;
const HOP_SIZE = 1024;

export function analyzeAudio(samples: Float32Array): RawFeatures {
  const essentia = getEssentia();
  const signalVec = essentia.arrayToVector(Array.from(samples));

  // ---------- Framewise features ----------
  let totalRms = 0;
  let totalZcr = 0;
  let totalCentroid = 0;
  let prevMag: number[] | null = null;
  let totalFlux = 0;
  const allMfccValues: number[] = [];
  let frameCount = 0;

  for (let i = 0; i + FRAME_SIZE < samples.length; i += HOP_SIZE) {
    const frame = samples.slice(i, i + FRAME_SIZE);
    const frameVec = essentia.arrayToVector(Array.from(frame));

    totalRms += essentia.RMS(frameVec).rms;
    totalZcr += essentia.ZeroCrossingRate(frameVec).zeroCrossingRate;
    totalCentroid += essentia.SpectralCentroidTime(frameVec).centroid;

    // MFCC via spectrum → MFCC
    const spec = essentia.Spectrum(frameVec);
    const specVec = spec.spectrum;
    const mfccOut = essentia.MFCC(specVec);
    for (let k = 0; k < mfccOut.mfcc.size(); k++) {
      allMfccValues.push(mfccOut.mfcc.get(k));
    }

    // Spectral flux from magnitude spectrum
    const mag = new Array<number>(specVec.size());
    for (let k = 0; k < specVec.size(); k++) mag[k] = specVec.get(k);

    if (prevMag) {
      let flux = 0;
      const len = Math.min(mag.length, prevMag.length);
      for (let k = 0; k < len; k++) {
        const diff = mag[k] - prevMag[k];
        if (diff > 0) flux += diff;
      }
      totalFlux += flux / len;
    }
    prevMag = mag;
    frameCount++;
  }

  // ---------- MFCC entropy (texture) ----------
  let mfccEntropy = 0;
  if (allMfccValues.length > 0) {
    const min = Math.min(...allMfccValues);
    const max = Math.max(...allMfccValues);
    const range = max - min || 1;
    const bins = 32;
    const hist = new Array(bins).fill(0);
    for (const v of allMfccValues) {
      const idx = Math.min(bins - 1, Math.floor(((v - min) / range) * bins));
      hist[idx]++;
    }
    const total = allMfccValues.length;
    let H = 0;
    for (const c of hist) {
      if (c > 0) {
        const p = c / total;
        H -= p * Math.log2(p);
      }
    }
    mfccEntropy = H / Math.log2(bins); // normalize to [0, 1]
  }

  // ---------- High-level features (whole-signal) ----------
  const keyOut = essentia.KeyExtractor(signalVec);
  const bpmOut = essentia.BeatTrackerMultiFeature(signalVec);
  const onsetOut = essentia.OnsetRate(signalVec);

  return {
    tempoBpm: bpmOut.bpm ?? 0,
    tempoConfidence: bpmOut.confidence ?? 0,
    key: keyOut.key ?? "C",
    scale: (keyOut.scale === "minor" ? "minor" : "major") as "major" | "minor",
    keyStrength: keyOut.strength ?? 0,
    brightnessHz: totalCentroid / frameCount,
    rms: totalRms / frameCount,
    zcr: totalZcr / frameCount,
    flux: totalFlux / Math.max(1, frameCount - 1),
    mfccEntropy,
    onsetRate: (onsetOut as { onsetRate?: number }).onsetRate ?? 0,
  };
}