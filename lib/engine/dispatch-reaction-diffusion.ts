/**
 * Reaction-Diffusion — system dispatch manifest.
 *
 * The orchestrator imports this and registers the system with the
 * engine store. Mirrors the shape of the manifest slice description
 * in the slice spec: name, displayName, description, defaultParams,
 * audioBindings, palettes, camera, paramRanges.
 *
 * The `component` field is the string name of the R3F component in
 * `components/engine/`. EngineCanvas.tsx switches on this to mount
 * the correct visual layer.
 */

import type { AudioBand, CameraMode, PaletteName } from "@/lib/types";

export type ReactionDiffusionParamKey =
  | "feedRate"
  | "killRate"
  | "du"
  | "dv"
  | "dt"
  | "stepsPerFrame";

export type ReactionDiffusionParamRange = readonly [number, number];

/**
 * The orchestrator adds this literal to the `LivingSystemName` union
 * in `lib/types.ts` after Wave 1 ships. Until then we keep it as a
 * standalone `const` — the string identity is stable.
 */
export const REACTION_DIFFUSION_NAME = "reactionDiffusion" as const;

export type ReactionDiffusionManifest = {
  name: typeof REACTION_DIFFUSION_NAME;
  displayName: string;
  description: string;
  /** String name of the component — used by EngineCanvas.tsx for dispatch. */
  component: "ReactionDiffusion";
  defaultParams: Record<ReactionDiffusionParamKey, number>;
  audioBindings: Record<AudioBand, ReactionDiffusionParamKey>;
  palettes: readonly PaletteName[];
  camera: CameraMode;
  paramRanges: Record<ReactionDiffusionParamKey, ReactionDiffusionParamRange>;
};

export const REACTION_DIFFUSION: ReactionDiffusionManifest = {
  name: REACTION_DIFFUSION_NAME,
  displayName: "Reaction-Diffusion",
  description: "Turing patterns from the Gray-Scott reaction",
  component: "ReactionDiffusion",
  defaultParams: {
    feedRate: 0.0367,
    killRate: 0.0649,
    du: 1.0,
    dv: 0.5,
    dt: 1.0,
    stepsPerFrame: 5,
  },
  audioBindings: {
    bass: "feedRate",
    mid: "killRate",
    treble: "stepsPerFrame",
    vocals: "dt",
  },
  palettes: ["aurora", "ember", "tide", "ink", "bone", "moss"] as const,
  camera: "drone" as const,
  paramRanges: {
    feedRate: [0.01, 0.08],
    killRate: [0.04, 0.07],
    du: [0.5, 1.5],
    dv: [0.2, 0.7],
    dt: [0.5, 1.5],
    stepsPerFrame: [1, 20],
  },
};
