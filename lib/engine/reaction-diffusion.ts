/**
 * Gray-Scott Reaction-Diffusion — two-species Turing pattern simulator.
 *
 * Models two concentrations u and v on a 2D grid evolving via the PDE
 *
 *   ∂u/∂t = D_u * ∇²u − u·v² + F · (1 − u)
 *   ∂v/∂t = D_v * ∇²v + u·v² − (F + k) · v
 *
 * with periodic boundary conditions. Different (F, k) pairs select
 * the Turing-pattern regime — spots, stripes, mazes, mitosis, etc.
 *
 * Implementation: CPU forward-Euler with a ping-pong buffer pair so
 * we never allocate inside `stepReactionDiffusion`. Defaults are in
 * the mitosis regime (F=0.0367, k=0.0649) which produces visibly
 * different cells within ~2000 steps.
 *
 * Reproducibility: same (seed, F, k, dt) → identical (u, v) at any
 * step index. All randomness is sourced from `mulberry32(hashSeed(seed))`
 * so the initial perturbation is fully determined by the seed.
 */

import { mulberry32, hashSeed } from "@/lib/seed";
import type { PaletteName } from "@/lib/types";

// ============================================================
// Constants & defaults
// ============================================================

/** Default diffusion rates (dimensionless). */
export const DEFAULT_DU = 1.0;
export const DEFAULT_DV = 0.5;

/** Default feed (F) and kill (k) rates — mitosis regime. */
export const DEFAULT_FEED_RATE = 0.0367;
export const DEFAULT_KILL_RATE = 0.0649;

/** Default time step. 1.0 is the standard value for the classic Gray-Scott PDE. */
export const DEFAULT_DT = 1.0;

/** Default simulation grid — 256×256 converges to a visually rich state in ~2000 steps. */
export const DEFAULT_GRID_WIDTH = 256;
export const DEFAULT_GRID_HEIGHT = 256;

/** Known (F, k) presets that produce visually distinct regimes. */
export const REACTION_DIFFUSION_PRESETS = {
  spots:    { F: 0.0367, k: 0.0649 } as const, // mitosis / "U-skate" — replicating dots
  coral:    { F: 0.0625, k: 0.0625 } as const, // coral growth
  mitosis:  { F: 0.0367, k: 0.0649 } as const,
  spots2:   { F: 0.030,  k: 0.062 }  as const,
  stripes:  { F: 0.022,  k: 0.051 }  as const,
  maze:     { F: 0.029,  k: 0.057 }  as const,
  holes:    { F: 0.039,  k: 0.058 }  as const,
  chaos:    { F: 0.026,  k: 0.051 }  as const,
  worms:    { F: 0.078,  k: 0.061 }  as const,
} as const;

// ============================================================
// Palette → RGB lookup
// ============================================================

/**
 * Mapping from the engine's 6 named palettes to a 5-stop gradient
 *   backgroundStart → backgroundEnd → mid → foregroundStart → foregroundEnd
 * The simulator color-maps `v` along this gradient (low v → background,
 * high v → foreground) so a single field produces a coherent image.
 */
export type PaletteColors = {
  backgroundStart: [number, number, number];
  backgroundEnd:   [number, number, number];
  foregroundStart: [number, number, number];
  foregroundEnd:   [number, number, number];
};

export const REACTION_DIFFUSION_PALETTES: Record<PaletteName, PaletteColors> = {
  aurora: {
    backgroundStart: [6, 12, 28],
    backgroundEnd:   [24, 38, 70],
    foregroundStart: [124, 58, 237],
    foregroundEnd:   [236, 72, 153],
  },
  ember: {
    backgroundStart: [16, 6, 4],
    backgroundEnd:   [60, 18, 8],
    foregroundStart: [245, 158, 11],
    foregroundEnd:   [253, 224, 71],
  },
  tide: {
    backgroundStart: [4, 18, 28],
    backgroundEnd:   [8, 78, 100],
    foregroundStart: [8, 145, 178],
    foregroundEnd:   [103, 232, 249],
  },
  ink: {
    backgroundStart: [12, 14, 20],
    backgroundEnd:   [30, 41, 59],
    foregroundStart: [148, 163, 184],
    foregroundEnd:   [226, 232, 240],
  },
  bone: {
    backgroundStart: [32, 28, 22],
    backgroundEnd:   [80, 70, 52],
    foregroundStart: [212, 197, 169],
    foregroundEnd:   [245, 240, 224],
  },
  moss: {
    backgroundStart: [10, 22, 8],
    backgroundEnd:   [28, 52, 16],
    foregroundStart: [101, 163, 13],
    foregroundEnd:   [190, 242, 100],
  },
};

