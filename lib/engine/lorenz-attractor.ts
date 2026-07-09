/**
 * Lorenz Attractor — 3D strange attractor (Edward Lorenz, 1963).
 *
 * The famous butterfly-shaped chaotic attractor produced by a tiny system
 * of three coupled ODEs:
 *
 *   dx/dt = σ (y − x)
 *   dy/dt = x (ρ − z) − y
 *   dz/dt = x y − β z
 *
 * Classical parameters (σ=10, ρ=28, β=8/3) yield the canonical butterfly.
 * For visual variety the (σ, ρ, β) can be seed-jittered around these
 * values, but they always stay in the regime where the attractor remains
 * topologically butterfly-like (bounded, never diverging).
 *
 * The simulation is integrated with classical RK4 at dt ≈ 0.005.
 * Positions are stored in a circular buffer of ~8000 points, giving a
 * fading trail of the orbit through 3D space — same seed and same
 * step count always reproduces the same trail.
 */

import { mulberry32, hashSeed } from "@/lib/seed";

// ============================================================
// Public types
// ============================================================

/**
 * Lorenz living state. The trajectory is integrated step by step;
 * the recent positions are stored in a circular buffer that the
 * GPU reads as a polyline.
 */
export type LorenzState = {
  // Current position in 3D space.
  x: number;
  y: number;
  z: number;

  // Lorenz parameters (seed-derived with small jitter).
  sigma: number;
  rho: number;
  beta: number;

  // Integration step (kept small to keep RK4 stable).
  dt: number;

  // Frame counter — equals the number of `stepLorenz` calls.
  frame: number;

  // Circular buffer of recent positions. Length = trailLength.
  // `trail` is structured as a flat Float32Array of length trailLength * 3
  // (x, y, z packed triples). `head` points at the *next write slot*; the
  // most recent point lives at (head - 1) mod trail.length. `count` clamps
  // the visible trail length before head wraps around (i.e. the trail
  // grows until it reaches trailLength and then becomes circular).
  trail: Float32Array;
  head: number;
  count: number;
  trailLength: number;

  // RNG used for re-seeding on reset / initial position perturbations.
  rng: () => number;
  seed: string;
};

export type LorenzStateOptions = {
  seed: string;
  /** Maximum number of trail points. Default 8000. */
  maxPoints?: number;
  /** Integration step size. Default 0.005. */
  dt?: number;
  /**
   * Override the seed-derived parameter jitter. Used in tests to keep
   * determinism tight; in production the seed drives everything.
   */
  sigma?: number;
  rho?: number;
  beta?: number;
};

// ============================================================
// Defaults
// ============================================================

export const LORENZ_DEFAULTS = {
  sigma: 10.0,
  rho: 28.0,
  beta: 8.0 / 3.0,
  dt: 0.005,
  trailLength: 8000,
} as const;

// ============================================================
// Lorenz derivatives
// ============================================================

/**
 * Compute the time-derivative of the Lorenz system at point (x, y, z).
 * The signature is plain numbers — no allocations, used inside the
 * RK4 stage evaluations.
 */
export function lorenzDerivatives(
  x: number,
  y: number,
  z: number,
  sigma: number,
  rho: number,
  beta: number,
): [number, number, number] {
  return [
    sigma * (y - x),
    x * (rho - z) - y,
    x * y - beta * z,
  ];
}

// ============================================================
// Initialization
// ============================================================

/**
 * Create a fresh Lorenz state from a seed.
 *
 * The seed determines:
 *   - The seed-derived initial position (offset from origin by ~0.1)
 *   - Per-parameter jitter around the classical values
 *   - The RNG state used by `resetLorenz`
 *
 * No `Math.random()` is ever called — initial condition reproducibility
 * is the foundation of the (seed, t) contract.
 */
export function createLorenzState(opts: LorenzStateOptions): LorenzState {
  const {
    seed,
    maxPoints = LORENZ_DEFAULTS.trailLength,
    dt = LORENZ_DEFAULTS.dt,
    sigma: sigmaOpt,
    rho: rhoOpt,
    beta: betaOpt,
  } = opts;

  const seedU32 = hashSeed(seed);
  const rng = mulberry32(seedU32);

  // Initial position: small offset from origin. The classical fixed points
  // of the Lorenz system are at (±√(β(ρ-1)), ±√(β(ρ-1)), ρ-1); starting at
  // ~0.1 keeps the orbit from collapsing into a fixed point by symmetry.
  const x0 = 0.1 + rng() * 0.1;
  const y0 = 0.1 + rng() * 0.1;
  const z0 = 0.1 + rng() * 0.1;

  // Parameters: tiny seed-driven jitter around the classical values,
  // clamped so the system stays in the bounded attractor regime.
  // We derive σ, ρ, β independently so seeds produce visually distinct
  // strands but never blow up.
  const sigma =
    sigmaOpt ?? clamp(rng() * 2 + LORENZ_DEFAULTS.sigma - 1, 5, 30);
  const rho = rhoOpt ?? clamp(rng() * 4 + LORENZ_DEFAULTS.rho - 2, 10, 50);
  const beta = betaOpt ?? clamp(rng() * 0.4 + LORENZ_DEFAULTS.beta - 0.2, 1, 5);

  // Allocate the circular buffer once.
  const trailLength = Math.max(2, Math.floor(maxPoints));
  const trail = new Float32Array(trailLength * 3);

  const state: LorenzState = {
    x: x0,
    y: y0,
    z: z0,
    sigma,
    rho,
    beta,
    dt,
    frame: 0,
    trail,
    head: 0,
    count: 0,
    trailLength,
    rng,
    seed,
  };

  return state;
}

