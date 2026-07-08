/**
 * Sand Traveler — port of Jared Tarbell's "Sand Traveler" (Sónar 2004)
 * to TypeScript with deterministic seeding.
 *
 * Original: https://complexification.net/gallery/sandTraveler/sandTraveler.php
 *
 * 200 cities arranged in an inward spiral, each picks a "friend" city
 * and migrates toward it, leaving soft sand-painted trails. The painting
 * accumulates over ~3600 frames, then resets.
 *
 * Reproducibility: all randomness (initial phase, friend assignment,
 * color picks, sand painter params) is sourced from a seeded RNG so
 * (seed, time) → identical state.
 */

import { mulberry32, hashSeed } from "@/lib/seed";

// ============================================================
// Palette — earth tones from Tarbell's original
// ============================================================

export type RGB = [number, number, number];

// Weighted palette: 23 earth tones, then 5 black, 5 white, 5 black, 5 white.
// The repetition skews the random pick toward B/W, producing stark contrast
// against the cream paper background.
export const SAND_TRAVELER_PALETTE: RGB[] = [
  [0x3a, 0x24, 0x2b], [0x3b, 0x24, 0x26], [0x35, 0x23, 0x25], // deep plum
  [0x83, 0x64, 0x54], [0x7d, 0x55, 0x33], [0x8b, 0x73, 0x52], // warm earth
  [0xb1, 0xa1, 0x81], [0xa4, 0x63, 0x2e], [0xbb, 0x6b, 0x33], // amber/clay
  [0xb4, 0x72, 0x49], [0xca, 0x72, 0x39], [0xd2, 0x90, 0x57], // rust
  [0xe0, 0xb8, 0x7e], [0xd9, 0xb1, 0x66], [0xf5, 0xea, 0xbe], // wheat
  [0xfc, 0xfa, 0xdf], [0xd9, 0xd1, 0xb0], [0xfc, 0xfa, 0xdf], // bone
  [0xd1, 0xd1, 0xca], [0xa7, 0xb1, 0xac], [0x87, 0x9a, 0x8c], // sage
  [0x91, 0x86, 0xad], [0x77, 0x6a, 0x8e],                    // dusk
  [0, 0, 0], [0, 0, 0], [0, 0, 0], [0, 0, 0], [0, 0, 0],    // black x5
  [255, 255, 255], [255, 255, 255], [255, 255, 255], [255, 255, 255], [255, 255, 255], // white x5
  [0, 0, 0], [0, 0, 0], [0, 0, 0], [0, 0, 0], [0, 0, 0],
  [255, 255, 255], [255, 255, 255], [255, 255, 255], [255, 255, 255], [255, 255, 255],
];

export const SAND_TRAVELER_PAPER: RGB = [244, 236, 216]; // cream

// ============================================================
// State types
// ============================================================

export type SandCity = {
  x: number;
  y: number;
  vx: number;
  vy: number;
  friend: number;
  idx: number;
  color: RGB;
};

export type SandPainter = {
  p: number;   // phase [0, 1]
  c: RGB;      // color
  g: number;   // sweep
};

export type SandTravelerState = {
  cities: SandCity[];
  sands: SandPainter[]; // length = cities.length * NUM_SANDS
  frame: number;
  width: number;
  height: number;
  rng: () => number;
  initialPaperFill: boolean; // whether we've laid down the paper bg yet
};

export const NUM_CITIES = 200;
export const NUM_SANDS = 3;
export const RESET_AFTER_FRAMES = 120 * 30; // 3600 frames @ 60fps = 60s

// ============================================================
// Initialization
// ============================================================

