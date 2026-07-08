/**
 * render-filament-set.ts — generates the full set of filament-style images
 * for the vision website. Each preset uses a different topology + palette
 * + seed combination to produce visually distinct artwork matching the
 * reference aesthetic (pen-plotter accumulation, monochrome, dense).
 */

import { promises as fs } from "node:fs";
import path from "node:path";
import { createCanvas } from "canvas";
import { createNoise3D } from "simplex-noise";
import { mulberry32, hashSeed } from "../lib/seed";

type RGB = [number, number, number];
type Palette = {
  bg: RGB;
  line: RGB;
  bgHex: string;
  label: string;
};

const PALETTES: Record<string, Palette> = {
  sepia: { bg: [13, 11, 9], line: [220, 190, 150], bgHex: "#0d0b09", label: "SEPIA" },
  ink:   { bg: [8, 10, 14], line: [200, 210, 220], bgHex: "#080a0e", label: "INK" },
  ember: { bg: [16, 8, 4],  line: [240, 170, 90],  bgHex: "#100804", label: "EMBER" },
  bone:  { bg: [4, 4, 6],   line: [230, 225, 215], bgHex: "#040406", label: "BONE" },
  ash:   { bg: [10, 10, 12], line: [180, 175, 165], bgHex: "#0a0a0c", label: "ASH" },
};

// ============================================================
// Curve tracing + rendering
// ============================================================

