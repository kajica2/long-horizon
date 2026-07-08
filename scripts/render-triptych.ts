/**
 * render-triptych.ts — composites 3 hero renders side by side as a single image.
 */

import { promises as fs } from "node:fs";
import path from "node:path";
import { createCanvas, loadImage, Image } from "canvas";

const TILES = [
  { file: "tmp/renders/hero-ember.png", label: "EMBER" },
  { file: "tmp/renders/hero-tide.png", label: "TIDE" },
  { file: "tmp/renders/hero-moss.png", label: "MOSS" },
];

const TILE_W = 1280;
const TILE_H = 720;
const GAP = 24;
const PADDING = 64;
const LABEL_H = 80;

const W = PADDING * 2 + TILE_W * TILES.length + GAP * (TILES.length - 1);
const H = PADDING * 2 + TILE_H + LABEL_H;

async function main() {
  const canvas = createCanvas(W, H);
  const ctx = canvas.getContext("2d");

  // Deep background
  ctx.fillStyle = "#050507";
  ctx.fillRect(0, 0, W, H);

  // Subtle aurora radial
  const bg = ctx.createRadialGradient(W / 2, H / 2, 0, W / 2, H / 2, W * 0.6);
  bg.addColorStop(0, "rgba(124, 58, 237, 0.10)");
  bg.addColorStop(0.6, "rgba(6, 182, 212, 0.06)");
  bg.addColorStop(1, "rgba(0,0,0,0)");
  ctx.fillStyle = bg;
  ctx.fillRect(0, 0, W, H);

  // Load and draw each tile
  for (let i = 0; i < TILES.length; i++) {
    const t = TILES[i];
    const img = await loadImage(path.resolve(t.file));
    const x = PADDING + i * (TILE_W + GAP);
    const y = PADDING;

    ctx.save();
    // rounded clip
    const r = 16;
    ctx.beginPath();
    ctx.moveTo(x + r, y);
    ctx.lineTo(x + TILE_W - r, y);
    ctx.quadraticCurveTo(x + TILE_W, y, x + TILE_W, y + r);
    ctx.lineTo(x + TILE_W, y + TILE_H - r);
    ctx.quadraticCurveTo(x + TILE_W, y + TILE_H, x + TILE_W - r, y + TILE_H);
    ctx.lineTo(x + r, y + TILE_H);
    ctx.quadraticCurveTo(x, y + TILE_H, x, y + TILE_H - r);
    ctx.lineTo(x, y + r);
    ctx.quadraticCurveTo(x, y, x + r, y);
    ctx.closePath();
    ctx.clip();

    ctx.drawImage(img, x, y, TILE_W, TILE_H);

    ctx.restore();

    // Subtle border
    ctx.strokeStyle = "rgba(255, 255, 255, 0.08)";
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(x + r, y);
    ctx.lineTo(x + TILE_W - r, y);
    ctx.quadraticCurveTo(x + TILE_W, y, x + TILE_W, y + r);
    ctx.lineTo(x + TILE_W, y + TILE_H - r);
    ctx.quadraticCurveTo(x + TILE_W, y + TILE_H, x + TILE_W - r, y + TILE_H);
    ctx.lineTo(x + r, y + TILE_H);
    ctx.quadraticCurveTo(x, y + TILE_H, x, y + TILE_H - r);
    ctx.lineTo(x, y + r);
    ctx.quadraticCurveTo(x, y, x + r, y);
    ctx.closePath();
    ctx.stroke();

    // Label below tile
    ctx.fillStyle = "rgba(237, 237, 237, 0.85)";
    ctx.font = "300 28px sans-serif";
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    ctx.fillText(t.label, x + TILE_W / 2, y + TILE_H + LABEL_H / 2);
  }

  // Top-left brand
  ctx.fillStyle = "rgba(237, 237, 237, 0.62)";
  ctx.font = "300 14px sans-serif";
  ctx.textAlign = "left";
  ctx.fillText("BEATRENDER  ·  LIVING ARTWORKS", PADDING, PADDING - 28);

  const outPath = path.resolve("tmp/renders/triptych.png");
  await fs.mkdir(path.dirname(outPath), { recursive: true });
  const buffer = canvas.toBuffer("image/png");
  await fs.writeFile(outPath, buffer);
  console.log(`[triptych] wrote ${(buffer.length / 1024).toFixed(0)}KB → ${outPath}`);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});