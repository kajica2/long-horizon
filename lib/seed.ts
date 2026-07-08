/**
 * Seeded RNG utilities.
 *
 * The reproducibility contract depends on these functions being
 * PURE — same input must produce same output on any machine.
 *
 * Source of truth: engine scoping doc Section 4.8.
 */

/**
 * Mulberry32 — small, fast, well-distributed seeded PRNG.
 * Returns a function that produces values in [0, 1).
 */
export function mulberry32(seed: number): () => number {
  let a = seed >>> 0;
  return function () {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/**
 * Hash a hex seed string into a 32-bit integer.
 * Stable across platforms — uses only string charCodeAt arithmetic.
 */
export function hashSeed(hexSeed: string): number {
  let h = 2166136261 >>> 0; // FNV-1a offset basis
  for (let i = 0; i < hexSeed.length; i++) {
    h ^= hexSeed.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}

/**
 * Generate a random Uint32 from an RNG function.
 */
export function rngUint32(rng: () => number): number {
  // Combine two [0,1) values to fill 32 bits.
  return ((rng() * 0x100000000) >>> 0) ^ ((rng() * 0x100000000) >>> 0);
}

/**
 * Deterministic uniform-sphere position from a 32-bit integer seed.
 * Returns a unit vector; multiply by radius for a sphere of given size.
 */
export function seedSphereUnit(seedInt: number): [number, number, number] {
  const rng = mulberry32(seedInt);
  const u = rng();
  const v = rng();
  const theta = 2 * Math.PI * u;
  const phi = Math.acos(2 * v - 1);
  return [
    Math.sin(phi) * Math.cos(theta),
    Math.sin(phi) * Math.sin(theta),
    Math.cos(phi),
  ];
}

/**
 * Deterministic uniform-sphere position with cube-root radius
 * (so density is uniform across volume, not surface).
 */
export function seedSphere(
  seedInt: number,
  radius: number,
): [number, number, number] {
  const rng = mulberry32(seedInt);
  const r = Math.cbrt(rng()) * radius;
  const [x, y, z] = seedSphereUnit(seedInt ^ 0x9e3779b9);
  return [x * r, y * r, z * r];
}

/**
 * Generate a fresh 32-char hex seed.
 * Used once at Artwork creation.
 */
export function generateSeed(): string {
  const bytes = new Uint8Array(16);
  if (typeof crypto !== "undefined" && crypto.getRandomValues) {
    crypto.getRandomValues(bytes);
  } else {
    for (let i = 0; i < 16; i++) bytes[i] = Math.floor(Math.random() * 256);
  }
  return Array.from(bytes, (b) => b.toString(16).padStart(2, "0")).join("");
}