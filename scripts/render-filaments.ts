/**
 * render-filaments.ts — generates filament/strand artwork renders.
 *
 * Same engine algorithm as render-artwork.ts (curl noise + integration),
 * but renders as accumulated polyline strokes instead of points.
 * This is the visual primitive the reference images imply:
 * pen-plotter / etching aesthetic from layer-by-layer line accumulation.
 *
 * Usage:
 *   npx tsx scripts/render-filaments.ts                  # default seed
 *   npx tsx scripts/render-filaments.ts ember             # palette variant
 *   npx tsx scripts/render-filaments.ts ember --lines 12000
 */

import { promises as fs } from "node:fs";
import path from "node:path";
import { createCanvas } from "canvas";
import { createNoise3D } from "simplex-noise";
import { mulberry32, hashSeed } from "../lib/seed";

// ============================================================
// Palettes — earth-tone / monochrome (matches reference aesthetic)
// ============================================================

type RGB = [number, number, number];
type Palette = {
  bg: RGB;
  line: RGB;
  bgHex: string;
  label: string;
};

const PALETTES: Record<string, Palette> = {
  // Warm sepia on near-black (matches the brown reference images)
  sepia: {
    bg: [13, 11, 9],
    line: [220, 190, 150],
    bgHex: "#0d0b09",
    label: "SEPIA",
  },
  // Cool ink on dark navy
  ink: {
    bg: [8, 10, 14],
    line: [200, 210, 220],
    bgHex: "#080a0e",
    label: "INK",
  },
  // Burnt sienna on warm dark
  ember: {
    bg: [16, 8, 4],
    line: [240, 170, 90],
    bgHex: "#100804",
    label: "EMBER",
  },
  // Soft cream/white on deep black (etching on black)
  bone: {
    bg: [4, 4, 6],
    line: [230, 225, 215],
    bgHex: "#040406",
    label: "BONE",
  },
};

// ============================================================
// Curve tracing through curl-noise field
// ============================================================

type Curve = number[]; // flat [x0, y0, x1, y1, ...]

function traceCurve(
  startX: number,
  startY: number,
  startZ: number,
  numSteps: number,
  noiseScale: number,
  fieldStrength: number,
  drag: number,
  fixedDt: number,
  curlFn: (s: number, x: number, y: number, z: number, t: number) => [number, number, number],
  seedOffset: number,
): Curve {
  const curve: number[] = [];
  let x = startX, y = startY, z = startZ;
  let vx = 0, vy = 0, vz = 0;

  for (let i = 0; i < numSteps; i++) {
    const t = i * fixedDt;
    const [fx, fy, fz] = curlFn(seedOffset, x * noiseScale, y * noiseScale, z * noiseScale, t);

    vx += fx * fieldStrength * fixedDt;
    vy += fy * fieldStrength * fixedDt;
    vz += fz * fieldStrength * fixedDt;
    vx *= (1 - drag);
    vy *= (1 - drag);
    vz *= (1 - drag);
    x += vx * fixedDt;
    y += vy * fixedDt;
    z += vz * fixedDt;

    curve.push(x, y);
  }
  return curve;
}

// ============================================================
// Render
// ============================================================

type RenderConfig = {
  width: number;
  height: number;
  numCurves: number;          // total strokes
  stepsPerCurve: number;      // length of each polyline
  spawnRadius: number;        // initial cloud radius
  fixedDt: number;
  noiseScale: number;
  fieldStrength: number;
  drag: number;
  cameraDistance: number;     // for projection
  focalLength: number;
  lineWidth: number;
  alphaPerCurve: number;      // additive transparency
  variation: number;          // per-curve seed perturbation amplitude
  distribution?: "volume" | "shell" | "radial"; // starting-position topology
};

const DEFAULT_CONFIG: RenderConfig = {
  width: 1920,
  height: 1080,
  numCurves: 22000,
  stepsPerCurve: 200,
  spawnRadius: 8,
  fixedDt: 1 / 60,
  noiseScale: 0.4,
  fieldStrength: 2.2,
  drag: 0.03,
  cameraDistance: 6,
  focalLength: 900,
  lineWidth: 0.55,
  alphaPerCurve: 0.12,
  variation: 0.0,
};