function traceCurve(
  startX: number, startY: number, startZ: number,
  numSteps: number,
  noiseScale: number,
  fieldStrength: number,
  drag: number,
  fixedDt: number,
  curlFn: (s: number, x: number, y: number, z: number, t: number) => [number, number, number],
  seedOffset: number,
): number[] {
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
// Topologies — each returns [x, y, z] starting positions
// ============================================================

type RNG = () => number;

function sphereStart(rng: RNG, radius: number): [number, number, number] {
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

function shellStart(rng: RNG, radius: number): [number, number, number] {
  const u = rng();
  const v = rng();
  const theta = 2 * Math.PI * u;
  const phi = Math.acos(2 * v - 1);
  return [
    radius * Math.sin(phi) * Math.cos(theta),
    radius * Math.sin(phi) * Math.sin(theta),
    radius * Math.cos(phi),
  ];
}

function radialStart(rng: RNG): [number, number, number] {
  const u = rng();
  const v = rng();
  const theta = 2 * Math.PI * u;
  const phi = Math.acos(2 * v - 1);
  const r = rng() * 1.5;
  return [
    r * Math.sin(phi) * Math.cos(theta),
    r * Math.sin(phi) * Math.sin(theta),
    r * Math.cos(phi),
  ];
}

function columnStart(rng: RNG, numColumns: number, columnWidth: number): [number, number, number] {
  // Distribute particles into vertical columns
  const col = Math.floor(rng() * numColumns);
  const colX = (col - (numColumns - 1) / 2) * columnWidth + (rng() - 0.5) * columnWidth * 0.3;
  const colZ = (rng() - 0.5) * columnWidth * 0.3;
  const y = (rng() - 0.5) * 16;
  return [colX, y, colZ];
}

function layeredStart(rng: RNG, numLayers: number, layerSpacing: number): [number, number, number] {
  // Particles stratified by z
  const layer = Math.floor(rng() * numLayers);
  const z = (layer - (numLayers - 1) / 2) * layerSpacing + (rng() - 0.5) * layerSpacing * 0.4;
  const x = (rng() - 0.5) * 14;
  const y = (rng() - 0.5) * 9;
  return [x, y, z];
}

function polarStart(rng: RNG, radius: number): [number, number, number] {
  // Polar grid — particles in concentric rings at random angles
  const ring = Math.floor(rng() * 12); // 12 rings
  const ringRadius = (ring + 1) * (radius / 12);
  const angle = rng() * 2 * Math.PI;
  return [
    ringRadius * Math.cos(angle),
    (rng() - 0.5) * 0.5, // mostly flat in y
    ringRadius * Math.sin(angle),
  ];
}

// ============================================================
// Single render function
// ============================================================

type RenderConfig = {
  width: number;
  height: number;
  numCurves: number;
  stepsPerCurve: number;
  fieldStrength: number;
  drag: number;
  noiseScale: number;
  lineWidth: number;
  alphaPerCurve: number;
  spawnRadius: number;
  startFn: (rng: RNG) => [number, number, number];
  rotationPerCurve: boolean;
};

const DEFAULT_CFG: RenderConfig = {
  width: 1920,
  height: 1080,
  numCurves: 22000,
  stepsPerCurve: 180,
  fieldStrength: 1.6,
  drag: 0.035,
  noiseScale: 0.45,
  lineWidth: 0.5,
  alphaPerCurve: 0.13,
  spawnRadius: 8,
  startFn: (rng) => sphereStart(rng, 8),
  rotationPerCurve: true,
};

async function render(opts: {
  seed: string;
  palette: keyof typeof PALETTES;
  outputPath: string;
  config?: Partial<RenderConfig>;
  title?: string;
}) {
  const cfg: RenderConfig = { ...DEFAULT_CFG, ...(opts.config ?? {}) };
  const palette = PALETTES[opts.palette];
  console.log(`[filament] ${opts.outputPath}  palette=${opts.palette}  curves=${cfg.numCurves}  steps=${cfg.stepsPerCurve}`);

  const canvas = createCanvas(cfg.width, cfg.height);
  const ctx = canvas.getContext("2d");

  // Background
  ctx.fillStyle = palette.bgHex;
  ctx.fillRect(0, 0, cfg.width, cfg.height);

  // Subtle vignette
  const vig = ctx.createRadialGradient(
    cfg.width / 2, cfg.height / 2, cfg.height * 0.15,
    cfg.width / 2, cfg.height / 2, cfg.width * 0.75,
  );
  vig.addColorStop(0, `rgba(${Math.min(palette.bg[0] + 14, 30)}, ${Math.min(palette.bg[1] + 12, 30)}, ${Math.min(palette.bg[2] + 10, 30)}, 1)`);
  vig.addColorStop(1, `rgba(${palette.bg[0]}, ${palette.bg[1]}, ${palette.bg[2]}, 0)`);
  ctx.fillStyle = vig;
  ctx.fillRect(0, 0, cfg.width, cfg.height);

  // Curl-noise (using simplex-noise for proper curl math)
  const baseSeed = hashSeed(opts.seed);
  const noise = createNoise3D(mulberry32(baseSeed));
  const seedShift = baseSeed * 0.001;

  function curlFn(s: number, x: number, y: number, z: number, t: number): [number, number, number] {
    const seed = s + seedShift;
    function snoise3(sx: number, sy: number, sz: number): [number, number, number] {
      return [
        noise(sx + seed + 0,        sy + seed + 17,       sz + t * 0.1),
        noise(sx + seed + 31.4,     sy + seed + 27.1 + 9, sz + t * 0.13),
        noise(sx + seed + 57.3,     sy + seed + 91.7 + 19, sz + t * 0.07),
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

  const rng = mulberry32(baseSeed);

  ctx.globalCompositeOperation = "lighter";
  ctx.lineWidth = cfg.lineWidth;
  ctx.lineCap = "round";
  ctx.lineJoin = "round";
  ctx.strokeStyle = `rgba(${palette.line[0]}, ${palette.line[1]}, ${palette.line[2]}, ${cfg.alphaPerCurve})`;

  for (let i = 0; i < cfg.numCurves; i++) {
    const [startX, startY, startZ] = cfg.startFn(rng);
    const seedOffset = rng() * 1000;

    const curve = traceCurve(
      startX, startY, startZ,
      cfg.stepsPerCurve,
      cfg.noiseScale,
      cfg.fieldStrength,
      cfg.drag,
      1 / 60,
      curlFn,
      seedOffset,
    );

    let rotAngle = 0;
    let cosR = 1, sinR = 0;
    if (cfg.rotationPerCurve) {
      rotAngle = rng() * Math.PI * 2;
      cosR = Math.cos(rotAngle);
      sinR = Math.sin(rotAngle);
    }

    ctx.beginPath();
    let first = true;
    for (let j = 0; j < curve.length; j += 2) {
      let x3 = curve[j];
      let y3 = curve[j + 1];
      if (cfg.rotationPerCurve) {
        const rx = x3 * cosR - y3 * sinR;
        const ry = x3 * sinR + y3 * cosR;
        x3 = rx; y3 = ry;
      }
      const z = startZ + 6;
      const focal = cfg.height * 1.0;
      const sx = cfg.width / 2 + (x3 * focal) / z;
      const sy = cfg.height / 2 - (y3 * focal) / z;
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

  // Final vignette
  const finalVig = ctx.createRadialGradient(
    cfg.width / 2, cfg.height / 2, cfg.width * 0.35,
    cfg.width / 2, cfg.height / 2, cfg.width * 0.75,
  );
  finalVig.addColorStop(0, "rgba(0,0,0,0)");
  finalVig.addColorStop(1, "rgba(0,0,0,0.55)");
  ctx.fillStyle = finalVig;
  ctx.fillRect(0, 0, cfg.width, cfg.height);

  // Subtle title overlay
  if (opts.title) {
    ctx.fillStyle = `rgba(${palette.line[0]}, ${palette.line[1]}, ${palette.line[2]}, 0.85)`;
    ctx.font = "300 30px sans-serif";
    ctx.fillText(opts.title, 60, 70);
    ctx.fillStyle = `rgba(${palette.line[0]}, ${palette.line[1]}, ${palette.line[2]}, 0.45)`;
    ctx.font = "300 11px sans-serif";
    ctx.fillText("BEATRENDER GENESIS  ·  COSMIC FILAMENTS", 60, 92);
  }

  await fs.mkdir(path.dirname(opts.outputPath), { recursive: true });
  const buffer = canvas.toBuffer("image/png");
  await fs.writeFile(opts.outputPath, buffer);
  console.log(`  → wrote ${(buffer.length / 1024).toFixed(0)}KB`);
}

// ============================================================
// Preset set — matches the website sections
// ============================================================

const PRESETS = [
  // Hero — dramatic radial structure, sepia (eye-catching)
  {
    name: "hero",
    seed: "11111111111111111111111111111111",
    palette: "sepia" as keyof typeof PALETTES,
    title: "DRIFT",
    config: {
      numCurves: 18000,
      stepsPerCurve: 200,
      fieldStrength: 2.0,
      noiseScale: 0.5,
      drag: 0.03,
      lineWidth: 0.55,
      alphaPerCurve: 0.16,
      startFn: (rng: RNG) => radialStart(rng),
    },
  },
  // Philosophy — meditative sphere-shell
  {
    name: "philosophy",
    seed: "22222222222222222222222222222222",
    palette: "ink" as keyof typeof PALETTES,
    title: "MEMORY",
    config: {
      numCurves: 20000,
      stepsPerCurve: 160,
      fieldStrength: 1.8,
      noiseScale: 0.4,
      drag: 0.04,
      lineWidth: 0.5,
      alphaPerCurve: 0.13,
      startFn: (rng: RNG) => shellStart(rng, 7),
    },
  },
  // Living Systems — dense volume with strong flow
  {
    name: "living-systems",
    seed: "33333333333333333333333333333333",
    palette: "sepia" as keyof typeof PALETTES,
    title: "THE GROVE",
    config: {
      numCurves: 26000,
      stepsPerCurve: 160,
      fieldStrength: 1.5,
      noiseScale: 0.55,
      drag: 0.05,
      lineWidth: 0.45,
      alphaPerCurve: 0.1,
      startFn: (rng: RNG) => sphereStart(rng, 7.5),
    },
  },
  // The Flow — columnar, suggests motion direction
  {
    name: "flow",
    seed: "44444444444444444444444444444444",
    palette: "ash" as keyof typeof PALETTES,
    title: "THE FLOW",
    config: {
      numCurves: 16000,
      stepsPerCurve: 220,
      fieldStrength: 1.4,
      noiseScale: 0.35,
      drag: 0.045,
      lineWidth: 0.55,
      alphaPerCurve: 0.16,
      startFn: (rng: RNG) => columnStart(rng, 14, 1.6),
    },
  },
  // Creative Genome — dense, structured
  {
    name: "genome",
    seed: "55555555555555555555555555555555",
    palette: "bone" as keyof typeof PALETTES,
    title: "GENOME",
    config: {
      numCurves: 30000,
      stepsPerCurve: 140,
      fieldStrength: 1.2,
      noiseScale: 0.6,
      drag: 0.06,
      lineWidth: 0.4,
      alphaPerCurve: 0.08,
      startFn: (rng: RNG) => sphereStart(rng, 6.5),
    },
  },
  // Timeline of Evolution — layered (time = layers)
  {
    name: "timeline",
    seed: "66666666666666666666666666666666",
    palette: "ember" as keyof typeof PALETTES,
    title: "TIMELINE",
    config: {
      numCurves: 18000,
      stepsPerCurve: 180,
      fieldStrength: 1.6,
      noiseScale: 0.42,
      drag: 0.04,
      lineWidth: 0.55,
      alphaPerCurve: 0.15,
      startFn: (rng: RNG) => layeredStart(rng, 6, 1.8),
    },
  },
  // Procedural Storytelling — narrative flow
  {
    name: "storytelling",
    seed: "77777777777777777777777777777777",
    palette: "ink" as keyof typeof PALETTES,
    title: "STORYTELLING",
    config: {
      numCurves: 22000,
      stepsPerCurve: 180,
      fieldStrength: 1.7,
      noiseScale: 0.5,
      drag: 0.04,
      lineWidth: 0.5,
      alphaPerCurve: 0.12,
      startFn: (rng: RNG) => sphereStart(rng, 8),
    },
  },
  // Beyond Music — composite / multiple topologies (triptych-like)
  {
    name: "beyond-music",
    seed: "88888888888888888888888888888888",
    palette: "sepia" as keyof typeof PALETTES,
    title: "BEYOND",
    config: {
      numCurves: 20000,
      stepsPerCurve: 200,
      fieldStrength: 1.8,
      noiseScale: 0.45,
      drag: 0.035,
      lineWidth: 0.55,
      alphaPerCurve: 0.14,
      startFn: (rng: RNG) => polarStart(rng, 9),
    },
  },
  // Interactive Playground — radial, dynamic
  {
    name: "interactive",
    seed: "99999999999999999999999999999999",
    palette: "ash" as keyof typeof PALETTES,
    title: "INTERACTIVE",
    config: {
      numCurves: 16000,
      stepsPerCurve: 180,
      fieldStrength: 2.2,
      noiseScale: 0.5,
      drag: 0.03,
      lineWidth: 0.6,
      alphaPerCurve: 0.18,
      startFn: (rng: RNG) => radialStart(rng),
    },
  },
  // Physical Outputs — warm, dense (printable feel)
  {
    name: "physical",
    seed: "aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa",
    palette: "ember" as keyof typeof PALETTES,
    title: "PHYSICAL",
    config: {
      numCurves: 24000,
      stepsPerCurve: 180,
      fieldStrength: 1.5,
      noiseScale: 0.5,
      drag: 0.045,
      lineWidth: 0.5,
      alphaPerCurve: 0.11,
      startFn: (rng: RNG) => sphereStart(rng, 7.5),
    },
  },
  // CTA — radial, inviting
  {
    name: "cta",
    seed: "bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb",
    palette: "bone" as keyof typeof PALETTES,
    title: "ENTER",
    config: {
      numCurves: 16000,
      stepsPerCurve: 200,
      fieldStrength: 1.8,
      noiseScale: 0.5,
      drag: 0.04,
      lineWidth: 0.6,
      alphaPerCurve: 0.15,
      startFn: (rng: RNG) => radialStart(rng),
    },
  },
];

async function main() {
  for (const p of PRESETS) {
    await render({
      seed: p.seed,
      palette: p.palette,
      outputPath: path.resolve(`tmp/renders/website-${p.name}.png`),
      title: p.title,
      config: p.config as Partial<RenderConfig>,
    });
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});