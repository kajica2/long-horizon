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
import { paletteNameFromVisualDNA } from "../lib/visual/dna";
import { visualBindingDelta } from "../lib/visual/bindings";
import type { VisualDNA } from "../lib/types";

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
// Forward declarations for helper functions used by main()
// (defined later in the file, but TS strict hoisting wants them visible).
// ============================================================

async function seedStage16To18Artworks(): Promise<void> {
  await prisma.artwork.deleteMany({
    where: {
      id: {
        in: [
          "rd-mitosis",
          "rd-stripes",
          "lorenz-butterfly",
          "lorenz-figure-eight",
          "physarum-network",
        ],
      },
    },
  });

  const stage1618Seeds: Array<{
    id: string;
    title: string;
    system: ShaderGraph["system"];
    palette: ShaderGraph["palette"];
    camera: ShaderGraph["camera"];
    params: Record<string, number>;
  }> = [
    {
      id: "rd-mitosis",
      title: "Mitosis",
      system: "reactionDiffusion",
      palette: "ember",
      camera: "drone",
      params: {
        feedRate: 0.0367,
        killRate: 0.0649,
        du: 1.0,
        dv: 0.5,
        dt: 1.0,
        stepsPerFrame: 5,
      },
    },
    {
      id: "rd-stripes",
      title: "Stripes",
      system: "reactionDiffusion",
      palette: "tide",
      camera: "drone",
      params: {
        feedRate: 0.022,
        killRate: 0.051,
        du: 1.0,
        dv: 0.5,
        dt: 1.0,
        stepsPerFrame: 5,
      },
    },
    {
      id: "lorenz-butterfly",
      title: "Lorenz Butterfly",
      system: "lorenzAttractor",
      palette: "ember",
      camera: "drone",
      params: {
        sigma: 10.0,
        rho: 28.0,
        beta: 8.0 / 3.0,
        dt: 0.005,
        trailLength: 8000,
        lineWidth: 1.2,
        fadeTail: 0.85,
      },
    },
    {
      id: "lorenz-figure-eight",
      title: "Lorenz Figure-Eight",
      system: "lorenzAttractor",
      palette: "aurora",
      camera: "orbit",
      params: {
        sigma: 10.0,
        rho: 28.0,
        beta: 8.0 / 3.0,
        dt: 0.005,
        trailLength: 6000,
        lineWidth: 1.6,
        fadeTail: 0.75,
      },
    },
    {
      id: "physarum-network",
      title: "Slime Mold Network",
      system: "physarum",
      palette: "moss",
      camera: "drone",
      params: {
        numAgents: 65536,
        sensorAngle: 22.5,
        sensorDistance: 9.0,
        stepSize: 1.0,
        turnRate: 45.0,
        decay: 0.92,
        diffuse: 0.5,
      },
    },
  ];

  for (const s of stage1618Seeds) {
    const shaderGraph: ShaderGraph = {
      ...defaultShaderGraph(),
      system: s.system,
      palette: s.palette,
      camera: s.camera,
      params: { ...defaultShaderGraph().params, ...s.params },
    };
    const artwork: Artwork = {
      id: s.id,
      seed: hashSeedForDemo(s.id),
      soundtrack: emptySoundtrack(),
      audioDNA: zeroAudioDNA(),
      shaderGraph,
      createdAt: new Date().toISOString(),
      creator: "stage1618-seed",
      title: s.title,
    };
    await saveArtwork(artwork);
    console.log(`  ${s.id} — ${s.title} (${s.system})`);
  }
}

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
  await seedDeJongAttractorArtworks();
  await seedStage16To18Artworks();
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
}

// ============================================================
// Peter de Jong attractor artworks — Tarbell's 2004 piece.
// 4K travelers iterate the de Jong map and accumulate ink.
// ============================================================

