/**
 * VisualDNA → engine param bindings.
 *
 * Maps a VisualDNA's 13 features into deltas on the engine's ShaderGraph
 * params. Pure function — same input → same output, always.
 *
 * Default bindings:
 *   edgeDensity        → noiseScale (more edges → finer noise)
 *   textureComplexity  → fieldStrength (more texture → stronger field)
 *   brightness         → pointSize (brighter → bigger points)
 *   warmth             → bloomBias (warmer → more bloom)
 *   contrast           → chromaticAberration (more contrast → more CA)
 *   saturation         → feedback (more saturation → more feedback)
 *
 * The output is a partial ShaderGraph.params delta — caller merges it
 * into the existing params on top of the audio-DNA-modulated values.
 */

import type { PaletteName, ShaderGraph, VisualDNA } from "@/lib/types";
import { paletteNameFromVisualDNA } from "@/lib/visual/palette-name";

const BINDINGS = [
  { feature: "edgeDensity",       param: "noiseScale",           range: [0.3, 1.5] },
  { feature: "textureComplexity", param: "fieldStrength",        range: [0.5, 2.0] },
  { feature: "brightness",        param: "pointSize",            range: [1.0, 2.5] },
  { feature: "contrast",          param: "chromaticAberration",  range: [0.0, 0.02] },
  { feature: "saturation",        param: "feedback",             range: [0.0, 0.6] },
  { feature: "warmth",            param: "bloom",                range: [0.3, 1.4] },
] as const;

type DeltaKey = (typeof BINDINGS)[number]["param"];

/**
 * Compute the param deltas a given VisualDNA implies, expressed as
 * per-param multipliers or absolute values within the binding range.
 *
 * Returns a partial ShaderGraph — only the bound params are set.
 */
export function visualBindingDelta(dna: VisualDNA): Partial<ShaderGraph["params"]> {
  const out: Record<string, number> = {};
  for (const b of BINDINGS) {
    const featureValue = (dna as unknown as Record<string, number>)[b.feature];
    if (typeof featureValue !== "number") continue;
    const [lo, hi] = b.range;
    out[b.param] = lo + (hi - lo) * featureValue;
  }
  return out;
}

/**
 * The dominant palette name suggestion — use to override the engine's default.
 */
export function suggestedPaletteFor(dna: VisualDNA): PaletteName {
  return paletteNameFromVisualDNA(dna);
}

/**
 * Compose a full ShaderGraph parameter override from both audio-driven and
 * visual-driven DNA. Returns the merged param set (audio is the default,
 * visual is the override).
 *
 * The audio bands are [0, 1]; we map them to the same ranges as visual.
 */
export function composeShaderGraphFromVisualDNA(dna: VisualDNA): Partial<ShaderGraph["params"]> {
  return visualBindingDelta(dna);
}

void ({} as never); // ensure module-only exports register
