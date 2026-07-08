/**
 * render-demo.ts — render the 3 seed demo artworks at higher quality.
 * Uses params from the seed data (override field strength + drag for visual impact).
 */

import { promises as fs } from "node:fs";
import path from "node:path";
import { createCanvas } from "canvas";
import { createNoise3D } from "simplex-noise";
import { mulberry32, hashSeed } from "../lib/seed";

type RGB = [number, number, number];
type Palette = { start: RGB; end: RGB; bg: RGB };

const PALETTES: Record<string, Palette> = {
  aurora: { start: [51, 102, 242], end: [242, 76, 204], bg: [5, 5, 7] },
  ember: { start: [242, 128, 26], end: [230, 26, 13], bg: [10, 4, 2] },
  tide: { start: [13, 153, 178], end: [51, 230, 153], bg: [2, 8, 12] },
};

const DEMOS = [
  {
    id: "demo-driftwav",
    title: "DRIFT",
    subtitle: "Slow drone · 110 Hz",
    palette: "ember" as keyof typeof PALETTES,
    seed: "demo-driftwav-seed-0000000000000000", // deterministic; real seed comes from DB
    fieldStrength: 1.4,
    noiseScale: 0.4,
    drag: 0.06,
    cameraDistance: 6.5,
  },
  {
    id: "demo-shimmerwav",
    title: "SHIMMER",
    subtitle: "High harmonics · 880 Hz",
    palette: "aurora" as keyof typeof PALETTES,
    seed: "demo-shimmerwav-seed-000000000000000",
    fieldStrength: 2.0,
    noiseScale: 1.1,
    drag: 0.04,
    cameraDistance: 7,
  },
  {
    id: "demo-pulsewav",
    title: "PULSE",
    subtitle: "90 BPM kick · rhythmic",
    palette: "tide" as keyof typeof PALETTES,
    seed: "demo-pulsewav-seed-0000000000000000",
    fieldStrength: 1.6,
    noiseScale: 0.7,
    drag: 0.05,
    cameraDistance: 7,
  },
];

const CFG = {
  width: 1920,
  height: 1080,
  particleCount: 22_000,
  stepsPerFrame: 720,        // ~12s of evolution
  fixedDt: 1 / 60,
  spawnRadius: 8,
  maxAge: 10,
  pointBaseSize: 1.5,
};