async function seedDeJongAttractorArtworks() {
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

  // --- Visual-driven seeds (action 13) -----------------------------
  // We don't bake an actual image — we synthesise a representative VisualDNA
  // for two stylised source images (warm sunset, cold moonscape). Real users
  // will upload their own image and hit /api/visual/dna.
  await prisma.artwork.deleteMany({ where: { id: { startsWith: "visual-" } } });
  const visualSeeds: Array<{ id: string; title: string; visualDNA: VisualDNA }> = [
    {
      id: "visual-warm-sunset",
      title: "Sunset over Weiti Creek",
      // Warm-dominant image: reds / oranges, mid brightness, high warmth,
      // moderate edge density, low texture complexity.
      visualDNA: {
        palette: ["#ff8a4a", "#9a3819", "#3a1a0a", "#fcb072", "#b2866a"],
        brightness: 0.65,
        contrast: 0.55,
        saturation: 0.78,
        warmth: 0.82,
        edgeDensity: 0.25,
        textureComplexity: 0.30,
        aspectRatio: 1.5,
        compositionalCenter: { x: 0.48, y: 0.62 },
        focalDistance: 0.42,
        hash: "deterministic-warm-sunset-v1",
      },
    },
    {
      id: "visual-cold-moonscape",
      title: "Highland Moonscape",
      // Cool-dominant image: blues / greys, low brightness, low warmth,
      // high edge density (sharp ridges), moderate texture.
      visualDNA: {
        palette: ["#3a4a8a", "#0a0d2a", "#7080a0", "#101020", "#aab0c0"],
        brightness: 0.28,
        contrast: 0.62,
        saturation: 0.30,
        warmth: 0.18,
        edgeDensity: 0.55,
        textureComplexity: 0.55,
        aspectRatio: 1.78,
        compositionalCenter: { x: 0.5, y: 0.45 },
        focalDistance: 0.32,
        hash: "deterministic-cold-moonscape-v1",
      },
    },
    {
      id: "visual-aurora",
      title: "Aurora Borealis, Tromsø",
      // Green-blue dominant, luminous, low-medium texture.
      visualDNA: {
        palette: ["#6ad0a0", "#1a3a6a", "#3a6a8a", "#0a1a30", "#9ae8c0"],
        brightness: 0.42,
        contrast: 0.48,
        saturation: 0.55,
        warmth: 0.42,
        edgeDensity: 0.18,
        textureComplexity: 0.22,
        aspectRatio: 1.6,
        compositionalCenter: { x: 0.5, y: 0.3 },
        focalDistance: 0.48,
        hash: "deterministic-aurora-v1",
      },
    },
    {
      id: "visual-bone",
      title: "Bone Lithograph",
      // Near-greyscale, very low saturation, high edge density (fine linework).
      visualDNA: {
        palette: ["#d8c8b0", "#18120c", "#a89070", "#2a2018", "#80684a"],
        brightness: 0.55,
        contrast: 0.72,
        saturation: 0.15,
        warmth: 0.55,
        edgeDensity: 0.62,
        textureComplexity: 0.42,
        aspectRatio: 1.0,
        compositionalCenter: { x: 0.5, y: 0.5 },
        focalDistance: 0.22,
        hash: "deterministic-bone-lithograph-v1",
      },
    },
    {
      id: "visual-moss",
      title: "Moss on Slate",
      // Mid-green dominant, earthy warmth, rich texture.
      visualDNA: {
        palette: ["#5a6a3a", "#1a2010", "#7a8a5a", "#2a3018", "#3a4a20"],
        brightness: 0.45,
        contrast: 0.38,
        saturation: 0.42,
        warmth: 0.45,
        edgeDensity: 0.40,
        textureComplexity: 0.72,
        aspectRatio: 1.4,
        compositionalCenter: { x: 0.5, y: 0.5 },
        focalDistance: 0.35,
        hash: "deterministic-moss-v1",
      },
    },
  ];
  for (const v of visualSeeds) {
    const seed = hashSeedForDemo(v.id);
    const shaderGraph = defaultShaderGraph();
    // Inject the visual-DNA-informed param deltas
    const deltas = visualBindings(v.visualDNA);
    shaderGraph.params = {
      ...shaderGraph.params,
      ...deltas,
    };
    shaderGraph.palette = palFromVisual(v.visualDNA);
    const artwork: Artwork = {
      id: v.id,
      seed,
      soundtrack: emptySoundtrack(),
      audioDNA: zeroAudioDNA(),
      visualDNA: v.visualDNA,
      shaderGraph,
      createdAt: new Date().toISOString(),
      creator: "visual-seed",
      title: v.title,
    };
    await saveArtwork(artwork);
    console.log(`  ${v.id} — ${v.title}`);
  }
}

// Helpers for visual-DNA-driven seeds (action 13)
function visualBindings(dna: VisualDNA): Record<string, number> {
  return visualBindingDelta(dna) as Record<string, number>;
}
function palFromVisual(dna: VisualDNA) {
  return paletteNameFromVisualDNA(dna);
}
function emptySoundtrack(): Soundtrack {
  // Image-driven seeds have no audio; the engine still needs a placeholder Soundtrack.
  return {
    id: "none",
    hash: "0000000000000000000000000000000000000000000000000000000000000000",
    originalFilename: "",
    duration: 0,
    uploadedAt: new Date().toISOString(),
    url: "",
  };
}
function zeroAudioDNA(): import("../lib/types").AudioDNA {
  return {
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
}
const _visual_dummy: VisualDNA = {
  palette: ["#000000", "#000000", "#000000", "#000000", "#000000"],
  brightness: 0,
  contrast: 0,
  saturation: 0,
  warmth: 0,
  edgeDensity: 0,
  textureComplexity: 0,
  aspectRatio: 1,
  compositionalCenter: { x: 0.5, y: 0.5 },
  focalDistance: 0,
  hash: "",
};
void _visual_dummy;

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