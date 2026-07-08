/**
 * Peter de Jong Attractor — port of Jared Tarbell's "Peter de Jong" (2004)
 * to TypeScript with deterministic seeding.
 *
 * Original: https://complexification.net/gallery/deJong/deJong.php
 *
 * 4000 travelers each iterate the de Jong map:
 *   x' = sin(a*y) - cos(b*x)
 *   y' = sin(c*x) - cos(d*y)
 * After 128 frames each traveler "rebirths" at a new random position.
 * Each frame the traveler draws a single low-alpha pixel, and the
 * accumulation produces the characteristic attractor patterns.
 *
 * The four parameters (a, b, c, d) are randomized on click in the original;
 * in our port they are derived from the seed so the (seed, time) contract
 * gives identical state.
 */

import { mulberry32, hashSeed } from "@/lib/seed";

// ============================================================
// State
// ============================================================

export type DeJongTraveler = {
  x: number;
  y: number;
  age: number;
};

export type DeJongAttractorState = {
  travelers: DeJongTraveler[];
  // Peter de Jong / Bourke parameters
  a: number;
  b: number;
  c: number;
  d: number;
  // map → screen projection
  scale: number;
  offsetX: number;
  offsetY: number;
  // step counter
  frame: number;
  // canvas dims
  width: number;
  height: number;
  rng: () => number;
  initialPaperFill: boolean;
};

export const NUM_TRAVELERS = 4000;
export const MAX_AGE = 128;
// Bourke's "interesting" parameters — used as the default when seed is omitted
export const BOURKE_PARAMS = { a: 2.01, b: -2.53, c: 1.61, d: -0.33 };

// ============================================================
// Initialization
// ============================================================

export function createDeJongAttractorState(opts: {
  seed: string;
  width: number;
  height: number;
}): DeJongAttractorState {
  const seedU32 = hashSeed(opts.seed);
  const rng = mulberry32(seedU32);

  // Derive a, b, c, d from the seed. Use the original range (-2.5 to 2.5)
  // but bias toward Bourke's known-good values for visual quality.
  const a = clamp(lerp(rng(), BOURKE_PARAMS.a, 0.5), -2.5, 2.5);
  const b = clamp(lerp(rng(), BOURKE_PARAMS.b, 0.5), -2.5, 2.5);
  const c = clamp(lerp(rng(), BOURKE_PARAMS.c, 0.5), -2.5, 2.5);
  const d = clamp(lerp(rng(), BOURKE_PARAMS.d, 0.5), -2.5, 2.5);

  // Initial traveler positions: random in [-1, 1] (original).
  const travelers: DeJongTraveler[] = [];
  for (let i = 0; i < NUM_TRAVELERS; i++) {
    travelers.push({
      x: rng() * 2 - 1,
      y: rng() * 2 - 1,
      age: 0,
    });
  }

  return {
    travelers,
    a,
    b,
    c,
    d,
    scale: 3.5,
    offsetX: 0.5,
    offsetY: 0.75,
    frame: 0,
    width: opts.width,
    height: opts.height,
    rng,
    initialPaperFill: false,
  };
}

function lerp(t: number, anchor: number, jitter: number): number {
  return anchor + (t - 0.5) * jitter;
}

function clamp(v: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, v));
}

// ============================================================
// Simulation step
// ============================================================

/**
 * Advance the simulation by one frame. Draws one ink point per traveler.
 */
export function stepDeJongAttractor(
  state: DeJongAttractorState,
  ctx: CanvasRenderingContext2D,
): void {
  if (!state.initialPaperFill) {
    // Cream paper background
    ctx.fillStyle = "#f3ead2";
    ctx.fillRect(0, 0, state.width, state.height);
    state.initialPaperFill = true;
  }

  // Black ink stroke
  ctx.fillStyle = "rgba(20, 12, 6, 0.10)";

  const { a, b, c, d } = state;
  const { scale, offsetX, offsetY } = state;
  const W = state.width;
  const H = state.height;

  for (let i = 0; i < NUM_TRAVELERS; i++) {
    const t = state.travelers[i];
    // De Jong map
    const xn = Math.sin(a * t.y) - Math.cos(b * t.x);
    const yn = Math.sin(c * t.x) - Math.cos(d * t.y);
    t.x = xn;
    t.y = yn;
    t.age++;

    // Project to screen coords
    const sx = (t.x / scale + offsetX) * W;
    const sy = (t.y / scale + offsetY) * H;
    if (sx >= 0 && sx < W && sy >= 0 && sy < H) {
      ctx.fillRect(sx, sy, 1, 1);
    }

    if (t.age > MAX_AGE) {
      t.x = state.rng() * 1.0;        // original used 0..1
      t.y = state.rng() * 2.0 - 1.0;  // original used -1..1
      t.age = 0;
    }
  }

  state.frame++;
}

/**
 * Reset the simulation: re-clear canvas, re-pick parameters from the seed.
 */
export function resetDeJongAttractor(
  state: DeJongAttractorState,
  ctx: CanvasRenderingContext2D,
): void {
  ctx.fillStyle = "#f3ead2";
  ctx.fillRect(0, 0, state.width, state.height);

  // Re-pick parameters using the same seeded RNG so the next run is deterministic
  const rng = state.rng;
  state.a = lerp(rng(), BOURKE_PARAMS.a, 2.0);
  state.b = lerp(rng(), BOURKE_PARAMS.b, 1.5);
  state.c = lerp(rng(), BOURKE_PARAMS.c, 1.0);
  state.d = lerp(rng(), BOURKE_PARAMS.d, 1.0);

  for (let i = 0; i < NUM_TRAVELERS; i++) {
    state.travelers[i].x = rng() * 2 - 1;
    state.travelers[i].y = rng() * 2 - 1;
    state.travelers[i].age = 0;
  }
  state.frame = 0;
}
