/**
 * Dispatch Registry — single source of truth for Living System routing.
 *
 * Aggregates the per-system `dispatch-*.ts` manifests into a uniform
 * `DISPATCH_REGISTRY` keyed by LivingSystemName. This is the contract
 * between:
 *   - the engine orchestrator (EngineCanvas, ShareableViewer),
 *   - the engine store (`resetParams` lookup),
 *   - the per-system dispatch manifests owned by system workers.
 *
 * Adding a new Living System requires only:
 *   1. Author `lib/engine/dispatch-<name>.ts` exporting the manifest.
 *   2. Add it to `DISPATCH_REGISTRY` below.
 *   3. Map its `component` string in `registry-routed-engine.tsx`'s
 *      `COMPONENT_MAP`.
 *
 * No edits to EngineCanvas.tsx, ShareableViewer.tsx, or store.ts
 * `resetParams` are required.
 *
 * The five legacy systems (flowFieldMeditation, cosmicFilaments,
 * sandTraveler, deJongAttractor, birthChart) don't yet have
 * `dispatch-*.ts` files — their manifests are hand-built here from
 * existing constants (FLOW_FIELD_MEDITATION in lib/types.ts and the
 * `defaultParamsFor` function in ParameterPanel.tsx). When those
 * workers ship their own dispatch files, the inline manifests below
 * will be replaced by imports from them, leaving this file as the
 * pure assembler.
 */

import type {
  AudioBand,
  CameraMode,
  LivingSystemName,
  PaletteName,
} from "@/lib/types";
import { FLOW_FIELD_MEDITATION } from "@/lib/types";

import { REACTION_DIFFUSION } from "./dispatch-reaction-diffusion";
import { LORENZ_ATTRACTOR } from "./dispatch-lorenz-attractor";
import { PHYSARUM } from "./dispatch-physarum";

// ============================================================
// Public manifest shape (the contract)
// ============================================================

/**
 * A single Living System's dispatch manifest, in its uniform registry
 * shape. The five legacy systems construct this directly; the three
 * new systems (RD, LZ, PM) already conform to it.
 *
 * Permissive on `defaultParams` (Record<string, number>) and
 * `audioBindings` (Record<AudioBand, string>) so the three existing
 * per-system files can be stored in the registry without reshaping.
 */
export type DispatchManifest = {
  name: LivingSystemName;
  displayName: string;
  description: string;
  component: string;
  defaultParams: Record<string, number>;
  audioBindings: Record<AudioBand, string>;
  palettes: readonly PaletteName[];
  camera: CameraMode;
  paramRanges: Record<string, readonly [number, number]>;
};

// ============================================================
// Legacy manifests (hand-built from existing constants)
// ============================================================

/**
 * Flow Field Meditation — millions of particles drifting through
 * harmonic-ratio-derived currents. Source of truth for params:
 * `FLOW_FIELD_MEDITATION.defaultParams` in lib/types.ts.
 */
const FLOW_FIELD_MEDITATION_MANIFEST: DispatchManifest = {
  name: "flowFieldMeditation",
  displayName: "Flow Field Meditation",
  description: FLOW_FIELD_MEDITATION.description,
  component: "ParticleSystem",
  defaultParams: { ...FLOW_FIELD_MEDITATION.defaultParams },
  audioBindings: {
    bass: FLOW_FIELD_MEDITATION.defaultAudioBindings.bass,
    mid: FLOW_FIELD_MEDITATION.defaultAudioBindings.mid,
    treble: FLOW_FIELD_MEDITATION.defaultAudioBindings.treble,
    vocals: FLOW_FIELD_MEDITATION.defaultAudioBindings.vocals,
  },
  palettes: ["aurora", "ember", "tide", "ink", "bone", "moss"],
  camera: "drone",
  paramRanges: {
    particleCount: [50_000, 1_000_000],
    noiseScale: [0.1, 2.5],
    fieldStrength: [0, 3],
    drag: [0, 0.3],
    spawnRadius: [2, 20],
    maxAge: [2, 30],
    pointSize: [0.4, 4.0],
  },
};

/**
 * Cosmic Filaments — curve-accumulated threads through a cosmological
 * noise field. Mirrors the `defaultParamsFor` branch in
 * ParameterPanel.tsx and the engine store's resetParams.
 */
const COSMIC_FILAMENTS_MANIFEST: DispatchManifest = {
  name: "cosmicFilaments",
  displayName: "Cosmic Filaments",
  description:
    "Curve-accumulated threads through a cosmological noise field, " +
    "threading through regions of high gravitational potential.",
  component: "CosmicFilaments",
  defaultParams: {
    particleCount: 30_000,
    noiseScale: 0.5,
    fieldStrength: 1.4,
    drag: 0.05,
    spawnRadius: 7.0,
    pointSize: 1.2,
  },
  audioBindings: {
    bass: "fieldStrength",
    mid: "drag",
    treble: "noiseScale",
    vocals: "pointSize",
  },
  palettes: ["aurora", "ember", "tide", "ink", "bone", "moss"],
  camera: "meditationDrift",
  paramRanges: {
    particleCount: [5_000, 60_000],
    noiseScale: [0.1, 2.0],
    fieldStrength: [0.2, 3.0],
    drag: [0.0, 0.3],
    spawnRadius: [2.0, 14.0],
    pointSize: [0.4, 3.0],
  },
};

