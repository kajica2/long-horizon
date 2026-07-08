/**
 * Stage 2 benchmark — essentia.js vs meyda head-to-head.
 *
 * Generates a labeled test corpus with KNOWN musical properties,
 * runs both libraries, and compares how each one recovers those
 * properties. Documents the decision in STAGE2_DECISION.md.
 *
 * Run: npx tsx scripts/benchmark.ts
 */

import { promises as fs } from "node:fs";
import path from "node:path";
import { EssentiaWASM, Essentia } from "essentia.js";
// Meyda's Node entrypoint exposes the featureExtractors as pure functions.
import * as meydaInternals from "meyda/dist/node/main.js";

// ============================================================
// WAV decoder + generator
// ============================================================

function decodeWav(buffer: Buffer): { sampleRate: number; samples: Float32Array } {
  const sampleRate = buffer.readUInt32LE(24);
  const bitsPerSample = buffer.readUInt16LE(34);
  const numChannels = buffer.readUInt16LE(22);
  const dataSize = buffer.readUInt32LE(40);
  const samples = new Float32Array(
    dataSize / (bitsPerSample / 8) / numChannels,
  );
  let offset = 44;
  for (let i = 0; i < samples.length; i++) {
    const s = buffer.readInt16LE(offset);
    samples[i] = s / 32768;
    offset += 2 * numChannels;
  }
  return { sampleRate, samples };
}

function makeWav(samples: Float32Array, sampleRate = 22050): Buffer {
  const numChannels = 1;
  const bitsPerSample = 16;
  const dataSize = samples.length * 2;
  const buf = Buffer.alloc(44 + dataSize);
  buf.write("RIFF", 0);
  buf.writeUInt32LE(36 + dataSize, 4);
  buf.write("WAVE", 8);
  buf.write("fmt ", 12);
  buf.writeUInt32LE(16, 16);
  buf.writeUInt16LE(1, 20);
  buf.writeUInt16LE(numChannels, 22);
  buf.writeUInt32LE(sampleRate, 24);
  buf.writeUInt32LE((sampleRate * numChannels * bitsPerSample) / 8, 28);
  buf.writeUInt16LE((numChannels * bitsPerSample) / 8, 32);
  buf.writeUInt16LE(bitsPerSample, 34);
  buf.write("data", 36);
  buf.writeUInt32LE(dataSize, 40);
  for (let i = 0; i < samples.length; i++) {
    const s = Math.max(-1, Math.min(1, samples[i]));
    buf.writeInt16LE(Math.round(s * 32767), 44 + i * 2);
  }
  return buf;
}

function sine(duration: number, freq: number, sampleRate = 22050): Float32Array {
  const n = Math.floor(duration * sampleRate);
  const out = new Float32Array(n);
  const fade = Math.floor(sampleRate * 0.05); // 50ms fade
  for (let i = 0; i < n; i++) {
    const t = i / sampleRate;
    let env = 1;
    if (i < fade) env = i / fade;
    else if (i > n - fade) env = (n - i) / fade;
    out[i] = Math.sin(2 * Math.PI * freq * t) * 0.5 * env;
  }
  return out;
}

function kick(bpm: number, duration: number, sampleRate = 22050): Float32Array {
  const n = Math.floor(duration * sampleRate);
  const out = new Float32Array(n);
  const beatPeriod = 60 / bpm;
  for (let i = 0; i < n; i++) {
    const t = i / sampleRate;
    const beatPhase = (t % beatPeriod) / beatPeriod;
    const env = Math.exp(-beatPhase * 12);
    out[i] = Math.sin(2 * Math.PI * 60 * t) * env * 0.8;
  }
  return out;
}

// ============================================================
// Labeled test corpus — known musical properties
// ============================================================

type TestCase = {
  name: string;
  description: string;
  samples: Float32Array;
  expected: {
    tempo?: number;       // BPM, ±5
    key?: string;         // e.g. "A"
    scale?: "major" | "minor";
    bright?: "low" | "mid" | "high";
  };
};

const CORPUS: TestCase[] = [
  {
    name: "sine-440",
    description: "Pure 440 Hz sine wave (A4)",
    samples: sine(8, 440),
    expected: { key: "A", bright: "mid" },
  },
  {
    name: "sine-110",
    description: "Pure 110 Hz sine wave (A2 — low)",
    samples: sine(8, 110),
    expected: { key: "A", bright: "low" },
  },
  {
    name: "sine-4000",
    description: "Pure 4000 Hz sine wave (high)",
    samples: sine(8, 4000),
    expected: { bright: "high" },
  },
  {
    name: "kick-120",
    description: "120 BPM kick at 60 Hz",
    samples: kick(120, 12),
    expected: { tempo: 120 },
  },
  {
    name: "kick-90",
    description: "90 BPM kick at 60 Hz",
    samples: kick(90, 12),
    expected: { tempo: 90 },
  },
  {
    name: "kick-60",
    description: "60 BPM kick at 60 Hz",
    samples: kick(60, 12),
    expected: { tempo: 60 },
  },
];

