/**
 * render-artwork.ts — generates a static PNG of a Flow Field Meditation artwork.
 *
 * Runs the same simulation logic as the GPU engine (Mulberry32 init, curl noise
 * force, semi-implicit Euler, age respawn) but in plain JS so we can produce
 * a still PNG without a browser. Useful for:
 *   - Visual verification before browser testing
 *   - Thumbnail generation
 *   - Preview images for shareable links (Stage 9)
 *
 * Usage:
 *   npx tsx scripts/render-artwork.ts demo-driftwav
 *   npx tsx scripts/render-artwork.ts demo-shimmerwav
 *   npx tsx scripts/render-artwork.ts demo-pulsewav
 *
 * Output: tmp/renders/{id}.png
 */

import { promises as fs } from "node:fs";
import path from "node:path";
import { createCanvas } from "canvas";
import { createNoise3D, type NoiseFunction3D } from "simplex-noise";
import { mulberry32, hashSeed } from "../lib/seed";

// ============================================================
// Palette (matches PALETTES in particle-render.ts)
// ============================================================

type RGB = [number, number, number];

const PALETTES: Record<string, { start: RGB; end: RGB; bg: RGB }> = {
  aurora: {
    start: [51, 102, 242],
    end: [242, 76, 204],
    bg: [5, 5, 7],
  },
  ember: {
    start: [242, 128, 26],
    end: [230, 26, 13],
    bg: [10, 4, 2],
  },
  tide: {
    start: [13, 153, 178],
    end: [51, 230, 153],
    bg: [2, 8, 12],
  },
  ink: {
    start: [26, 26, 51],
    end: [128, 51, 217],
    bg: [3, 3, 8],
  },
  bone: {
    start: [217, 217, 204],
    end: [140, 140, 128],
    bg: [20, 20, 20],
  },
  moss: {
    start: [51, 128, 51],
    end: [153, 191, 76],
    bg: [4, 10, 4],
  },
};

// ============================================================
// Particle state
// ============================================================

type Particle = {
  px: number;
  py: number;
  pz: number;
  vx: number;
  vy: number;
  vz: number;
  age: number;
  pSeed: number;
};

function initParticles(seed: string, count: number, spawnRadius: number): Particle[] {
  const rng = mulberry32(hashSeed(seed));
  const out: Particle[] = [];
  for (let i = 0; i < count; i++) {
    const u = rng();
    const v = rng();
    const theta = 2 * Math.PI * u;
    const phi = Math.acos(2 * v - 1);
    const r = Math.cbrt(rng()) * spawnRadius;
    out.push({
      px: r * Math.sin(phi) * Math.cos(theta),
      py: r * Math.sin(phi) * Math.sin(theta),
      pz: r * Math.cos(phi),
      vx: 0,
      vy: 0,
      vz: 0,
      age: 0,
      pSeed: rng() * 1000,
    });
  }
  return out;
}

// ============================================================
// Curl noise (matches GLSL implementation)
// ============================================================

type Noise3 = NoiseFunction3D;

function makeCurlNoise(noise: Noise3, baseSeed: number) {
  // Vector noise: three offset scalar noise samples form a vec3
  const snoise3 = (seed: number, x: number, y: number, z: number, t: number): [number, number, number] => {
    const s = baseSeed + seed;
    return [
      noise(x + s + 0,       y + s + 17,        z + t * 0.1),
      noise(x + s + 31.4,    y + s + 27.1 + 9,  z + t * 0.13),
      noise(x + s + 57.3,    y + s + 91.7 + 19, z + t * 0.07),
    ];
  };

  return (seed: number, x: number, y: number, z: number, t: number): [number, number, number] => {
    const e = 0.05;
    const p_x0 = snoise3(seed, x - e, y, z, t);
    const p_x1 = snoise3(seed, x + e, y, z, t);
    const p_y0 = snoise3(seed, x, y - e, z, t);
    const p_y1 = snoise3(seed, x, y + e, z, t);
    const p_z0 = snoise3(seed, x, y, z - e, t);
    const p_z1 = snoise3(seed, x, y, z + e, t);

    const cx = (p_y1[2] - p_y0[2]) - (p_z1[1] - p_z0[1]);
    const cy = (p_z1[0] - p_z0[0]) - (p_x1[2] - p_x0[2]);
    const cz = (p_x1[1] - p_x0[1]) - (p_y1[0] - p_y0[0]);

    const len = Math.sqrt(cx * cx + cy * cy + cz * cz);
    if (len < 1e-5) return [0, 0, 0];
    return [cx / len, cy / len, cz / len];
  };
}

