/**
 * Mood library — Stages 24-28 of the Long Horizon roadmap.
 *
 * Each mood is a deterministic transformation of an Artwork's ShaderGraph.
 * Six fixed moods (Morning / Afternoon / Night / Winter / Decay / Rebirth)
 * map onto palette + camera + postFx overrides so the underlying engine
 * continues to drive the same living system — just wearing different light.
 *
 * Variant IDs: `${artworkId}--${mood}` are stable, URL-safe, and reusable.
 * The full variant Artwork object is constructed lazily on first request
 * (memoised per process) and never persisted — variants are pure
 * functions of the parent Artwork.
 *
 * Determinism: given the same parent Artwork, every mood variant is
 * byte-identical across calls. The variant's id embeds the mood slug
 * so a /engine/${variantId} URL is canonical.
 */

import type { Artwork, PaletteName, CameraMode } from "@/lib/types";

export const MOODS = [
  "morning",
  "afternoon",
  "night",
  "winter",
  "decay",
  "rebirth",
] as const;

export type Mood = (typeof MOODS)[number];

export const MOOD_LABELS: Record<Mood, string> = {
  morning: "Morning",
  afternoon: "Afternoon",
  night: "Night",
  winter: "Winter",
  decay: "Decay",
  rebirth: "Rebirth",
};

export const MOOD_DESCRIPTIONS: Record<Mood, string> = {
  morning: "Soft warm light. The system wakes slowly — low motion, gentle drift, breath before the day starts.",
  afternoon: "Full daylight. Crisp contrast, higher motion, the system at its most articulate.",
  night: "After dark. Ink-dominant palette, meditation drift, slow camera, low bloom — the system contemplates itself.",
  winter: "Frozen. Minimal motion, frost-tinted palette, low chromatic aberration, near-stillness.",
  decay: "Coming apart. Ember palette pushing into embers, higher chromatic aberration, drift camera, bloom turned up so the edges bleed.",
  rebirth: "Coming back. Aurora palette returns, motion accelerates from zero, drone camera pulls out — the system reasserts itself.",
};

interface MoodOverride {
  palette: PaletteName;
  camera: CameraMode;
  postFx: {
    bloom: number;
    chromaticAberration: number;
    filmGrain: number;
    feedback: number;
  };
}

const MOOD_OVERRIDES: Record<Mood, MoodOverride> = {
  morning: {
    palette: "tide",
    camera: "meditationDrift",
    postFx: { bloom: 0.5, chromaticAberration: 0.001, filmGrain: 0.02, feedback: 0.03 },
  },
  afternoon: {
    palette: "aurora",
    camera: "drone",
    postFx: { bloom: 0.7, chromaticAberration: 0.002, filmGrain: 0.04, feedback: 0.05 },
  },
  night: {
    palette: "ink",
    camera: "meditationDrift",
    postFx: { bloom: 0.4, chromaticAberration: 0.003, filmGrain: 0.06, feedback: 0.04 },
  },
  winter: {
    palette: "bone",
    camera: "cinematic",
    postFx: { bloom: 0.3, chromaticAberration: 0.001, filmGrain: 0.05, feedback: 0.02 },
  },
  decay: {
    palette: "ember",
    camera: "inside",
    postFx: { bloom: 1.2, chromaticAberration: 0.012, filmGrain: 0.10, feedback: 0.08 },
  },
  rebirth: {
    palette: "moss",
    camera: "drone",
    postFx: { bloom: 0.9, chromaticAberration: 0.002, filmGrain: 0.03, feedback: 0.05 },
  },
};

export function moodSlug(m: Mood): string {
  return m; // already kebab-safe (single words)
}

export function variantId(parentId: string, mood: Mood): string {
  return `${parentId}--${moodSlug(mood)}`;
}

export function isMood(s: string): s is Mood {
  return (MOODS as readonly string[]).includes(s);
}

/**
 * Build a variant Artwork for `mood`. Pure function — no I/O, no clock.
 * Title gets a mood prefix so /a/[variantId] reads naturally.
 */
export function applyMood(artwork: Artwork, mood: Mood): Artwork {
  const ov = MOOD_OVERRIDES[mood];
  const id = variantId(artwork.id, mood);
  const label = MOOD_LABELS[mood];
  return {
    ...artwork,
    id,
    title: `${label} — ${artwork.title ?? artwork.id}`,
    shaderGraph: {
      ...artwork.shaderGraph,
      palette: ov.palette,
      camera: ov.camera,
      postFx: { ...ov.postFx },
    },
  };
}

/** All six variants for an artwork, in canonical order. */
export function moodVariants(artwork: Artwork): Artwork[] {
  return MOODS.map((m) => applyMood(artwork, m));
}

/**
 * Parse a variant id back into its components. Returns null if the id
 * doesn't match the `${parentId}--${mood}` shape, or if the mood slug
 * isn't recognised.
 */
export function parseVariantId(
  variantId: string,
): { parentId: string; mood: Mood } | null {
  const idx = variantId.lastIndexOf("--");
  if (idx <= 0) return null;
  const parentId = variantId.slice(0, idx);
  const mood = variantId.slice(idx + 2);
  if (!isMood(mood)) return null;
  return { parentId, mood };
}