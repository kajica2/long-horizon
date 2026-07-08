/**
 * Seed script — creates 3 demo Artwork records.
 *
 * Each artwork references a small generated WAV file under /public/demo/
 * so the soundtrack URLs resolve locally without external dependencies.
 *
 * Run with:  npm run db:seed
 */

import { promises as fs } from "node:fs";
import path from "node:path";
import crypto from "node:crypto";
import { prisma } from "../lib/db";
import { saveArtwork } from "../lib/artwork-store";
import {
  type Artwork,
  type Soundtrack,
  type ShaderGraph,
  type PlanetaryDNA,
  defaultShaderGraph,
} from "../lib/types";
import { generateSeed, mulberry32 } from "../lib/seed";
import { extractAudioDNA } from "../lib/audio/extract-dna";
import { computePlanetaryDNA } from "../lib/planetary/compute";

// ============================================================
// Minimal WAV file generator (mono, 16-bit PCM)
// ============================================================

function makeWav(samples: Float32Array, sampleRate = 22050): Buffer {
  const numChannels = 1;
  const bitsPerSample = 16;
  const byteRate = (sampleRate * numChannels * bitsPerSample) / 8;
  const blockAlign = (numChannels * bitsPerSample) / 8;
  const dataSize = samples.length * 2;
  const buffer = Buffer.alloc(44 + dataSize);

  // RIFF header
  buffer.write("RIFF", 0);
  buffer.writeUInt32LE(36 + dataSize, 4);
  buffer.write("WAVE", 8);

  // fmt chunk
  buffer.write("fmt ", 12);
  buffer.writeUInt32LE(16, 16); // chunk size
  buffer.writeUInt16LE(1, 20); // PCM
  buffer.writeUInt16LE(numChannels, 22);
  buffer.writeUInt32LE(sampleRate, 24);
  buffer.writeUInt32LE(byteRate, 28);
  buffer.writeUInt16LE(blockAlign, 32);
  buffer.writeUInt16LE(bitsPerSample, 34);

  // data chunk
  buffer.write("data", 36);
  buffer.writeUInt32LE(dataSize, 40);
  for (let i = 0; i < samples.length; i++) {
    const s = Math.max(-1, Math.min(1, samples[i]));
    buffer.writeInt16LE(Math.round(s * 32767), 44 + i * 2);
  }
  return buffer;
}

function generateTone(
  duration: number,
  freq: (t: number) => number,
  sampleRate = 22050,
): Float32Array {
  const n = Math.floor(duration * sampleRate);
  const out = new Float32Array(n);
  let phase = 0;
  for (let i = 0; i < n; i++) {
    const t = i / sampleRate;
    const f = freq(t);
    phase += (2 * Math.PI * f) / sampleRate;
    // soft envelope so file isn't a click
    const env = Math.min(1, t * 4) * Math.min(1, (duration - t) * 4);
    out[i] = Math.sin(phase) * 0.3 * env;
  }
  return out;
}

// ============================================================
// Demo data
// ============================================================

type DemoSeed = {
  filename: string;       // public URL
  outName: string;        // local file name under /public/demo/
  displayName: string;
  description: string;
  duration: number;
  generator: () => Float32Array;
  graphOverrides: Partial<ShaderGraph>;
};

const DEMOS: DemoSeed[] = [
  {
    filename: "drift.mp3",
    outName: "drift.wav",
    displayName: "Drift",
    description: "Slow, low-frequency drone. Feels like fog.",
    duration: 12,
    generator: () =>
      generateTone(12, (t) => 110 + Math.sin(t) * 2), // ~110 Hz with vibrato
    graphOverrides: {
      palette: "ember",
      camera: "meditationDrift",
      params: { fieldStrength: 0.6, drag: 0.12, noiseScale: 0.4, maxAge: 18 },
      postFx: { bloom: 1.1, chromaticAberration: 0.003, filmGrain: 0.08, feedback: 0.08 },
    },
  },
  {
    filename: "shimmer.mp3",
    outName: "shimmer.wav",
    displayName: "Shimmer",
    description: "High harmonic cluster. Particles scatter.",
    duration: 12,
    generator: () =>
      generateTone(12, (t) => 880 + Math.sin(t * 3.7) * 60 + Math.cos(t * 7.1) * 40),
    graphOverrides: {
      palette: "aurora",
      camera: "orbit",
      params: { fieldStrength: 1.6, drag: 0.05, noiseScale: 1.1, maxAge: 9 },
      postFx: { bloom: 1.4, chromaticAberration: 0.005, filmGrain: 0.04, feedback: 0.04 },
    },
  },
  {
    filename: "pulse.mp3",
    outName: "pulse.wav",
    displayName: "Pulse",
    description: "Rhythmic low-mid. Particles breathe.",
    duration: 12,
    generator: () => {
      // 90 BPM kick-like pulse at ~120 Hz with rhythmic envelope
      const sr = 22050;
      const duration = 12;
      const n = duration * sr;
      const out = new Float32Array(n);
      const bpm = 90;
      const beatPeriod = 60 / bpm;
      for (let i = 0; i < n; i++) {
        const t = i / sr;
        const beatPhase = (t % beatPeriod) / beatPeriod;
        const env = Math.exp(-beatPhase * 8) * 0.6;
        out[i] = Math.sin(2 * Math.PI * 120 * t) * env;
      }
      return out;
    },
    graphOverrides: {
      palette: "tide",
      camera: "drone",
      params: { fieldStrength: 1.2, drag: 0.07, noiseScale: 0.7, maxAge: 11 },
      postFx: { bloom: 1.0, chromaticAberration: 0.003, filmGrain: 0.06, feedback: 0.06 },
    },
  },
];