// ============================================================
// Respawn (matches GLSL implementation)
// ============================================================

function respawnPosition(pSeed: number, simStep: number, spawnRadius: number): [number, number, number] {
  const s = pSeed + simStep * 0.073;
  const ux = Math.sin(s * 12.9898) * 43758.5453;
  const uy = Math.sin(s * 78.233) * 43758.5453;
  const uz = Math.sin(s * 39.346) * 43758.5453;
  const fx = ux - Math.floor(ux);
  const fy = uy - Math.floor(uy);
  const fz = uz - Math.floor(uz);
  const len = Math.sqrt(fx * fx + fy * fy + fz * fz) || 1;
  const nx = fx / len;
  const ny = fy / len;
  const nz = fz / len;
  // Cube root for uniform volume
  const r = Math.cbrt(((s * 0.3183099 + 0.1) - Math.floor(s * 0.3183099 + 0.1))) * spawnRadius;
  return [nx * r, ny * r, nz * r];
}

// ============================================================
// Render
// ============================================================

const RENDER_CONFIG = {
  width: 1920,
  height: 1080,
  particleCount: 12_000,    // CPU is slower than GPU
  stepsPerFrame: 360,        // ~6s of evolution at 60Hz
  fixedDt: 1 / 60,
  spawnRadius: 8,
  maxAge: 12,
  fieldStrength: 1.0,
  noiseScale: 0.6,
  drag: 0.08,
  cameraDistance: 7,
  pointBaseSize: 1.1,
};