// ============================================================
// Essentia runner
// ============================================================

type EssentiaFeatures = {
  tempo?: number;
  tempoConfidence?: number;
  key?: string;
  scale?: string;
  keyStrength?: number;
  brightness?: number;     // spectral centroid (Hz)
  rms?: number;
  zcr?: number;
  mfccEntropy?: number;
  flux?: number;
  onsetRate?: number;
};

function runEssentia(
  essentia: Essentia,
  samples: Float32Array,
  sampleRate: number,
): EssentiaFeatures {
  const signalVec = essentia.arrayToVector(Array.from(samples));

  // Frame the signal (essentia algorithms work on frames)
  const frameSize = 2048;
  const hopSize = 1024;

  let totalRms = 0;
  let totalZcr = 0;
  let totalCentroid = 0;
  let frameCount = 0;
  let mfccs: number[][] = [];
  let prevSpectrum: Float32Array | null = null;
  let totalFlux = 0;

  for (let i = 0; i + frameSize < samples.length; i += hopSize) {
    const frame = samples.slice(i, i + frameSize);
    const frameVec = essentia.arrayToVector(Array.from(frame));

    totalRms += essentia.RMS(frameVec).rms;
    totalZcr += essentia.ZeroCrossingRate(frameVec).zeroCrossingRate;

    const spec = essentia.Spectrum(frameVec);
    const specVec = spec.spectrum;
    totalCentroid += essentia.SpectralCentroidTime(frameVec).centroid;

    if (prevSpectrum) {
      // spectral flux: half-rectified sum of frame-to-frame magnitude differences
      let flux = 0;
      const len = Math.min(specVec.size(), prevSpectrum.length);
      for (let k = 0; k < len; k++) {
        const diff = specVec.get(k) - prevSpectrum[k];
        if (diff > 0) flux += diff;
      }
      totalFlux += flux / len;
    }
    prevSpectrum = new Float32Array(specVec.size());
    for (let k = 0; k < specVec.size(); k++) prevSpectrum[k] = specVec.get(k);

    const mfcc = essentia.MFCC(specVec);
    const mfccArr: number[] = [];
    for (let k = 0; k < mfcc.mfcc.size(); k++) mfccArr.push(mfcc.mfcc.get(k));
    mfccs.push(mfccArr);

    frameCount++;
  }

  // MFCC entropy (texture)
  let mfccEntropy = 0;
  if (mfccs.length > 0) {
    const nCoeffs = mfccs[0].length;
    const allVals: number[] = [];
    for (const frame of mfccs) for (const v of frame) allVals.push(v);
    // Build a histogram, then compute Shannon entropy
    const min = Math.min(...allVals);
    const max = Math.max(...allVals);
    const bins = 32;
    const hist = new Array(bins).fill(0);
    for (const v of allVals) {
      const idx = Math.min(bins - 1, Math.floor(((v - min) / (max - min)) * bins));
      hist[idx]++;
    }
    const total = allVals.length;
    let H = 0;
    for (const c of hist) {
      if (c > 0) {
        const p = c / total;
        H -= p * Math.log2(p);
      }
    }
    mfccEntropy = H / Math.log2(bins); // normalized to [0,1]
  }

  // High-level: key + tempo
  const keyResult = essentia.KeyExtractor(signalVec);
  const bpmResult = essentia.BeatTrackerMultiFeature(signalVec);
  const onsetRate = essentia.OnsetRate(signalVec);

  return {
    tempo: bpmResult.bpm,
    tempoConfidence: bpmResult.confidence,
    key: keyResult.key,
    scale: keyResult.scale,
    keyStrength: keyResult.strength,
    brightness: totalCentroid / frameCount,
    rms: totalRms / frameCount,
    zcr: totalZcr / frameCount,
    mfccEntropy,
    flux: totalFlux / Math.max(1, frameCount - 1),
    onsetRate: (onsetRate as { onsetRate?: number }).onsetRate ?? undefined,
  };
}

// ============================================================
// Meyda runner — calls the underlying extractors directly
// (no AudioContext dependency)
// ============================================================

type MeydaFeatures = {
  brightness?: number;     // spectral centroid (Hz)
  rms?: number;
  zcr?: number;
  mfccEntropy?: number;
  flux?: number;
  // NOTE: meyda does NOT include BPM/key detection natively
};

