/**
 * render-planetary-polaroids.ts — generate "polaroid" PNG renders for each
 * seeded planetary artwork. Static CPU output of the Cosmic Filaments system.
 *
 * These serve as preview images for the shareable links (Stage 9) and as
 * proof that the engine's deterministic output matches the seed.
 */

import { promises as fs } from "node:fs";
import path from "node:path";
import { createCanvas } from "canvas";
import { mulberry32, hashSeed } from "../lib/seed";
import { generateFilamentSegments } from "../lib/engine/filaments";

// Re-using the algorithm from lib/engine/filaments.ts but with palette + title baked in.

type RGB = [number, number, number];

const PALETTES: Record<string, { bg: RGB; line: RGB; bgHex: string; label: string }> = {
  ink:    { bg: [8, 10, 14],    line: [200, 210, 220], bgHex: "#080a0e", label: "INK" },
  ember:  { bg: [16, 8, 4],     line: [240, 170, 90],  bgHex: "#100804", label: "EMBER" },
  sepia:  { bg: [13, 11, 9],    line: [220, 190, 150], bgHex: "#0d0b09", label: "SEPIA" },
  bone:   { bg: [4, 4, 6],      line: [230, 225, 215], bgHex: "#040406", label: "BONE" },
  aurora: { bg: [10, 8, 18],    line: [180, 140, 240], bgHex: "#0a0812", label: "AURORA" },
};

async function renderPolaroid(opts: {
  seed: string;
  palette: keyof typeof PALETTES;
  count: number;
  steps: number;
  fieldStrength: number;
  noiseScale: number;
  drag: number;
  spawnRadius: number;
  outputPath: string;
  title: string;
  subtitle: string;
}) {
  const palette = PALETTES[opts.palette];
  console.log(`[polaroid] ${opts.title} → ${opts.outputPath}`);

  const segments = generateFilamentSegments({
    seed: opts.seed,
    count: opts.count,
    stepsPerCurve: opts.steps,
    spawnRadius: opts.spawnRadius,
    fieldStrength: opts.fieldStrength,
    noiseScale: opts.noiseScale,
    drag: opts.drag,
  });

  const W = 1920, H = 1080;
  const canvas = createCanvas(W, H);
  const ctx = canvas.getContext("2d");

  // Background
  ctx.fillStyle = palette.bgHex;
  ctx.fillRect(0, 0, W, H);

  // Vignette
  const vig = ctx.createRadialGradient(W/2, H/2, H*0.15, W/2, H/2, W*0.75);
  vig.addColorStop(0, `rgba(${Math.min(palette.bg[0]+14, 30)}, ${Math.min(palette.bg[1]+12, 30)}, ${Math.min(palette.bg[2]+10, 30)}, 1)`);
  vig.addColorStop(1, `rgba(${palette.bg[0]}, ${palette.bg[1]}, ${palette.bg[2]}, 0)`);
  ctx.fillStyle = vig;
  ctx.fillRect(0, 0, W, H);

  // Project + draw
  ctx.globalCompositeOperation = "lighter";
  ctx.strokeStyle = `rgba(${palette.line[0]}, ${palette.line[1]}, ${palette.line[2]}, 0.13)`;
  ctx.lineWidth = 0.55;
  ctx.lineCap = "round";
  ctx.lineJoin = "round";

  const segCount = segments.length / 6;
  for (let i = 0; i < segCount; i++) {
    const o = i * 6;
    const x0 = segments[o],     y0 = segments[o+1], z0 = segments[o+2];
    const x1 = segments[o+3], y1 = segments[o+4], z1 = segments[o+5];
    // Slight per-curve rotation via fixed angle
    const r = i * 0.001;
    const cosR = Math.cos(r), sinR = Math.sin(r);
    const camZ = 9, focal = H * 0.95;
    const zA = (z0 + camZ), zB = (z1 + camZ);
    const ax = W/2 + (x0 * cosR - y0 * sinR) * focal / zA;
    const ay = H/2 - (x0 * sinR + y0 * cosR) * focal / zA;
    const bx = W/2 + (x1 * cosR - y1 * sinR) * focal / zB;
    const by = H/2 - (x1 * sinR + y1 * cosR) * focal / zB;
    ctx.beginPath();
    ctx.moveTo(ax, ay);
    ctx.lineTo(bx, by);
    ctx.stroke();
  }

  ctx.globalCompositeOperation = "source-over";

  // Final vignette
  const finalVig = ctx.createRadialGradient(W/2, H/2, W*0.35, W/2, H/2, W*0.75);
  finalVig.addColorStop(0, "rgba(0,0,0,0)");
  finalVig.addColorStop(1, "rgba(0,0,0,0.55)");
  ctx.fillStyle = finalVig;
  ctx.fillRect(0, 0, W, H);

  // Title overlay
  ctx.fillStyle = `rgba(${palette.line[0]}, ${palette.line[1]}, ${palette.line[2]}, 0.85)`;
  ctx.font = "300 30px sans-serif";
  ctx.fillText(opts.title.toUpperCase(), 60, 70);
  ctx.fillStyle = `rgba(${palette.line[0]}, ${palette.line[1]}, ${palette.line[2]}, 0.5)`;
  ctx.font = "300 12px sans-serif";
  ctx.fillText(opts.subtitle, 60, 92);
  ctx.fillText("BEATRENDER GENESIS  ·  COSMIC FILAMENTS", 60, 110);

  // Seed in bottom-right
  ctx.textAlign = "right";
  ctx.fillStyle = `rgba(${palette.line[0]}, ${palette.line[1]}, ${palette.line[2]}, 0.35)`;
  ctx.font = "300 11px sans-serif";
  ctx.fillText(`seed  ${opts.seed.slice(0, 16)}…`, W - 60, H - 40);
  ctx.textAlign = "left";

  await fs.mkdir(path.dirname(opts.outputPath), { recursive: true });
  const buf = canvas.toBuffer("image/png");
  await fs.writeFile(opts.outputPath, buf);
  console.log(`  → wrote ${(buf.length / 1024).toFixed(0)}KB`);
}