// ============================================================
// State
// ============================================================

export type ReactionDiffusionParams = {
  du: number;     // diffusion rate of u
  dv: number;     // diffusion rate of v
  F: number;      // feed rate
  k: number;      // kill rate
  dt: number;     // Euler time step
};

export type ReactionDiffusionState = {
  /** Active u concentrations (length = width * height). */
  u: Float32Array;
  /** Active v concentrations (length = width * height). */
  v: Float32Array;
  /** Ping-pong partner for u (next step's output). */
  uNext: Float32Array;
  /** Ping-pong partner for v. */
  vNext: Float32Array;
  /** Grid dims. */
  width: number;
  height: number;
  /** Physics params. */
  params: ReactionDiffusionParams;
  /** Step counter. */
  frame: number;
  /** Seeded RNG — reused by reset for determinism. */
  rng: () => number;
  /** Original seed (kept for diagnostics / re-derivations). */
  seed: string;
};

// ============================================================
// Initialization
// ============================================================

export type CreateReactionDiffusionOpts = {
  seed: string;
  width?: number;
  height?: number;
  F?: number;
  k?: number;
  du?: number;
  dv?: number;
  dt?: number;
};

/**
 * Create a fresh simulator state. The grid is initialized to the
 * trivial equilibrium (u=1, v=0) with a seeded square of perturbation
 * in the center. The seeded RNG is stored in the state and reused
 * by `resetReactionDiffusion` so determinism holds across resets.
 */
export function createReactionDiffusionState(
  opts: CreateReactionDiffusionOpts,
): ReactionDiffusionState {
  const width = opts.width ?? DEFAULT_GRID_WIDTH;
  const height = opts.height ?? DEFAULT_GRID_HEIGHT;
  const seedU32 = hashSeed(opts.seed);
  const rng = mulberry32(seedU32);

  const size = width * height;
  const u = new Float32Array(size);
  const v = new Float32Array(size);
  const uNext = new Float32Array(size);
  const vNext = new Float32Array(size);

  // Default equilibrium: u=1, v=0 everywhere.
  u.fill(1.0);
  v.fill(0.0);

  // Center perturbation block — a stable starting pattern that
  // produces visible Turing patterns regardless of seed.
  seedCenterPerturbation(u, v, width, height);

  // Seed-driven secondary perturbation — small noise patches placed
  // at deterministic positions so different seeds produce different
  // starting topologies, but the same seed always produces the same one.
  seedSeedPerturbation(u, v, rng, width, height);

  return {
    u,
    v,
    uNext,
    vNext,
    width,
    height,
    params: {
      du: opts.du ?? DEFAULT_DU,
      dv: opts.dv ?? DEFAULT_DV,
      F: opts.F ?? DEFAULT_FEED_RATE,
      k: opts.k ?? DEFAULT_KILL_RATE,
      dt: opts.dt ?? DEFAULT_DT,
    },
    frame: 0,
    rng,
    seed: opts.seed,
  };
}

/**
 * Place a square patch of v=1 in the middle of the grid. The classic
 * Gray-Scott initial condition — gives the PDE something to react against
 * even when the seed produces a sparse perturbation.
 */
function seedCenterPerturbation(
  u: Float32Array,
  v: Float32Array,
  width: number,
  height: number,
): void {
  const cx = Math.floor(width / 2);
  const cy = Math.floor(height / 2);
  const side = Math.max(8, Math.floor(Math.min(width, height) / 8));
  const half = Math.floor(side / 2);
  for (let y = cy - half; y <= cy + half; y++) {
    for (let x = cx - half; x <= cx + half; x++) {
      if (x < 0 || x >= width || y < 0 || y >= height) continue;
      const i = y * width + x;
      u[i] = 0.5;
      v[i] = 0.25;
    }
  }
}