type Particle = {
  px: number; py: number; pz: number;
  vx: number; vy: number; vz: number;
  age: number; pSeed: number;
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

async function renderDemo(demo: typeof DEMOS[number]) {
  const cfg = CFG;
  const palette = PALETTES[demo.palette];
  console.log(`[demo] ${demo.id} → ${demo.title}`);

  const noise = createNoise3D(mulberry32(hashSeed(demo.seed)));
  const baseSeed = hashSeed(demo.seed) * 0.001;

  function snoise3(s: number, x: number, y: number, z: number, t: number): [number, number, number] {
    const ss = s + baseSeed;
    return [
      noise(x + ss + 0, y + ss + 17, z + t * 0.1),
      noise(x + ss + 31.4, y + ss + 27.1 + 9, z + t * 0.13),
      noise(x + ss + 57.3, y + ss + 91.7 + 19, z + t * 0.07),
    ];
  }
  function curl(s: number, x: number, y: number, z: number, t: number): [number, number, number] {
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
  }
  function respawn(pSeed: number, simStep: number, radius: number): [number, number, number] {
    const s = pSeed + simStep * 0.073;
    const ux = Math.sin(s * 12.9898) * 43758.5453 - Math.floor(Math.sin(s * 12.9898) * 43758.5453);
    const uy = Math.sin(s * 78.233) * 43758.5453 - Math.floor(Math.sin(s * 78.233) * 43758.5453);
    const uz = Math.sin(s * 39.346) * 43758.5453 - Math.floor(Math.sin(s * 39.346) * 43758.5453);
    const len = Math.sqrt(ux * ux + uy * uy + uz * uz) || 1;
    const r = Math.cbrt((s * 0.3183099 + 0.1) - Math.floor(s * 0.3183099 + 0.1)) * radius;
    return [(ux / len) * r, (uy / len) * r, (uz / len) * r];
  }

  const particles = initParticles(demo.seed, cfg.particleCount, cfg.spawnRadius);
  for (let step = 0; step < cfg.stepsPerFrame; step++) {
    const simTime = step * cfg.fixedDt;
    const simStep = step;
    for (const p of particles) {
      const [fx, fy, fz] = curl(p.pSeed * 0.0001, p.px * demo.noiseScale, p.py * demo.noiseScale, p.pz * demo.noiseScale, simTime);
      p.vx += fx * demo.fieldStrength * cfg.fixedDt;
      p.vy += fy * demo.fieldStrength * cfg.fixedDt;
      p.vz += fz * demo.fieldStrength * cfg.fixedDt;
      p.vx *= (1 - demo.drag);
      p.vy *= (1 - demo.drag);
      p.vz *= (1 - demo.drag);
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

  // Background
  const bgGrad = ctx.createRadialGradient(cfg.width / 2, cfg.height / 2, 0, cfg.width / 2, cfg.height / 2, cfg.width * 0.8);
  bgGrad.addColorStop(0, `rgb(${palette.bg[0] + 16}, ${palette.bg[1] + 8}, ${palette.bg[2] + 24})`);
  bgGrad.addColorStop(1, `rgb(${palette.bg[0]}, ${palette.bg[1]}, ${palette.bg[2]})`);
  ctx.fillStyle = bgGrad;
  ctx.fillRect(0, 0, cfg.width, cfg.height);

  // Nebula
  for (let i = 0; i < 5; i++) {
    const nx = ((noise(i * 17, i * 23, 0) + 1) / 2) * cfg.width;
    const ny = ((noise(i * 31, i * 11, 0) + 1) / 2) * cfg.height;
    const r = cfg.width * (0.15 + 0.08 * (i / 5));
    const g = ctx.createRadialGradient(nx, ny, 0, nx, ny, r);
    const c = i % 2 === 0 ? palette.end : palette.start;
    g.addColorStop(0, `rgba(${c[0]}, ${c[1]}, ${c[2]}, 0.08)`);
    g.addColorStop(1, `rgba(${c[0]}, ${c[1]}, ${c[2]}, 0)`);
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, cfg.width, cfg.height);
  }

  // Project
  const camZ = demo.cameraDistance;
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
    const baseSize = cfg.pointBaseSize * distFactor * 2.3;

    const layers = [
      { sizeMul: 5.0, alpha: 0.03 },
      { sizeMul: 2.8, alpha: 0.08 },
      { sizeMul: 1.5, alpha: 0.18 },
      { sizeMul: 0.8, alpha: 0.5 },
      { sizeMul: 0.35, alpha: 0.85 },
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

  // Title overlay (top-left)
  ctx.fillStyle = "rgba(237,237,237,0.85)";
  ctx.font = "300 36px sans-serif";
  ctx.fillText(demo.title, 64, 80);
  ctx.fillStyle = "rgba(237,237,237,0.5)";
  ctx.font = "300 14px sans-serif";
  ctx.fillText(demo.subtitle.toUpperCase(), 64, 110);

  // Brand mark (top-right)
  ctx.textAlign = "right";
  ctx.fillStyle = "rgba(237,237,237,0.4)";
  ctx.font = "300 11px sans-serif";
  ctx.fillText("BEATRENDER GENESIS", cfg.width - 64, 80);
  ctx.fillText("FLOW FIELD MEDITATION", cfg.width - 64, 100);
  ctx.textAlign = "left";

  // Sim time + seed in bottom-left
  ctx.fillStyle = "rgba(237,237,237,0.4)";
  ctx.font = "300 11px sans-serif";
  ctx.fillText(`seed  ${demo.seed.slice(0, 16)}…`, 64, cfg.height - 64);
  ctx.fillText(`t  ${(cfg.stepsPerFrame * cfg.fixedDt).toFixed(1)}s`, 64, cfg.height - 44);

  // Bottom-right palette label
  ctx.textAlign = "right";
  ctx.fillStyle = "rgba(237,237,237,0.5)";
  ctx.font = "300 11px sans-serif";
  ctx.fillText(demo.palette.toUpperCase(), cfg.width - 64, cfg.height - 44);
  ctx.textAlign = "left";

  const outPath = path.resolve(`tmp/renders/demo-${demo.id}.png`);
  await fs.mkdir(path.dirname(outPath), { recursive: true });
  const buffer = canvas.toBuffer("image/png");
  await fs.writeFile(outPath, buffer);
  console.log(`[demo] wrote ${(buffer.length / 1024).toFixed(0)}KB → ${outPath}`);
}

async function main() {
  for (const demo of DEMOS) {
    await renderDemo(demo);
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});