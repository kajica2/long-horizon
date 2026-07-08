/**
 * render-hero.ts — generate a single tuned hero render of an artwork.
 * Uses more aggressive params for visual impact (larger field, lower drag).
 */

import { promises as fs } from "node:fs";
import path from "node:path";
import { createCanvas } from "canvas";
import { createNoise3D } from "simplex-noise";
import { mulberry32, hashSeed } from "../lib/seed";

type RGB = [number, number, number];
const PALETTES: Record<string, { start: RGB; end: RGB; bg: RGB }> = {
  aurora: { start: [51, 102, 242], end: [242, 76, 204], bg: [5, 5, 7] },
  ember: { start: [242, 128, 26], end: [230, 26, 13], bg: [10, 4, 2] },
  tide: { start: [13, 153, 178], end: [51, 230, 153], bg: [2, 8, 12] },
  ink: { start: [26, 26, 51], end: [128, 51, 217], bg: [3, 3, 8] },
  bone: { start: [217, 217, 204], end: [140, 140, 128], bg: [20, 20, 20] },
  moss: { start: [51, 128, 51], end: [153, 191, 76], bg: [4, 10, 4] },
};

const CFG = {
  width: 2560,
  height: 1440,
  particleCount: 35_000,
  stepsPerFrame: 900,        // ~15s of evolution
  fixedDt: 1 / 60,
  spawnRadius: 8,
  maxAge: 10,
  fieldStrength: 1.8,        // higher than default for stronger streamlines
  noiseScale: 0.55,
  drag: 0.04,                // lower drag so particles travel further
  cameraDistance: 7,
  pointBaseSize: 1.6,
};

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

function initParticles(seed: string, count: number, radius: number): Particle[] {
  const rng = mulberry32(hashSeed(seed));
  const out: Particle[] = [];
  for (let i = 0; i < count; i++) {
    const u = rng();
    const v = rng();
    const theta = 2 * Math.PI * u;
    const phi = Math.acos(2 * v - 1);
    const r = Math.cbrt(rng()) * radius;
    out.push({
      px: r * Math.sin(phi) * Math.cos(theta),
      py: r * Math.sin(phi) * Math.sin(theta),
      pz: r * Math.cos(phi),
      vx: 0, vy: 0, vz: 0,
      age: 0,
      pSeed: rng() * 1000,
    });
  }
  return out;
}