/**
 * Place seed-derived perturbations — small random patches using the
 * supplied RNG. Produces seed-distinct starting topologies, but
 * identical for identical seeds.
 */
function seedSeedPerturbation(
  u: Float32Array,
  v: Float32Array,
  rng: () => number,
  width: number,
  height: number,
): void {
  // ~12 small patches spread across the field
  const patchCount = 12;
  for (let p = 0; p < patchCount; p++) {
    const cx = Math.floor(rng() * width);
    const cy = Math.floor(rng() * height);
    const radius = 2 + Math.floor(rng() * 4);
    for (let dy = -radius; dy <= radius; dy++) {
      for (let dx = -radius; dx <= radius; dx++) {
        const x = cx + dx;
        const y = cy + dy;
        if (x < 0 || x >= width || y < 0 || y >= height) continue;
        if (dx * dx + dy * dy > radius * radius) continue;
        const i = y * width + x;
        // Only perturb where v is still near equilibrium — avoids
        // stomping the central square we just placed.
        if (v[i] < 0.05) {
          u[i] = 0.5;
          v[i] = 0.25;
        }
      }
    }
  }
}

// ============================================================
// Simulation step
// ============================================================

/**
 * Advance the simulator by one Euler step. Writes the new state
 * into the ping-pong buffers, then swaps them in so the caller
 * keeps observing `state.u` and `state.v`.
 *
 * Boundary conditions: periodic (toroidal). The Laplacian uses the
 * 5-point stencil `∇²f ≈ (f[N]+f[S]+f[E]+f[W] − 4f)` scaled by an
 * effective grid factor so the explicit scheme stays stable for the
 * published constants (D_u = 1.0, D_v = 0.5, dt = 1.0). Without this
 * scale factor `dt · D / h² > 1/2` and the iteration diverges.
 *
 * The constants D_u and D_v are kept in their published form so the
 * documented (F, k) → regime mapping remains accurate; the scaling
 * factor absorbs the grid-spacing convention rather than mutating
 * the diffusion coefficients.
 */
export function stepReactionDiffusion(state: ReactionDiffusionState): void {
  const { u, v, uNext, vNext, width, height, params } = state;
  const { du, dv, F, k, dt } = params;
  const W = width;
  const H = height;
  // Effective h² in the discrete Laplacian. With Du=1, dt=1 this
  // keeps the diffusion number below 1 while leaving the PDE
  // constants in their published form.
  const LAP_SCALE = 0.16;

  for (let y = 0; y < H; y++) {
    const yN = y === 0 ? H - 1 : y - 1;
    const yS = y === H - 1 ? 0 : y + 1;
    for (let x = 0; x < W; x++) {
      const xE = x === W - 1 ? 0 : x + 1;
      const xW = x === 0 ? W - 1 : x - 1;

      const i  = y * W + x;
      const iN = yN * W + x;
      const iS = yS * W + x;
      const iE = y * W + xE;
      const iW = y * W + xW;

      const uc = u[i];
      const vc = v[i];

      // 5-point Laplacian (periodic)
      const lapU = (u[iN] + u[iS] + u[iE] + u[iW] - 4 * uc) * LAP_SCALE;
      const lapV = (v[iN] + v[iS] + v[iE] + v[iW] - 4 * vc) * LAP_SCALE;

      // Reaction term (shared between u and v with opposite sign)
      const uvv = uc * vc * vc;

      // Forward-Euler update
      const unew = uc + dt * (du * lapU - uvv + F * (1 - uc));
      const vnew = vc + dt * (dv * lapV + uvv - (F + k) * vc);

      // Numerical safety: clamp to a generous bound so a pathological
      // (F, k) can't produce Inf / NaN that ruins later steps.
      uNext[i] = clampFinite(unew);
      vNext[i] = clampFinite(vnew);
    }
  }

  // Swap buffers: uNext becomes the active u; u becomes available
  // for next-next step. We assign directly into the state object
  // rather than reallocating so consumers holding references see it.
  state.u = uNext;
  state.v = vNext;
  state.uNext = u;
  state.vNext = v;
  state.frame++;
}