export function createSandTravelerState(opts: {
  seed: string;
  width: number;
  height: number;
}): SandTravelerState {
  const seedU32 = hashSeed(opts.seed);
  const rng = mulberry32(seedU32);

  const cities: SandCity[] = [];
  const sands: SandPainter[] = [];

  // Original initialization: spiral inward with shrinking velocity
  let vt = 4.2;
  let vvt = 0.2;
  const ot = rng() * Math.PI * 2;

  for (let t = 0; t < NUM_CITIES; t++) {
    const tinc = ot + (1.1 - t / NUM_CITIES) * 2 * t * Math.PI * 2 / NUM_CITIES;
    const vx = vt * Math.sin(tinc);
    const vy = vt * Math.cos(tinc);
    cities.push({
      x: opts.width / 2 + vx * 2,
      y: opts.height / 2 + vy * 2,
      vx,
      vy,
      friend: 0, // assigned below
      idx: t,
      color: pickColor(rng),
    });
    vvt -= 0.00033;
    vt += vvt;
  }

  // Friend assignment: original was (idx + int(random(num/5))) % num
  for (let t = 0; t < NUM_CITIES; t++) {
    cities[t].friend = (t + Math.floor(rng() * (NUM_CITIES / 5))) % NUM_CITIES;
  }

  // Sand painters: 3 per city, each with own p, c, g
  for (let t = 0; t < NUM_CITIES; t++) {
    for (let s = 0; s < NUM_SANDS; s++) {
      sands.push({
        p: rng(),
        c: pickColor(rng),
        g: 0.01 + rng() * 0.09,
      });
    }
  }

  return {
    cities,
    sands,
    frame: 0,
    width: opts.width,
    height: opts.height,
    rng,
    initialPaperFill: false,
  };
}

function pickColor(rng: () => number): RGB {
  return SAND_TRAVELER_PALETTE[Math.floor(rng() * SAND_TRAVELER_PALETTE.length)];
}

// ============================================================
// Simulation step
// ============================================================

/**
 * Advance the simulation by one frame.
 * Writes sand-painter strokes to the provided 2D canvas context.
 */
export function stepSandTraveler(
  state: SandTravelerState,
  ctx: CanvasRenderingContext2D,
): void {
  // First frame: lay down the paper background
  if (!state.initialPaperFill) {
    const [pr, pg, pb] = SAND_TRAVELER_PAPER;
    ctx.fillStyle = `rgb(${pr}, ${pg}, ${pb})`;
    ctx.fillRect(0, 0, state.width, state.height);
    state.initialPaperFill = true;
  }

  // Move cities
  for (let c = 0; c < NUM_CITIES; c++) {
    const city = state.cities[c];
    const friend = state.cities[city.friend];
    city.vx += (friend.x - city.x) / 1000;
    city.vy += (friend.y - city.y) / 1000;
    city.vx *= 0.936;
    city.vy *= 0.936;
    city.x += city.vx;
    city.y += city.vy;
    drawTravelers(state, city, ctx);
  }

  // Auto-reset
  if (state.frame > RESET_AFTER_FRAMES) {
    resetSandTraveler(state, ctx);
    return;
  }

  state.frame++;
}

/**
 * Reset the simulation: re-clear canvas, re-initialize cities & friends
 * & sand painters using the existing seeded RNG.
 */
export function resetSandTraveler(
  state: SandTravelerState,
  ctx: CanvasRenderingContext2D,
): void {
  // Re-clear the canvas
  const [pr, pg, pb] = SAND_TRAVELER_PAPER;
  ctx.fillStyle = `rgb(${pr}, ${pg}, ${pb})`;
  ctx.fillRect(0, 0, state.width, state.height);

  // Use the same RNG so the next run is deterministic w.r.t. the seed.
  const rng = state.rng;

  let vt = 4.2;
  let vvt = 0.2;
  const ot = rng() * Math.PI * 2;
  for (let t = 0; t < NUM_CITIES; t++) {
    const tinc = ot + (1.1 - t / NUM_CITIES) * 2 * t * Math.PI * 2 / NUM_CITIES;
    const vx = vt * Math.sin(tinc);
    const vy = vt * Math.cos(tinc);
    const city = state.cities[t];
    city.x = state.width / 2 + vx * 2;
    city.y = state.height / 2 + vy * 2;
    city.vx = vx;
    city.vy = vy;
    city.color = pickColor(rng);
    vvt -= 0.00033;
    vt += vvt;
  }
  for (let t = 0; t < NUM_CITIES; t++) {
    state.cities[t].friend = (t + Math.floor(rng() * (NUM_CITIES / 5))) % NUM_CITIES;
  }
  for (let t = 0; t < NUM_CITIES * NUM_SANDS; t++) {
    const s = state.sands[t];
    s.p = rng();
    s.c = pickColor(rng);
    s.g = 0.01 + rng() * 0.09;
  }
  state.frame = 0;
}