// ============================================================
// Seed runner
// ============================================================

async function main() {
  const storageDir = process.env.LOCAL_STORAGE_DIR ?? "./public/demo";
  await fs.mkdir(storageDir, { recursive: true });

  // Clear existing seed artworks (idempotent reseed)
  await prisma.artwork.deleteMany({
    where: { id: { startsWith: "demo-" } },
  });

  for (const demo of DEMOS) {
    const wavPath = path.join(storageDir, demo.outName);
    const samples = demo.generator();
    await fs.writeFile(wavPath, makeWav(samples));

    // Extract AudioDNA from the generated WAV using the real pipeline.
    // This is what Stage 2 actually delivers — no more hand-tuned values.
    const { soundtrack: analyzedSoundtrack, audioDNA } = await extractAudioDNA(
      await fs.readFile(wavPath),
      demo.filename,
    );

    const soundtrack: Soundtrack = {
      ...analyzedSoundtrack,
      id: `demo-soundtrack-${demo.outName.replace(/\W/g, "")}`,
      url: `/demo/${demo.outName}`,
    };

    console.log(
      `  ${demo.displayName}: tempo=${audioDNA.tempo.toFixed(1)} key=${audioDNA.key}${audioDNA.mode === "minor" ? "m" : ""} brightness=${audioDNA.brightness.toFixed(2)} energy=${audioDNA.energy.toFixed(2)}`,
    );

    const baseGraph = defaultShaderGraph();
    const shaderGraph: ShaderGraph = {
      ...baseGraph,
      ...demo.graphOverrides,
      params: { ...baseGraph.params, ...(demo.graphOverrides.params ?? {}) },
      postFx: { ...baseGraph.postFx, ...(demo.graphOverrides.postFx ?? {}) },
    };

    const id = `demo-${demo.outName.replace(/\W/g, "")}`;
    const seed = generateSeed();
    // Use a deterministic seed derived from the demo name so each run
    // produces an identical artwork (handy for visual reproducibility tests).
    const deterministicSeed = hashSeedForDemo(id);

    const artwork: Artwork = {
      id,
      seed: deterministicSeed,
      soundtrack,
      audioDNA,
      shaderGraph,
      createdAt: new Date().toISOString(),
      creator: "demo-seed",
      title: demo.displayName,
    };

    await saveArtwork(artwork);
    console.log(`✓ seeded ${id} — "${demo.displayName}" (${demo.description})`);
    // touch generateSeed so the import isn't unused (we use deterministicSeed instead)
    void seed;
  }

  const count = await prisma.artwork.count();
  console.log(`\nDone. ${count} artwork(s) in database.`);

  // ============================================================
  // Planetary artworks — seed at specific moments in time
  // ============================================================

  await prisma.artwork.deleteMany({
    where: { id: { startsWith: "planetary-" } },
  });

  const planetaryMoments = [
    { id: "planetary-jul2026", timestamp: "2026-07-08T12:00:00.000Z", title: "July 8, 2026" },
    { id: "planetary-jan2026", timestamp: "2026-01-15T06:00:00.000Z", title: "January 15, 2026" },
    { id: "planetary-apr2025", timestamp: "2025-04-20T18:00:00.000Z", title: "April 20, 2025" },
  ];

  for (const moment of planetaryMoments) {
    const planetaryDNA = computePlanetaryDNA(moment.timestamp);

    // Synthesize a minimal soundtrack record (no real audio file)
    const soundtrack: Soundtrack = {
      id: `planetary-soundtrack-${moment.id}`,
      hash: "x".repeat(64), // placeholder hash; planetary artworks don't have audio
      originalFilename: "(planetary input — no audio file)",
      duration: 0,
      uploadedAt: new Date().toISOString(),
      url: "",
    };

    // Use neutral AudioDNA defaults (planetary artworks have audioDNA present
    // but it's not the active genome; the renderer reads planetaryDNA if present)
    const audioDNA = {
      tempo: 0,
      key: "C",
      mode: "major" as const,
      brightness: 0,
      warmth: 0,
      texture: 0,
      energy: 0,
      aggression: 0,
      complexity: 0,
      motion: 0,
      entropy: 0,
    };

    const shaderGraph: ShaderGraph = {
      ...defaultShaderGraph(),
      system: "cosmicFilaments", // uses the new Living System
      palette: "ink",
      camera: "meditationDrift",
      params: {
        ...defaultShaderGraph().params,
        particleCount: 30000, // more particles for the filament system
        noiseScale: 0.5,
        fieldStrength: 1.4,
      },
    };

    const id = moment.id;
    const artwork: Artwork = {
      id,
      seed: hashSeedForDemo(id),
      soundtrack,
      audioDNA,
      planetaryDNA,
      shaderGraph,
      createdAt: new Date().toISOString(),
      creator: "planetary-seed",
      title: moment.title,
    };

    await saveArtwork(artwork);
    console.log(
      `  ${moment.id}: ${moment.timestamp} → ${planetaryDNA.dominantElement} dominant, ${planetaryDNA.aspectCount} aspects, intensity ${planetaryDNA.chartIntensity.toFixed(2)}`,
    );
  }

  const finalCount = await prisma.artwork.count();
  console.log(`\nFinal: ${finalCount} artwork(s) in database.`);
  void finalCount;
  await seedSandTravelerArtworks();
}