// ============================================================
// Simulation step
// ============================================================

/**
 * Advance the orbit by one step using classical 4th-order Runge-Kutta.
 *
 * The classical scheme samples the derivative at four points within
 * the interval and combines them with a weighted average. Local error
 * is O(dt^5) — orders of magnitude smaller than a single Euler step,
 * which matters because Lorenz is sensitive enough that accumulated
 * Euler error blows up the trajectory and would never settle on the
 * bounded attractor at dt = 0.005.
 */
export function stepLorenz(state: LorenzState): void {
  const { x, y, z, sigma, rho, beta, dt } = state;

  // k1 = f(t, y)
  const [k1x, k1y, k1z] = lorenzDerivatives(x, y, z, sigma, rho, beta);

  // k2 = f(t + dt/2, y + (dt/2) k1)
  const hx2 = x + (dt / 2) * k1x;
  const hy2 = y + (dt / 2) * k1y;
  const hz2 = z + (dt / 2) * k1z;
  const [k2x, k2y, k2z] = lorenzDerivatives(hx2, hy2, hz2, sigma, rho, beta);

  // k3 = f(t + dt/2, y + (dt/2) k2)
  const hx3 = x + (dt / 2) * k2x;
  const hy3 = y + (dt / 2) * k2y;
  const hz3 = z + (dt / 2) * k2z;
  const [k3x, k3y, k3z] = lorenzDerivatives(hx3, hy3, hz3, sigma, rho, beta);

  // k4 = f(t + dt, y + dt k3)
  const hx4 = x + dt * k3x;
  const hy4 = y + dt * k3y;
  const hz4 = z + dt * k3z;
  const [k4x, k4y, k4z] = lorenzDerivatives(hx4, hy4, hz4, sigma, rho, beta);

  // y_{n+1} = y_n + (dt/6)(k1 + 2 k2 + 2 k3 + k4)
  const nx = x + (dt / 6) * (k1x + 2 * k2x + 2 * k3x + k4x);
  const ny = y + (dt / 6) * (k1y + 2 * k2y + 2 * k3y + k4y);
  const nz = z + (dt / 6) * (k1z + 2 * k2z + 2 * k3z + k4z);

  state.x = nx;
  state.y = ny;
  state.z = nz;
  state.frame++;

  // Append to circular buffer.
  const len = state.trailLength;
  const idx3 = state.head * 3;
  state.trail[idx3 + 0] = nx;
  state.trail[idx3 + 1] = ny;
  state.trail[idx3 + 2] = nz;
  state.head = (state.head + 1) % len;
  if (state.count < len) state.count++;
}

// ============================================================
// Reset
// ============================================================

/**
 * Reset the simulation: re-derive parameters and initial position
 * from the same seeded RNG, clear the buffer, and zero the frame.
 *
 * A fresh RNG instance is seeded from the same hex seed so the
 * trajectory after reset is identical to a freshly created state.
 */
export function resetLorenz(state: LorenzState): void {
  // Replace the RNG with a fresh instance from the same seed so we get
  // the exact same parameter/position draws that created the state.
  const seedU32 = hashSeed(state.seed);
  const rng = mulberry32(seedU32);
  state.rng = rng;

  state.x = 0.1 + rng() * 0.1;
  state.y = 0.1 + rng() * 0.1;
  state.z = 0.1 + rng() * 0.1;
  state.sigma = clamp(rng() * 2 + LORENZ_DEFAULTS.sigma - 1, 5, 30);
  state.rho = clamp(rng() * 4 + LORENZ_DEFAULTS.rho - 2, 10, 50);
  state.beta = clamp(rng() * 0.4 + LORENZ_DEFAULTS.beta - 0.2, 1, 5);

  state.frame = 0;
  state.head = 0;
  state.count = 0;
  state.trail.fill(0);
}

// ============================================================
// GPU-friendly serialization
// ============================================================

/**
 * Snapshot the trail into a Float32Array suitable for uploading as a
 * `THREE.BufferGeometry` position attribute.
 *
 * The output is in chronological order — oldest at index 0, newest at
 * the end — with the buffer handle and count managed inside the state.
 * Length is always `state.count * 3` (the trajectory up to the wrap
 * point, never including unwritten slots).
 *
 * Note: this allocates a new buffer per call. For per-frame rendering
 * the component reuses an internal Float32Array directly; this helper
 * is for tests and one-shot exports.
 */
export function snapshotTrail(state: LorenzState): Float32Array {
  const len = state.trailLength;
  const outLen = state.count * 3;
  const out = new Float32Array(outLen);
  if (state.count < len) {
    // Not yet wrapped — copy the first `count` entries verbatim.
    out.set(state.trail.subarray(0, outLen));
    return out;
  }
  // Wrapped: read in chronological order, head..end, then 0..head.
  const head = state.head;
  const firstPart = len - head;
  out.set(state.trail.subarray(head * 3, head * 3 + firstPart * 3), 0);
  out.set(state.trail.subarray(0, head * 3), firstPart * 3);
  return out;
}

// ============================================================
// Helpers
// ============================================================

function clamp(v: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, v));
}
