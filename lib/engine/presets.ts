/**
 * Engine parameter presets — quick-load starting points.
 *
 * Each preset is a (mostly) complete ShaderGraph. The user clicks a
 * preset in the parameter panel and the engine's params (and
 * optionally camera + palette) snap to the preset values.
 *
 * Inspired by historic generative art moments:
 *   - "Tarbell 2004" — Jared Tarbell's early software art
 *   - "Soft Machine" — Vorticist/lithograph grain
 *   - "NSynth" — Magenta's neural synth aesthetic
 *   - "Planetary Dawn" — cosmic filaments at sunrise
 *   - "Lichen Field" — moss / lichen growth
 *   - "Bone Lithograph" — high-contrast ink lines
 *   - "Strobe Test" — extreme feedback for strobing
 *
 * Presets never replace the user's authored values. The store keeps the
 * current params and a snapshot of "before preset" so the user can
 * revert with one click.
 */

import type { ShaderGraph, PaletteName } from "@/lib/types";

export interface Preset {
  id: string;
  name: string;
  description: string;
  system: ShaderGraph["system"];
  params: Record<string, number>;
  camera?: ShaderGraph["camera"];
  palette?: PaletteName;
  postFx?: Partial<ShaderGraph["postFx"]>;
  audioBindings?: ShaderGraph["audioBindings"];
}

export const PRESETS: Preset[] = [
  {
    id: "tarbell-2004",
    name: "Tarbell 2004",
    description:
      "Jared Tarbell's early software art era — emergent, slow, monochrome.",
    system: "sandTraveler",
    params: {
      particles: 200,
      tripDistance: 36,
      brightnessDecay: 0.94,
      lineWeight: 0.65,
      stepLength: 1.6,
    },
    camera: "meditationDrift",
    palette: "bone",
  },
  {
    id: "soft-machine",
    name: "Soft Machine",
    description:
      "Vorticist grain. Cream paper, slow ink accumulation, mid-century lithograph.",
    system: "deJongAttractor",
    params: {
      travelers: 4000,
      maxAge: 200,
      a: 1.641,
      b: 1.502,
      c: 0.823,
      d: 1.110,
    },
    camera: "meditationDrift",
    palette: "ink",
  },
  {
    id: "nsynth",
    name: "NSynth",
    description: "Magenta's neural synth — dense, high-energy, audio-reactive.",
    system: "flowFieldMeditation",
    params: {
      particleCount: 250_000,
      noiseScale: 0.85,
      fieldStrength: 1.6,
      drag: 0.04,
      pointSize: 2.0,
    },
    postFx: {
      bloom: 1.4,
      chromaticAberration: 0.012,
      filmGrain: 0.04,
      feedback: 0.4,
    },
    palette: "aurora",
    camera: "drone",
  },
  {
    id: "planetary-dawn",
    name: "Planetary Dawn",
    description: "Cosmic filaments at sunrise — long ribbons, meditation drift.",
    system: "cosmicFilaments",
    params: {
      lineCount: 80,
      length: 1500,
      curlScale: 0.5,
      noiseOctaves: 3,
    },
    camera: "meditationDrift",
    palette: "ember",
  },
  {
    id: "lichen-field",
    name: "Lichen Field",
    description: "Moss / lichen growth — fractal, slow, organic.",
    system: "flowFieldMeditation",
    params: {
      particleCount: 150_000,
      noiseScale: 0.35,
      fieldStrength: 0.6,
      drag: 0.12,
      pointSize: 1.5,
    },
    postFx: {
      bloom: 0.5,
      chromaticAberration: 0.001,
      filmGrain: 0.08,
      feedback: 0.0,
    },
    palette: "moss",
    camera: "drone",
  },
  {
    id: "bone-lithograph",
    name: "Bone Lithograph",
    description: "High-contrast ink lines, no bloom, no glow. Bone on paper.",
    system: "cosmicFilaments",
    params: {
      lineCount: 40,
      length: 2200,
      curlScale: 0.7,
      noiseOctaves: 5,
    },
    postFx: {
      bloom: 0.0,
      chromaticAberration: 0.0,
      filmGrain: 0.18,
      feedback: 0.0,
    },
    palette: "bone",
    camera: "meditationDrift",
  },
  {
    id: "strobe-test",
    name: "Strobe Test",
    description:
      "Extreme feedback and bloom — for testing how the engine handles pressure.",
    system: "flowFieldMeditation",
    params: {
      particleCount: 200_000,
      noiseScale: 1.2,
      fieldStrength: 2.5,
      drag: 0.02,
      pointSize: 3.0,
    },
    postFx: {
      bloom: 2.0,
      chromaticAberration: 0.025,
      filmGrain: 0.0,
      feedback: 0.85,
    },
    palette: "ember",
    camera: "orbit",
  },
];

/** Look up a preset by id. */
export function getPreset(id: string): Preset | undefined {
  return PRESETS.find((p) => p.id === id);
}

/** Apply a preset to a ShaderGraph (returns a new graph). */
export function applyPreset(graph: ShaderGraph, preset: Preset): ShaderGraph {
  return {
    ...graph,
    system: preset.system,
    params: { ...graph.params, ...preset.params },
    camera: preset.camera ?? graph.camera,
    palette: preset.palette ?? graph.palette,
    postFx: preset.postFx ? { ...graph.postFx, ...preset.postFx } : graph.postFx,
    audioBindings: preset.audioBindings ?? graph.audioBindings,
  };
}

/**
 * Stable hash for a preset (for caching / comparing).
 */
export function presetHash(preset: Preset): string {
  return preset.id;
}

/** Preset list grouped by system, for the UI. */
export function presetsBySystem(): Record<ShaderGraph["system"], Preset[]> {
  const out: Record<ShaderGraph["system"], Preset[]> = {
    flowFieldMeditation: [],
    cosmicFilaments: [],
    sandTraveler: [],
    deJongAttractor: [],
    birthChart: [],
    reactionDiffusion: [],
    lorenzAttractor: [],
    physarum: [],
  };
  for (const p of PRESETS) {
    if (out[p.system]) out[p.system].push(p);
  }
  return out;
}