// ============================================================
// Drawing — replicates Tarbell's Processing drawTravelers
// ============================================================

function drawTravelers(
  state: SandTravelerState,
  city: SandCity,
  ctx: CanvasRenderingContext2D,
): void {
  const friend = state.cities[city.friend];
  const rng = state.rng;
  const nt = 11;

  const [fr, fg, fb] = friend.color;

  for (let i = 0; i < nt; i++) {
    const t = rng() * Math.PI * 2;
    let dx = Math.sin(t) * (city.x - friend.x) / 2 + (city.x + friend.x) / 2;
    let dy = Math.sin(t) * (city.y - friend.y) / 2 + (city.y + friend.y) / 2;
    if (rng() * 1000 > 990) {
      dx += rng() * 3 - rng() * 3;
      dy += rng() * 3 - rng() * 3;
    }
    // Original used stroke + point with alpha 48
    ctx.fillStyle = `rgba(${fr}, ${fg}, ${fb}, 0.19)`;
    ctx.fillRect(dx, dy, 1, 1);

    // Anti-traveler
    dx = -1 * Math.sin(t) * (city.x - friend.x) / 2 + (city.x + friend.x) / 2;
    dy = -1 * Math.sin(t) * (city.y - friend.y) / 2 + (city.y + friend.y) / 2;
    if (rng() * 1000 > 990) {
      dx += rng() * 3 - rng() * 3;
      dy += rng() * 3 - rng() * 3;
    }
    ctx.fillRect(dx, dy, 1, 1);
  }

  // Sand painters: 3 per city
  for (let s = 0; s < NUM_SANDS; s++) {
    const sand = state.sands[city.idx * NUM_SANDS + s];
    renderSandPainter(sand, city.x, city.y, friend.x, friend.y, ctx, rng);
  }
}

function renderSandPainter(
  sand: SandPainter,
  x: number, y: number,
  ox: number, oy: number,
  ctx: CanvasRenderingContext2D,
  rng: () => number,
): void {
  const [cr, cg, cb] = sand.c;
  // Main sweep point
  ctx.fillStyle = `rgba(${cr}, ${cg}, ${cb}, 0.11)`;
  ctx.fillRect(ox + (x - ox) * Math.sin(sand.p), oy + (y - oy) * Math.sin(sand.p), 1, 1);

  // Sand painter params drift
  sand.g += rng() * 0.1 - 0.05;
  const maxg = 0.22;
  if (sand.g < -maxg) sand.g = -maxg;
  if (sand.g > maxg) sand.g = maxg;
  sand.p += rng() * 0.1 - 0.05;
  if (sand.p < 0) sand.p = 0;
  if (sand.p > 1.0) sand.p = 1.0;

  const w = sand.g / 10.0;
  for (let i = 0; i < 11; i++) {
    const a = 0.1 - i / 110.0;
    const alpha = Math.max(0, a) * 1.0; // original used a*256 in Processing, normalize
    ctx.fillStyle = `rgba(${cr}, ${cg}, ${cb}, ${alpha})`;
    ctx.fillRect(
      ox + (x - ox) * Math.sin(sand.p + Math.sin(i * w)),
      oy + (y - oy) * Math.sin(sand.p + Math.sin(i * w)),
      1, 1,
    );
    ctx.fillRect(
      ox + (x - ox) * Math.sin(sand.p - Math.sin(i * w)),
      oy + (y - oy) * Math.sin(sand.p - Math.sin(i * w)),
      1, 1,
    );
  }
}