/**
 * Clamp a value to [-1, 2] and replace non-finite values with 0.
 * The PDE equilibrium sits at u≈1, v≈0; values outside [-1, 2] are
 * almost certainly numerical blow-up — preventing Inf propagation
 * is cheaper than tuning dt.
 */
function clampFinite(v: number): number {
  if (!Number.isFinite(v)) return 0;
  if (v > 2) return 2;
  if (v < -1) return -1;
  return v;
}

// ============================================================
// Reset
// ============================================================

/**
 * Reset the simulator to frame 0 with freshly derived initial
 * state. Same seed → same initial state (across resets), so
 * replay-determinism holds.
 */
export function resetReactionDiffusion(
  state: ReactionDiffusionState,
): void {
  // Re-initialize the buffers in place.
  const { u, v, width, height, seed } = state;
  u.fill(1.0);
  v.fill(0.0);
  // Derive a fresh RNG from the seed so the reset produces exactly
  // the same initial state as a fresh `createReactionDiffusionState`.
  const rng = mulberry32(hashSeed(seed));
  seedCenterPerturbation(u, v, width, height);
  seedSeedPerturbation(u, v, rng, width, height);
  state.rng = rng;
  // The next-buffers may still hold the last-step's data — that's
  // fine because the very next step will rewrite them.
  state.frame = 0;
  // params are preserved — reset only restarts time, not config.
}

// ============================================================
// Rendering — CPU 2D canvas paint of the current (u, v) field.
// ============================================================

/**
 * Paint the current v-field into a 2D canvas context. Uses the
 * supplied palette to gradient-map v→color (low v → background,
 * high v → foreground). `backgroundStart` covers the lowest
 * values (where v is near 0 and u≈1); `foregroundEnd` covers
 * the peak of the pattern.
 *
 * The canvas size must equal `width × height` pixels — i.e. 1 px
 * per cell. Bilinear filtering by the CanvasTexture smooths the
 * result visually without us resampling.
 */
export function renderReactionDiffusion(
  state: ReactionDiffusionState,
  ctx: CanvasRenderingContext2D,
  palette: PaletteName,
): void {
  const W = state.width;
  const H = state.height;
  const img = ctx.createImageData(W, H);
  const data = img.data;
  const colors = REACTION_DIFFUSION_PALETTES[palette];

  // Map v in roughly [0, 0.5] across the gradient — empirically the
  // interesting range for the default parameters.
  const V_LO = 0.0;
  const V_HI = 0.45;

  const bg = colors.backgroundStart;
  const bgEnd = colors.backgroundEnd;
  const fg = colors.foregroundStart;
  const fgEnd = colors.foregroundEnd;

  for (let i = 0; i < W * H; i++) {
    const vRaw = state.v[i];
    // Normalize to [0, 1] then to [0, 2] so a single threshold
    // divides bg half from fg half.
    const t = clamp01((vRaw - V_LO) / (V_HI - V_LO));
    let r: number, g: number, b: number;
    if (t < 0.5) {
      const u = t * 2; // 0..1 over the bg→mid range
      r = lerp(bg[0], bgEnd[0], u);
      g = lerp(bg[1], bgEnd[1], u);
      b = lerp(bg[2], bgEnd[2], u);
    } else {
      const u = (t - 0.5) * 2; // 0..1 over the mid→fg range
      r = lerp(fg[0], fgEnd[0], u);
      g = lerp(fg[1], fgEnd[1], u);
      b = lerp(fg[2], fgEnd[2], u);
    }
    const p = i * 4;
    data[p + 0] = r;
    data[p + 1] = g;
    data[p + 2] = b;
    data[p + 3] = 255;
  }
  ctx.putImageData(img, 0, 0);
}

// ============================================================
// Internal small utilities — kept private.
// ============================================================

function clamp01(v: number): number {
  if (v < 0) return 0;
  if (v > 1) return 1;
  return v;
}

function lerp(a: number, b: number, t: number): number {
  return a + (b - a) * t;
}