async function render(opts: { seed: string; palette: keyof typeof PALETTES; outputPath: string }) {
  const cfg = CFG;
  const palette = PALETTES[opts.palette];
  console.log(`[hero] seed=${opts.seed.slice(0, 8)} palette=${opts.palette}`);

  const noise = createNoise3D(mulberry32(hashSeed(opts.seed)));
  const baseSeed = hashSeed(opts.seed) * 0.001;

  function snoise3(seed: number, x: number, y: number, z: number, t: number): [number, number, number] {
    const s = seed + baseSeed;
    return [
      noise(x + s + 0, y + s + 17, z + t * 0.1),
      noise(x + s + 31.4, y + s + 27.1 + 9, z + t * 0.13),
      noise(x + s + 57.3, y + s + 91.7 + 19, z + t * 0.07),
    ];
  }

  function curl(seed: number, x: number, y: number, z: number, t: number): [number, number, number] {
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
    return len < 1e-5 ? [0, 0, 0] : [cx / len, cy / len, cz / len];
  }

  function respawn(pSeed: number, simStep: number, spawnRadius: number): [number, number, number] {
    const s = pSeed + simStep * 0.073;
    const ux = Math.sin(s * 12.9898) * 43758.5453 - Math.floor(Math.sin(s * 12.9898) * 43758.5453);
    const uy = Math.sin(s * 78.233) * 43758.5453 - Math.floor(Math.sin(s * 78.233) * 43758.5453);
    const uz = Math.sin(s * 39.346) * 43758.5453 - Math.floor(Math.sin(s * 39.346) * 43758.5453);
    const len = Math.sqrt(ux * ux + uy * uy + uz * uz) || 1;
    const r = Math.cbrt((s * 0.3183099 + 0.1) - Math.floor(s * 0.3183099 + 0.1)) * spawnRadius;
    return [(ux / len) * r, (uy / len) * r, (uz / len) * r];
  }

  const particles = initParticles(opts.seed, cfg.particleCount, cfg.spawnRadius);
  for (let step = 0; step < cfg.stepsPerFrame; step++) {
    const simTime = step * cfg.fixedDt;
    const simStep = step;
    for (const p of particles) {
      const [fx, fy, fz] = curl(p.pSeed * 0.0001, p.px * cfg.noiseScale, p.py * cfg.noiseScale, p.pz * cfg.noiseScale, simTime);
      p.vx += fx * cfg.fieldStrength * cfg.fixedDt;
      p.vy += fy * cfg.fieldStrength * cfg.fixedDt;
      p.vz += fz * cfg.fieldStrength * cfg.fixedDt;
      p.vx *= (1 - cfg.drag);
      p.vy *= (1 - cfg.drag);
      p.vz *= (1 - cfg.drag);
      p.px += p.vx * cfg.fixedDt;
      p.py += p.vy * cfg.fixedDt;
      p.pz += p.vz * cfg.fixedDt;
      p.age += cfg.fixedDt;
      if (p.age > cfg.maxAge || Math.sqrt(p.px * p.px + p.py * p.py + p.pz * p.pz) > cfg.spawnRadius * 1.5) {
        const [nx, ny, nz] = respawn(p.pSeed, simStep, cfg.spawnRadius);
        p.px = nx; p.py = ny; p.pz = nz;
        p.vx = p.vy = p.vz = 0; p.age = 0;
      }
    }
  }

  const canvas = createCanvas(cfg.width, cfg.height);
  const ctx = canvas.getContext("2d");

  // Deep gradient background
  const bgGrad = ctx.createRadialGradient(cfg.width / 2, cfg.height / 2, 0, cfg.width / 2, cfg.height / 2, cfg.width * 0.8);
  bgGrad.addColorStop(0, `rgb(${palette.bg[0] + 18}, ${palette.bg[1] + 10}, ${palette.bg[2] + 28})`);
  bgGrad.addColorStop(0.5, `rgb(${palette.bg[0] + 6}, ${palette.bg[1] + 4}, ${palette.bg[2] + 10})`);
  bgGrad.addColorStop(1, `rgb(${palette.bg[0]}, ${palette.bg[1]}, ${palette.bg[2]})`);
  ctx.fillStyle = bgGrad;
  ctx.fillRect(0, 0, cfg.width, cfg.height);

  // Nebula blobs in palette colors
  for (let i = 0; i < 6; i++) {
    const nx = ((noise(i * 17, i * 23, 0) + 1) / 2) * cfg.width;
    const ny = ((noise(i * 31, i * 11, 0) + 1) / 2) * cfg.height;
    const r = cfg.width * (0.18 + 0.1 * (i / 6));
    const g = ctx.createRadialGradient(nx, ny, 0, nx, ny, r);
    const isAccent = i % 2 === 0;
    const color = isAccent ? palette.end : palette.start;
    g.addColorStop(0, `rgba(${color[0]}, ${color[1]}, ${color[2]}, 0.08)`);
    g.addColorStop(1, `rgba(${color[0]}, ${color[1]}, ${color[2]}, 0)`);
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, cfg.width, cfg.height);
  }

  // Project + sort by depth
  const camZ = cfg.cameraDistance;
  const focal = cfg.height * 1.0;
  const projected = particles.map((p) => {
    const z = p.pz + camZ;
    return {
      ...p,
      sx: cfg.width / 2 + (p.px * focal) / z,
      sy: cfg.height / 2 - (p.py * focal) / z,
      depth: z,
    };
  });
  projected.sort((a, b) => b.depth - a.depth);

  // Render with rich glow
  ctx.globalCompositeOperation = "lighter";
  for (const p of projected) {
    if (p.sx < -100 || p.sx >= cfg.width + 100 || p.sy < -100 || p.sy >= cfg.height + 100) continue;

    const ageT = Math.min(1, p.age / cfg.maxAge);
    const r = Math.round(palette.start[0] * (1 - ageT) + palette.end[0] * ageT);
    const g = Math.round(palette.start[1] * (1 - ageT) + palette.end[1] * ageT);
    const b = Math.round(palette.start[2] * (1 - ageT) + palette.end[2] * ageT);

    const distFactor = 1.0 / (1.0 + p.depth * 0.10);
    const baseSize = cfg.pointBaseSize * distFactor * 2.5;

    // Five-layer glow for that bloom-y feel
    const layers = [
      { sizeMul: 6.0, alpha: 0.025 },
      { sizeMul: 3.5, alpha: 0.06 },
      { sizeMul: 2.0, alpha: 0.15 },
      { sizeMul: 1.0, alpha: 0.45 },
      { sizeMul: 0.4, alpha: 0.85 },
    ];
    for (const layer of layers) {
      const size = baseSize * layer.sizeMul;
      const alpha = layer.alpha * distFactor;
      if (alpha < 0.005) continue;
      ctx.fillStyle = `rgba(${r}, ${g}, ${b}, ${alpha})`;
      ctx.beginPath();
      ctx.arc(p.sx, p.sy, size, 0, Math.PI * 2);
      ctx.fill();
    }
  }

  ctx.globalCompositeOperation = "source-over";

  // Vignette
  const vignette = ctx.createRadialGradient(cfg.width / 2, cfg.height / 2, cfg.height * 0.3, cfg.width / 2, cfg.height / 2, cfg.width * 0.7);
  vignette.addColorStop(0, "rgba(0,0,0,0)");
  vignette.addColorStop(1, "rgba(0,0,0,0.55)");
  ctx.fillStyle = vignette;
  ctx.fillRect(0, 0, cfg.width, cfg.height);

  await fs.mkdir(path.dirname(opts.outputPath), { recursive: true });
  const buffer = canvas.toBuffer("image/png");
  await fs.writeFile(opts.outputPath, buffer);
  console.log(`[hero] wrote ${(buffer.length / 1024).toFixed(0)}KB → ${opts.outputPath}`);
}

const arg = process.argv[2] ?? "aurora";
const presets: Record<string, { seed: string; palette: keyof typeof PALETTES }> = {
  aurora: { seed: "abcdef0123456789abcdef0123456789", palette: "aurora" },
  ember: { seed: "fedcba9876543210fedcba9876543210", palette: "ember" },
  tide: { seed: "0123456789abcdef0123456789abcdef", palette: "tide" },
  moss: { seed: "55555555555555555555555555555555", palette: "moss" },
};

const cfg = presets[arg] ?? presets.aurora;
render({ ...cfg, outputPath: path.resolve(`tmp/renders/hero-${arg}.png`) }).catch((e) => {
  console.error(e);
  process.exit(1);
});