async function seedSandTravelerArtworks() {
  await prisma.artwork.deleteMany({ where: { id: { startsWith: "sand-" } } });
  const sandSeeds = [
    { id: "sand-tarbell-port", title: "Sand Traveler" },
    { id: "sand-bone-reliquary", title: "Bone Reliquary" },
  ];
  for (const sand of sandSeeds) {
    const soundtrack: Soundtrack = {
      id: `sand-soundtrack-${sand.id}`,
      hash: "x".repeat(64),
      originalFilename: "(sand traveler — no audio file)",
      duration: 0,
      uploadedAt: new Date().toISOString(),
      url: "",
    };
    const audioDNA = {
      tempo: 0, key: "C", mode: "major" as const,
      brightness: 0, warmth: 0, texture: 0, energy: 0,
      aggression: 0, complexity: 0, motion: 0, entropy: 0,
    };
    const shaderGraph: ShaderGraph = {
      ...defaultShaderGraph(),
      system: "sandTraveler",
      palette: "bone",
      camera: "meditationDrift",
    };
    const artwork: Artwork = {
      id: sand.id,
      seed: hashSeedForDemo(sand.id),
      soundtrack,
      audioDNA,
      shaderGraph,
      createdAt: new Date().toISOString(),
      creator: "sand-seed",
      title: sand.title,
    };
    await saveArtwork(artwork);
    console.log(`  ${sand.id} — ${sand.title}`);
  }

  // ============================================================
  // Peter de Jong attractor artworks — Tarbell's 2004 piece.
  // 4K travelers iterate the de Jong map and accumulate ink.
  // ============================================================

  await prisma.artwork.deleteMany({
    where: { id: { startsWith: "dejong-" } },
  });

  const dejongSeeds = [
    { id: "dejong-bourke",   title: "Bourke Attractor" },
    { id: "dejong-ribbon",   title: "Ribbon Attractor" },
  ];

  for (const dj of dejongSeeds) {
    const soundtrack: Soundtrack = {
      id: `dejong-soundtrack-${dj.id}`,
      hash: "x".repeat(64),
      originalFilename: "(de jong — no audio file)",
      duration: 0,
      uploadedAt: new Date().toISOString(),
      url: "",
    };
    const audioDNA = {
      tempo: 0, key: "C", mode: "major" as const,
      brightness: 0, warmth: 0, texture: 0, energy: 0,
      aggression: 0, complexity: 0, motion: 0, entropy: 0,
    };
    const shaderGraph: ShaderGraph = {
      ...defaultShaderGraph(),
      system: "deJongAttractor",
      palette: "bone",
      camera: "meditationDrift",
    };
    const artwork: Artwork = {
      id: dj.id,
      seed: hashSeedForDemo(dj.id),
      soundtrack,
      audioDNA,
      shaderGraph,
      createdAt: new Date().toISOString(),
      creator: "dejong-seed",
      title: dj.title,
    };
    await saveArtwork(artwork);
    console.log(`  ${dj.id} — ${dj.title}`);
  }
}

// Deterministic seed for each demo so re-running seed gives the same Artwork.
function hashSeedForDemo(input: string): string {
  let h = 2166136261 >>> 0;
  for (let i = 0; i < input.length; i++) {
    h ^= input.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  // Expand to 32 hex chars
  const a = h.toString(16).padStart(8, "0");
  const b = (Math.imul(h, 16777619) >>> 0).toString(16).padStart(8, "0");
  const c = (Math.imul(h ^ 0x9e3779b9, 16777619) >>> 0).toString(16).padStart(8, "0");
  const d = (Math.imul(h ^ 0x85ebca6b, 16777619) >>> 0).toString(16).padStart(8, "0");
  return a + b + c + d;
}

main()
  .catch((err) => {
    console.error(err);
    process.exit(1);
  });

// silence the mulberry32 import — kept for future use
void mulberry32;