/**
 * Sand Traveler — Tarbell's reaction-diffusion-on-sand. The simulation
 * is largely fixed (no user-tunable physics knobs); the registry
 * exposes an empty param set so resetParams is a no-op for this system.
 */
const SAND_TRAVELER_MANIFEST: DispatchManifest = {
  name: "sandTraveler",
  displayName: "Sand Traveler",
  description:
    "Tarbell's sand-traveler reaction: persistent trails of grains " +
    "settling into fractal dunes under simulated wind.",
  component: "SandTraveler",
  defaultParams: {},
  audioBindings: {
    bass: "bloom",
    mid: "bloom",
    treble: "bloom",
    vocals: "bloom",
  },
  palettes: ["aurora", "ember", "tide", "ink", "bone", "moss"],
  camera: "drone",
  paramRanges: {},
};

/**
 * de Jong Attractor — Tarbell's 2D parametric attractor. Also largely
 * fixed-tunable; param set is empty so resetParams is a no-op.
 */
const DE_JONG_ATTRACTOR_MANIFEST: DispatchManifest = {
  name: "deJongAttractor",
  displayName: "de Jong Attractor",
  description:
    "Peter de Jong's parametric 2D attractor, generating endlessly " +
    "detailed webs of light through four sine waves.",
  component: "DeJongAttractor",
  defaultParams: {},
  audioBindings: {
    bass: "bloom",
    mid: "bloom",
    treble: "bloom",
    vocals: "bloom",
  },
  palettes: ["aurora", "ember", "tide", "ink", "bone", "moss"],
  camera: "drone",
  paramRanges: {},
};

/**
 * Birth Chart — 3D natal-chart visualisation. Not parameter-driven;
 * the artwork is determined by the user's birth data and the moment
 * in time. Registry keeps the entry so the engine can dispatch to it
 * and resetParams is a no-op.
 */
const BIRTH_CHART_MANIFEST: DispatchManifest = {
  name: "birthChart",
  displayName: "Birth Chart",
  description:
    "3D natal chart: ten planetary bodies arrayed on the zodiac wheel " +
    "with the major aspects drawn as connecting lines.",
  component: "BirthChartScene",
  defaultParams: {},
  audioBindings: {
    bass: "bloom",
    mid: "bloom",
    treble: "bloom",
    vocals: "bloom",
  },
  palettes: ["aurora", "ember", "tide", "ink", "bone", "moss"],
  camera: "orbit",
  paramRanges: {},
};

// ============================================================
// Adapter for the three typed manifests (RD, LZ, PM)
// ============================================================

/**
 * The three new-system manifests already conform to the registry
 * shape — they're objects with the right fields. We assert via a
 * narrow type here rather than re-shape, because the per-system
 * files own their param-key types and we don't want to lose that
 * type information at their import sites.
 */
function rebrand<T extends DispatchManifest>(m: T): T {
  return m;
}

// ============================================================
// Registry assembly
// ============================================================

export const DISPATCH_REGISTRY: Record<LivingSystemName, DispatchManifest> = {
  flowFieldMeditation: FLOW_FIELD_MEDITATION_MANIFEST,
  cosmicFilaments: COSMIC_FILAMENTS_MANIFEST,
  sandTraveler: SAND_TRAVELER_MANIFEST,
  deJongAttractor: DE_JONG_ATTRACTOR_MANIFEST,
  birthChart: BIRTH_CHART_MANIFEST,
  reactionDiffusion: rebrand(REACTION_DIFFUSION as unknown as DispatchManifest),
  lorenzAttractor: rebrand(LORENZ_ATTRACTOR as unknown as DispatchManifest),
  physarum: rebrand(PHYSARUM as unknown as DispatchManifest),
};

/**
 * Look up a dispatch manifest by Living System name. Returns
 * `undefined` for unknown names so callers can decide their fallback
 * (EngineCanvas/ShareableViewer render nothing in that case).
 */
export function getDispatch(system: string): DispatchManifest | undefined {
  return DISPATCH_REGISTRY[system as LivingSystemName];
}

/**
 * All registered Living Systems, ordered by their appearance in
 * `LivingSystemName`. Useful for gallery rendering and admin views.
 */
export function listDispatchManifests(): DispatchManifest[] {
  return Object.values(DISPATCH_REGISTRY);
}