async function main() {
  // Render polaroids for the seeded planetary artworks.
  // We derive seeds the same way the seed script does, so the polaroid
  // matches what the live GPU engine will produce.
  const moments = [
    { id: "planetary-jul2026", date: "2026-07-08T12:00:00.000Z", title: "July 8, 2026",  palette: "ink" as const,    fieldStrength: 1.5, noiseScale: 0.5 },
    { id: "planetary-jan2026", date: "2026-01-15T06:00:00.000Z", title: "January 15, 2026", palette: "ember" as const, fieldStrength: 1.8, noiseScale: 0.4 },
    { id: "planetary-apr2025", date: "2025-04-20T18:00:00.000Z", title: "April 20, 2025",  palette: "sepia" as const, fieldStrength: 1.6, noiseScale: 0.45 },
  ];

  for (const m of moments) {
    // Reproduce the seed algorithm: hashSeedForDemo from seed.ts
    let h = 2166136261 >>> 0;
    for (let i = 0; i < m.id.length; i++) {
      h ^= m.id.charCodeAt(i);
      h = Math.imul(h, 16777619);
    }
    const a = h.toString(16).padStart(8, "0");
    const b = (Math.imul(h, 16777619) >>> 0).toString(16).padStart(8, "0");
    const c = (Math.imul(h ^ 0x9e3779b9, 16777619) >>> 0).toString(16).padStart(8, "0");
    const d = (Math.imul(h ^ 0x85ebca6b, 16777619) >>> 0).toString(16).padStart(8, "0");
    const seed = a + b + c + d;

    await renderPolaroid({
      seed,
      palette: m.palette,
      count: 3500,
      steps: 90,
      fieldStrength: m.fieldStrength,
      noiseScale: m.noiseScale,
      drag: 0.05,
      spawnRadius: 7,
      outputPath: path.resolve(`tmp/renders/polaroid-${m.id}.png`),
      title: m.title,
      subtitle: m.date,
    });
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});