function runMeyda(
  samples: Float32Array,
  sampleRate: number,
): MeydaFeatures {
  const featureExtractors = (meydaInternals as { featureExtractors: Record<string, (args: Record<string, unknown>) => number> })
    .featureExtractors;

  const bufferSize = 2048;
  const hopSize = 1024;
  let totalCentroid = 0;
  let totalRms = 0;
  let totalZcr = 0;
  let mfccs: number[][] = [];
  let prevMag: Float32Array | null = null;
  let totalFlux = 0;
  let frameCount = 0;

  for (let i = 0; i + bufferSize < samples.length; i += hopSize) {
    const frame = samples.slice(i, i + bufferSize);

    // Apply Hanning window (matches meyda default)
    const windowed = new Float32Array(bufferSize);
    for (let k = 0; k < bufferSize; k++) {
      windowed[k] =
        frame[k] *
        (0.5 - 0.5 * Math.cos((2 * Math.PI * k) / (bufferSize - 1)));
    }

    // Compute magnitude spectrum via simple DFT (slow but correct)
    // For benchmark purposes only — production code uses WebFFT.
    const mag = new Float32Array(bufferSize / 2);
    for (let k = 0; k < bufferSize / 2; k++) {
      let re = 0;
      let im = 0;
      for (let n = 0; n < bufferSize; n++) {
        const angle = (2 * Math.PI * k * n) / bufferSize;
        re += windowed[n] * Math.cos(angle);
        im -= windowed[n] * Math.sin(angle);
      }
      mag[k] = Math.sqrt(re * re + im * im);
    }

    const ctx = {
      ampSpectrum: mag,
      signal: windowed,
      bufferSize,
      sampleRate,
      numberOfMFCCCoefficients: 13,
      numberOfBarkBands: 24,
    };

    totalCentroid += featureExtractors.spectralCentroid(ctx);
    totalRms += featureExtractors.rms(ctx);
    totalZcr += featureExtractors.zcr(ctx);
    // NOTE: meyda's mfcc extractor requires a pre-computed melFilterBank
    // (the MeydaAnalyzer builds it on construction). To get MFCC entropy
    // from meyda standalone, we'd need to construct the melFilterBank
    // ourselves. essentia handles this internally.
    // Skipping MFCC for meyda in this benchmark.

    if (prevMag) {
      let flux = 0;
      for (let k = 0; k < mag.length; k++) {
        const diff = mag[k] - prevMag[k];
        if (diff > 0) flux += diff;
      }
      totalFlux += flux / mag.length;
    }
    prevMag = mag;
    frameCount++;
  }

  // MFCC entropy skipped — meyda standalone requires pre-built melFilterBank

  return {
    brightness: totalCentroid / frameCount,
    rms: totalRms / frameCount,
    zcr: totalZcr / frameCount,
    mfccEntropy: 0,
    flux: totalFlux / Math.max(1, frameCount - 1),
  };
}

// ============================================================
// Main
// ============================================================

async function main() {
  console.log("========================================");
  console.log("Stage 2 benchmark — essentia.js vs meyda");
  console.log("========================================\n");

  const essentia = new Essentia(EssentiaWASM);

  // Persist corpus for reproducibility
  const corpusDir = path.resolve("tmp/corpus");
  await fs.mkdir(corpusDir, { recursive: true });
  for (const tc of CORPUS) {
    await fs.writeFile(path.join(corpusDir, `${tc.name}.wav`), makeWav(tc.samples));
  }
  console.log(`Generated ${CORPUS.length} test cases in tmp/corpus/\n`);

  console.log("Test case             | tempo (ess) | key (ess) | bright (ess) | bright (meyda) | rms (ess) | rms (meyda)");
  console.log("----------------------+-------------+-----------+--------------+----------------+-----------+-----------");
  for (const tc of CORPUS) {
    const e = runEssentia(essentia, tc.samples, 22050);
    const m = runMeyda(tc.samples, 22050);
    console.log(
      `${tc.name.padEnd(21)} | ${e.tempo?.toFixed(1).padStart(11) ?? "       —  "} | ${(e.key ?? "—").padEnd(9)} | ${e.brightness?.toFixed(0).padStart(12)} | ${m.brightness?.toFixed(0).padStart(14)} | ${e.rms?.toFixed(3).padStart(9)} | ${m.rms?.toFixed(3).padStart(9)}`,
    );
    console.log(
      `  expected             | ${(tc.expected.tempo ?? "—").toString().padStart(11)} | ${(tc.expected.key ?? "—").padEnd(9)} | ${(tc.expected.bright ?? "—").padEnd(12)} |`,
    );
  }

  console.log("\n========================================");
  console.log("Capability matrix");
  console.log("========================================");
  console.log("Feature        | essentia.js | meyda");
  console.log("---------------+-------------+--------");
  console.log("BPM / tempo    |      ✓      |   ✗   ");
  console.log("Key + scale    |      ✓      |   ✗   ");
  console.log("Spectral centr |      ✓      |   ✓   ");
  console.log("RMS / energy   |      ✓      |   ✓   ");
  console.log("Zero-cross rate|      ✓      |   ✓   ");
  console.log("MFCC           |      ✓      |   ✓   ");
  console.log("Spectral flux  |      ✓      |   ✓   ");
  console.log("Onset rate     |      ✓      |   ✗   ");
  console.log("Runs in Node   |      ✓      |   ✓   ");

  essentia.shutdown();
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});