async function render(opts: {
  seed: string;
  palette: keyof typeof PALETTES;
  outputPath: string;
  configOverrides?: Partial<RenderConfig>;
}) {
  const cfg = { ...DEFAULT_CONFIG, ...(opts.configOverrides ?? {}) };
  const palette = PALETTES[opts.palette];

  console.log(`[filaments] seed=${opts.seed.slice(0, 8)} palette=${opts.palette} curves=${cfg.numCurves} → ${opts.outputPath}`);

  const canvas = createCanvas(cfg.width, cfg.height);
  const ctx = canvas.getContext("2d");

  // Background
  ctx.fillStyle = palette.bgHex;
  ctx.fillRect(0, 0, cfg.width, cfg.height);

  // Subtle radial vignette (lighter at center for compositional weight)
  const vig = ctx.createRadialGradient(
    cfg.width / 2, cfg.height / 2, cfg.height * 0.15,
    cfg.width / 2, cfg.height / 2, cfg.width * 0.7,
  );
  vig.addColorStop(0, `rgba(${Math.min(palette.bg[0] + 14, 30)}, ${Math.min(palette.bg[1] + 12, 30)}, ${Math.min(palette.bg[2] + 10, 30)}, 1)`);
  vig.addColorStop(1, `rgba(${palette.bg[0]}, ${palette.bg[1]}, ${palette.bg[2]}, 0)`);
  ctx.fillStyle = vig;
  ctx.fillRect(0, 0, cfg.width, cfg.height);

  // Curl-noise function (seeded)
  const baseSeed = hashSeed(opts.seed);
  const noise = createNoise3D(mulberry32(baseSeed));
  const noiseScaleBase = baseSeed * 0.001;

  function curlFn(s: number, x: number, y: number, z: number, t: number): [number, number, number] {
    const seed = s + noiseScaleBase;
    function snoise3(sx: number, sy: number, sz: number): [number, number, number] {
      return [
        noise(sx + seed + 0, sy + seed + 17, sz + t * 0.1),
        noise(sx + seed + 31.4, sy + seed + 27.1 + 9, sz + t * 0.13),
        noise(sx + seed + 57.3, sy + seed + 91.7 + 19, sz + t * 0.07),
      ];
    }
    const e = 0.05;
    const p_x0 = snoise3(x - e, y, z);
    const p_x1 = snoise3(x + e, y, z);
    const p_y0 = snoise3(x, y - e, z);
    const p_y1 = snoise3(x, y + e, z);
    const p_z0 = snoise3(x, y, z - e);
    const p_z1 = snoise3(x, y, z + e);
    const cx = (p_y1[2] - p_y0[2]) - (p_z1[1] - p_z0[1]);
    const cy = (p_z1[0] - p_z0[0]) - (p_x1[2] - p_x0[2]);
    const cz = (p_x1[1] - p_x0[1]) - (p_y1[0] - p_y0[0]);
    const len = Math.sqrt(cx * cx + cy * cy + cz * cz);
    return len < 1e-5 ? [0, 0, 0] : [cx / len, cy / len, cz / len];
  }

  // Seeded curve starts — distribution depends on topology variant
  const rng = mulberry32(baseSeed);
  const distribution = cfg.distribution ?? "volume";

  // Render strokes in additive 'lighter' mode — accumulation creates texture
  ctx.globalCompositeOperation = "lighter";
  ctx.lineWidth = cfg.lineWidth;
  ctx.lineCap = "round";
  ctx.lineJoin = "round";
  ctx.strokeStyle = `rgba(${palette.line[0]}, ${palette.line[1]}, ${palette.line[2]}, ${cfg.alphaPerCurve})`;

  for (let i = 0; i < cfg.numCurves; i++) {
    // Distribution variant: volume / shell / radial
    const distribution = cfg.distribution ?? "volume";
    let startX = 0, startY = 0, startZ = 0;
    if (distribution === "shell") {
      // Sphere SURFACE — radial starts, tangential integration creates
      // shell-flowing patterns matching reference image #1
      const u = rng();
      const v = rng();
      const theta = 2 * Math.PI * u;
      const phi = Math.acos(2 * v - 1);
      startX = cfg.spawnRadius * Math.sin(phi) * Math.cos(theta);
      startY = cfg.spawnRadius * Math.sin(phi) * Math.sin(theta);
      startZ = cfg.spawnRadius * Math.cos(phi);
    } else if (distribution === "radial") {
      // Start near origin, integrate outward — radial-flow patterns
      const u = rng();
      const v = rng();
      const theta = 2 * Math.PI * u;
      const phi = Math.acos(2 * v - 1);
      const r = rng() * 1.5;
      startX = r * Math.sin(phi) * Math.cos(theta);
      startY = r * Math.sin(phi) * Math.sin(theta);
      startZ = r * Math.cos(phi);
    } else {
      // Volume: cube-root for uniform density
      const u = rng();
      const v = rng();
      const theta = 2 * Math.PI * u;
      const phi = Math.acos(2 * v - 1);
      const r = Math.cbrt(rng()) * cfg.spawnRadius;
      startX = r * Math.sin(phi) * Math.cos(theta);
      startY = r * Math.sin(phi) * Math.sin(theta);
      startZ = r * Math.cos(phi);
    }

    const seedOffset = rng() * 1000 + cfg.variation * i;

    const curve = traceCurve(
      startX, startY, startZ,
      cfg.stepsPerCurve,
      cfg.noiseScale,
      cfg.fieldStrength,
      cfg.drag,
      cfg.fixedDt,
      curlFn,
      seedOffset,
    );

    // Random in-plane rotation per curve — adds compositional variety
    // and breaks the horizontal banding from the projection.
    const curveTheta = rng() * Math.PI * 2;
    const cosT = Math.cos(curveTheta);
    const sinT = Math.sin(curveTheta);

    // Project to 2D using simple perspective (drop z for projection —
    // we already have full 3D integration, so xy is the visible slice)
    ctx.beginPath();
    let first = true;
    for (let j = 0; j < curve.length; j += 2) {
      const x3 = curve[j];
      const y3 = curve[j + 1];
      // Rotate in plane
      const rx = x3 * cosT - y3 * sinT;
      const ry = x3 * sinT + y3 * cosT;
      const z = startZ + cfg.cameraDistance;
      const sx = cfg.width / 2 + (rx * cfg.focalLength) / z;
      const sy = cfg.height / 2 - (ry * cfg.focalLength) / z;
      if (first) {
        ctx.moveTo(sx, sy);
        first = false;
      } else {
        ctx.lineTo(sx, sy);
      }
    }
    ctx.stroke();
  }

  ctx.globalCompositeOperation = "source-over";

  // Final vignette — darker edges
  const finalVig = ctx.createRadialGradient(
    cfg.width / 2, cfg.height / 2, cfg.width * 0.35,
    cfg.width / 2, cfg.height / 2, cfg.width * 0.75,
  );
  finalVig.addColorStop(0, "rgba(0,0,0,0)");
  finalVig.addColorStop(1, "rgba(0,0,0,0.55)");
  ctx.fillStyle = finalVig;
  ctx.fillRect(0, 0, cfg.width, cfg.height);

  // Title overlay (subtle, top-left)
  ctx.fillStyle = `rgba(${palette.line[0]}, ${palette.line[1]}, ${palette.line[2]}, 0.85)`;
  ctx.font = "300 32px sans-serif";
  ctx.fillText(palette.label, 60, 70);
  ctx.fillStyle = `rgba(${palette.line[0]}, ${palette.line[1]}, ${palette.line[2]}, 0.45)`;
  ctx.font = "300 12px sans-serif";
  ctx.fillText("BEATRENDER GENESIS  ·  COSMIC FILAMENTS", 60, 95);

  // Bottom-right meta
  ctx.textAlign = "right";
  ctx.fillStyle = `rgba(${palette.line[0]}, ${palette.line[1]}, ${palette.line[2]}, 0.35)`;
  ctx.font = "300 11px sans-serif";
  ctx.fillText(`seed ${opts.seed.slice(0, 14)}…`, cfg.width - 60, cfg.height - 60);
  ctx.fillText(`${cfg.numCurves} curves  ·  ${cfg.stepsPerCurve} steps`, cfg.width - 60, cfg.height - 40);
  ctx.textAlign = "left";

  await fs.mkdir(path.dirname(opts.outputPath), { recursive: true });
  const buffer = canvas.toBuffer("image/png");
  await fs.writeFile(opts.outputPath, buffer);
  console.log(`[filaments] wrote ${(buffer.length / 1024).toFixed(0)}KB → ${opts.outputPath}`);
}

// ============================================================
// CLI
// ============================================================

async function main() {
  const argPalette = process.argv[2] ?? "all";

  // Topology variants — each shows a different starting distribution
  const presets = [
    { seed: "11111111111111111111111111111111", palette: "sepia" as keyof typeof PALETTES, file: "filaments-shell-sepia.png",  distribution: "shell" as const },
    { seed: "22222222222222222222222222222222", palette: "sepia" as keyof typeof PALETTES, file: "filaments-radial-sepia.png", distribution: "radial" as const },
    { seed: "33333333333333333333333333333333", palette: "sepia" as keyof typeof PALETTES, file: "filaments-volume-sepia.png", distribution: "volume" as const },
    { seed: "44444444444444444444444444444444", palette: "ink"   as keyof typeof PALETTES, file: "filaments-shell-ink.png",    distribution: "shell" as const },
  ];

  for (const p of presets) {
    if (argPalette !== "all" && argPalette !== p.palette) continue;
    await render({
      seed: p.seed,
      palette: p.palette,
      outputPath: path.resolve(`tmp/renders/${p.file}`),
      configOverrides: { distribution: p.distribution },
    });
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});