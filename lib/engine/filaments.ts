/**
 * Filament curve generation — produces line segment positions for
 * the Cosmic Filaments Living System.
 *
 * Same algorithm as our static CPU proof (Mulberry32 init + curl noise
 * integration), but outputs a flat Float32Array ready for upload to GPU
 * as line segments (pairs of vertices).
 *
 * Deterministic: same seed → identical positions.
 */

import { createNoise3D, type NoiseFunction3D } from "simplex-noise";
import { mulberry32, hashSeed } from "../seed";

export type FilamentConfig = {
  seed: string;
  count: number;
  stepsPerCurve: number;
  spawnRadius: number;
  fieldStrength: number;
  noiseScale: number;
  drag: number;
  fixedDt?: number;
  // Optional genome-driven adjustments (planetary fields)
  chartIntensity?: number;  // [0,1] — modulates fieldStrength
  moonPhase?: number;       // [0,1] — modulates noiseScale
  dominantElementBias?: "fire" | "earth" | "air" | "water";
};

/**
 * Curl noise from 3D simplex noise.
 * Returns a unit vector in 3D space (or zero).
 */
function makeCurl(
  noise: NoiseFunction3D,
  baseSeed: number,
): (s: number, x: number, y: number, z: number, t: number) => [number, number, number] {
  const seedShift = baseSeed * 0.001;
  function snoise3(s: number, sx: number, sy: number, sz: number, t: number): [number, number, number] {
    const seed = s + seedShift;
    return [
      noise(sx + seed + 0, sy + seed + 17, sz + t * 0.1),
      noise(sx + seed + 31.4, sy + seed + 27.1 + 9, sz + t * 0.13),
      noise(sx + seed + 57.3, sy + seed + 91.7 + 19, sz + t * 0.07),
    ];
  }
  return (s, x, y, z, t) => {
    const e = 0.05;
    const p_x0 = snoise3(s, x - e, y, z, t);
    const p_x1 = snoise3(s, x + e, y, z, t);
    const p_y0 = snoise3(s, x, y - e, z, t);
    const p_y1 = snoise3(s, x, y + e, z, t);
    const p_z0 = snoise3(s, x, y, z - e, t);
    const p_z1 = snoise3(s, x, y, z + e, t);
    const cx = (p_y1[2] - p_y0[2]) - (p_z1[1] - p_z0[1]);
    const cy = (p_z1[0] - p_z0[0]) - (p_x1[2] - p_x0[2]);
    const cz = (p_x1[1] - p_x0[1]) - (p_y1[0] - p_y0[0]);
    const len = Math.sqrt(cx * cx + cy * cy + cz * cz);
    return len < 1e-5 ? [0, 0, 0] : [cx / len, cy / len, cz / len];
  };
}

function sphereStart(rng: () => number, radius: number): [number, number, number] {
  const u = rng();
  const v = rng();
  const theta = 2 * Math.PI * u;
  const phi = Math.acos(2 * v - 1);
  const r = Math.cbrt(rng()) * radius;
  return [
    r * Math.sin(phi) * Math.cos(theta),
    r * Math.sin(phi) * Math.sin(theta),
    r * Math.cos(phi),
  ];
}

/**
 * Generate filament line-segment positions.
 *
 * Returns: Float32Array of length count * (stepsPerCurve - 1) * 2 * 3
 *   (each pair of consecutive points becomes a line segment)
 *
 * Each segment is two 3D vertices packed as [x0, y0, z0, x1, y1, z1, ...].
 */
export function generateFilamentSegments(cfg: FilamentConfig): Float32Array {
  const fixedDt = cfg.fixedDt ?? 1 / 60;

  // Apply genome-driven modulation
  const intensityMod = 1 + (cfg.chartIntensity ?? 0.5) * 0.4;
  const phaseMod = 1 + (cfg.moonPhase ?? 0.5) * 0.3;
  const fieldStrength = cfg.fieldStrength * intensityMod;
  const noiseScale = cfg.noiseScale * phaseMod;

  const baseSeed = hashSeed(cfg.seed);
  const noise = createNoise3D(mulberry32(baseSeed));
  const curl = makeCurl(noise, baseSeed);
  const rng = mulberry32(baseSeed);

  const segmentsPerCurve = cfg.stepsPerCurve - 1;
  const totalFloats = cfg.count * segmentsPerCurve * 2 * 3;
  const out = new Float32Array(totalFloats);

  let writeIdx = 0;

  for (let c = 0; c < cfg.count; c++) {
    const [sx, sy, sz] = sphereStart(rng, cfg.spawnRadius);
    const curveSeed = rng() * 1000;
    let x = sx, y = sy, z = sz;
    let vx = 0, vy = 0, vz = 0;

    for (let s = 0; s < cfg.stepsPerCurve; s++) {
      const t = s * fixedDt;
      const [fx, fy, fz] = curl(curveSeed, x * noiseScale, y * noiseScale, z * noiseScale, t);
      vx += fx * fieldStrength * fixedDt;
      vy += fy * fieldStrength * fixedDt;
      vz += fz * fieldStrength * fixedDt;
      vx *= (1 - cfg.drag);
      vy *= (1 - cfg.drag);
      vz *= (1 - cfg.drag);
      const px = x, py = y, pz = z;
      x += vx * fixedDt;
      y += vy * fixedDt;
      z += vz * fixedDt;

      if (s > 0) {
        // Write line segment: previous point → current point
        out[writeIdx++] = px;
        out[writeIdx++] = py;
        out[writeIdx++] = pz;
        out[writeIdx++] = x;
        out[writeIdx++] = y;
        out[writeIdx++] = z;
      }
    }
  }

  return out;
}