async function renderArtwork(opts: {
  seed: string;
  palette: keyof typeof PALETTES;
  outputPath: string;
}) {
  const cfg = RENDER_CONFIG;
  const { width, height } = cfg;
  const palette = PALETTES[opts.palette];

  console.log(`[render] seed=${opts.seed.slice(0, 8)}… palette=${opts.palette} → ${opts.outputPath}`);

  // Deterministic simplex noise instance
  const baseSeed = hashSeed(opts.seed);
  const noise = createNoise3D(mulberry32(baseSeed));
  const curl = makeCurlNoise(noise, baseSeed * 0.001);

  // Init particles
  const particles = initParticles(opts.seed, cfg.particleCount, cfg.spawnRadius);

  // Pre-warm: run simulation for many steps so the field has structure
  const fixedDt = cfg.fixedDt;
  for (let step = 0; step < cfg.stepsPerFrame; step++) {
    const simTime = step * fixedDt;
    const simStep = step;
    for (const p of particles) {
      const [fx, fy, fz] = curl(p.pSeed * 0.0001, p.px * cfg.noiseScale, p.py * cfg.noiseScale, p.pz * cfg.noiseScale, simTime);
      const strength = cfg.fieldStrength;
      const ax = fx * strength;
      const ay = fy * strength;
      const az = fz * strength;

      p.vx += ax * fixedDt;
      p.vy += ay * fixedDt;
      p.vz += az * fixedDt;
      p.vx *= (1 - cfg.drag);
      p.vy *= (1 - cfg.drag);
      p.vz *= (1 - cfg.drag);
      p.px += p.vx * fixedDt;
      p.py += p.vy * fixedDt;
      p.pz += p.vz * fixedDt;
      p.age += fixedDt;

      if (p.age > cfg.maxAge || Math.sqrt(p.px * p.px + p.py * p.py + p.pz * p.pz) > cfg.spawnRadius * 1.5) {
        const [nx, ny, nz] = respawnPosition(p.pSeed, simStep, cfg.spawnRadius);
        p.px = nx;
        p.py = ny;
        p.pz = nz;
        p.vx = p.vy = p.vz = 0;
        p.age = 0;
      }
    }
  }

  // Render to canvas
  const canvas = createCanvas(width, height);
  const ctx = canvas.getContext("2d");

  // Background gradient — nebula
  const bgGrad = ctx.createRadialGradient(width / 2, height / 2, 0, width / 2, height / 2, width * 0.7);
  bgGrad.addColorStop(0, `rgb(${palette.bg[0] + 12}, ${palette.bg[1] + 8}, ${palette.bg[2] + 20})`);
  bgGrad.addColorStop(1, `rgb(${palette.bg[0]}, ${palette.bg[1]}, ${palette.bg[2]})`);
  ctx.fillStyle = bgGrad;
  ctx.fillRect(0, 0, width, height);

  // Subtle nebula noise overlay — a few large soft blobs
  for (let i = 0; i < 5; i++) {
    const nx = ((noise(i * 17, i * 23, 0) + 1) / 2) * width;
    const ny = ((noise(i * 31, i * 11, 0) + 1) / 2) * height;
    const r = width * 0.25;
    const g = ctx.createRadialGradient(nx, ny, 0, nx, ny, r);
    g.addColorStop(0, `rgba(${palette.end[0]}, ${palette.end[1]}, ${palette.end[2]}, 0.05)`);
    g.addColorStop(1, `rgba(${palette.end[0]}, ${palette.end[1]}, ${palette.end[2]}, 0)`);
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, width, height);
  }

  // Project particles to 2D with simple perspective projection from camera (0, 1, cfg.cameraDistance) looking at origin
  const camZ = cfg.cameraDistance;
  const focal = height * 0.9;

  // Sort particles by depth (back to front) for correct additive blending
  const projected = particles.map((p) => {
    const z = p.pz + camZ;
    const sx = width / 2 + (p.px * focal) / z;
    const sy = height / 2 - (p.py * focal) / z;
    return { ...p, sx, sy, depth: z };
  });
  projected.sort((a, b) => b.depth - a.depth);

  // Draw particles additively with a soft glow (multiple concentric circles)
  ctx.globalCompositeOperation = "lighter";
  for (const p of projected) {
    if (p.sx < -50 || p.sx >= width + 50 || p.sy < -50 || p.sy >= height + 50) continue;

    const ageT = Math.min(1, p.age / cfg.maxAge);
    const r = Math.round(palette.start[0] * (1 - ageT) + palette.end[0] * ageT);
    const g = Math.round(palette.start[1] * (1 - ageT) + palette.end[1] * ageT);
    const b = Math.round(palette.start[2] * (1 - ageT) + palette.end[2] * ageT);

    // Size + alpha decrease with distance
    const distFactor = 1.0 / (1.0 + p.depth * 0.12);
    const baseSize = cfg.pointBaseSize * distFactor * 2.2;

    // Three-layer glow: large soft halo, mid, bright core
    const layers = [
      { sizeMul: 4.0, alpha: 0.06 },
      { sizeMul: 2.0, alpha: 0.18 },
      { sizeMul: 1.0, alpha: 0.55 },
      { sizeMul: 0.4, alpha: 0.85 },
    ];
    for (const layer of layers) {
      const size = baseSize * layer.sizeMul;
      const alpha = layer.alpha * distFactor;
      if (alpha < 0.01) continue;
      ctx.fillStyle = `rgba(${r}, ${g}, ${b}, ${alpha})`;
      ctx.beginPath();
      ctx.arc(p.sx, p.sy, size, 0, Math.PI * 2);
      ctx.fill();
    }
  }

  ctx.globalCompositeOperation = "source-over";

  // Subtle vignette
  const vignette = ctx.createRadialGradient(width / 2, height / 2, height * 0.3, width / 2, height / 2, width * 0.7);
  vignette.addColorStop(0, "rgba(0,0,0,0)");
  vignette.addColorStop(1, "rgba(0,0,0,0.6)");
  ctx.fillStyle = vignette;
  ctx.fillRect(0, 0, width, height);

  // Save
  await fs.mkdir(path.dirname(opts.outputPath), { recursive: true });
  const buffer = canvas.toBuffer("image/png");
  await fs.writeFile(opts.outputPath, buffer);
  console.log(`[render] wrote ${buffer.length} bytes to ${opts.outputPath}`);
}

// ============================================================
// CLI
// ============================================================

async function main() {
  const argId = process.argv[2] ?? "demo-driftwav";
  const args = process.argv.slice(3);

  // Map artwork ids to their palettes (matches seed data)
  const presets: Record<string, keyof typeof PALETTES> = {
    "demo-driftwav": "ember",
    "demo-shimmerwav": "aurora",
    "demo-pulsewav": "tide",
    "aurora": "aurora",
    "ember": "ember",
    "tide": "tide",
    "ink": "ink",
    "bone": "bone",
    "moss": "moss",
  };

  // Fetch artwork to get seed (if it exists in DB); otherwise derive from id
  let seed = argId;
  try {
    const baseUrl = process.env.NEXT_PUBLIC_APP_URL ?? "http://localhost:3000";
    const res = await fetch(`${baseUrl}/api/artworks/${argId}`);
    if (res.ok) {
      const artwork = await res.json();
      seed = artwork.seed;
    }
  } catch {
    // DB not running — use id as seed
  }

  const palette = presets[argId] ?? (args[0] as keyof typeof PALETTES) ?? "aurora";
  const outputPath = path.resolve(`tmp/renders/${argId}.png`);

  await renderArtwork({ seed, palette, outputPath });
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});