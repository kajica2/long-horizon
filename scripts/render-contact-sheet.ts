/**
 * render-contact-sheet.ts — composites all artwork renders into a single grid image.
 * One image = everything. Easy to save on a phone.
 */

import { promises as fs } from "node:fs";
import path from "node:path";
import { createCanvas, loadImage } from "canvas";

const TILES = [
  { file: "tmp/renders/demo-demo-driftwav.png",   label: "DRIFT",   subtitle: "Slow drone · 110 Hz",     palette: "ember" },
  { file: "tmp/renders/demo-demo-shimmerwav.png", label: "SHIMMER", subtitle: "High harmonics · 880 Hz", palette: "aurora" },
  { file: "tmp/renders/demo-demo-pulsewav.png",   label: "PULSE",   subtitle: "90 BPM kick · rhythmic", palette: "tide" },
  { file: "tmp/renders/hero-aurora.png",          label: "AURORA",  subtitle: "Hero · aurora palette",   palette: "aurora" },
  { file: "tmp/renders/hero-ember.png",           label: "EMBER",   subtitle: "Hero · ember palette",    palette: "ember" },
  { file: "tmp/renders/hero-tide.png",            label: "TIDE",    subtitle: "Hero · tide palette",     palette: "tide" },
  { file: "tmp/renders/hero-moss.png",            label: "MOSS",    subtitle: "Hero · moss palette",     palette: "moss" },
  { file: "diagrams/concept-living-artwork.png",  label: "INSTALL", subtitle: "Installation concept",    palette: "" },
];

const COLS = 2;
const TILE_W = 960;
const TILE_H = 540;
const GAP = 24;
const PADDING = 80;
const LABEL_H = 60;
const TITLE_H = 140;
const FOOTER_H = 80;

const ROWS = Math.ceil(TILES.length / COLS);
const W = PADDING * 2 + TILE_W * COLS + GAP * (COLS - 1);
const H = TITLE_H + PADDING + TILE_H * ROWS + GAP * (ROWS - 1) + LABEL_H * ROWS + FOOTER_H + PADDING;

async function main() {
  const canvas = createCanvas(W, H);
  const ctx = canvas.getContext("2d");

  // Background
  ctx.fillStyle = "#050507";
  ctx.fillRect(0, 0, W, H);

  // Aurora radial glow
  const bg = ctx.createRadialGradient(W / 2, H * 0.3, 0, W / 2, H * 0.3, W * 0.6);
  bg.addColorStop(0, "rgba(124, 58, 237, 0.10)");
  bg.addColorStop(0.5, "rgba(6, 182, 212, 0.05)");
  bg.addColorStop(1, "rgba(0,0,0,0)");
  ctx.fillStyle = bg;
  ctx.fillRect(0, 0, W, H);

  // Title
  ctx.fillStyle = "rgba(237, 237, 237, 0.95)";
  ctx.font = "300 56px sans-serif";
  ctx.textBaseline = "top";
  ctx.fillText("BeatRender Genesis", PADDING, 64);

  ctx.fillStyle = "rgba(237, 237, 237, 0.5)";
  ctx.font = "300 18px sans-serif";
  ctx.fillText("Creates living artworks  ·  Stage 3 visual proof", PADDING, 130);

  // Tiles
  for (let i = 0; i < TILES.length; i++) {
    const t = TILES[i];
    const col = i % COLS;
    const row = Math.floor(i / COLS);
    const x = PADDING + col * (TILE_W + GAP);
    const y = TITLE_H + PADDING + row * (TILE_H + GAP + LABEL_H);

    try {
      const img = await loadImage(path.resolve(t.file));
      ctx.save();
      // Rounded clip
      const r = 12;
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
      ctx.strokeStyle = "rgba(255, 255, 255, 0.06)";
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
    } catch (err) {
      // Missing image — draw placeholder
      ctx.fillStyle = "rgba(255, 255, 255, 0.04)";
      ctx.fillRect(x, y, TILE_W, TILE_H);
      ctx.fillStyle = "rgba(237, 237, 237, 0.5)";
      ctx.font = "300 14px sans-serif";
      ctx.textAlign = "center";
      ctx.fillText(t.file, x + TILE_W / 2, y + TILE_H / 2);
      ctx.textAlign = "left";
    }

    // Label
    ctx.fillStyle = "rgba(237, 237, 237, 0.85)";
    ctx.font = "300 24px sans-serif";
    ctx.textBaseline = "middle";
    ctx.fillText(t.label, x, y + TILE_H + LABEL_H / 2);

    // Subtitle (right-aligned)
    ctx.fillStyle = "rgba(237, 237, 237, 0.45)";
    ctx.font = "300 14px sans-serif";
    ctx.textAlign = "right";
    ctx.fillText(t.subtitle.toUpperCase(), x + TILE_W, y + TILE_H + LABEL_H / 2);
    ctx.textAlign = "left";
  }

  // Footer
  ctx.fillStyle = "rgba(237, 237, 237, 0.4)";
  ctx.font = "300 13px sans-serif";
  ctx.textBaseline = "bottom";
  ctx.fillText("8 renders  ·  real engine algorithm (CPU-rendered) + concept art  ·  Stage 3 of 12", PADDING, H - PADDING);

  const outPath = path.resolve("tmp/renders/contact-sheet.png");
  await fs.mkdir(path.dirname(outPath), { recursive: true });
  const buffer = canvas.toBuffer("image/png");
  await fs.writeFile(outPath, buffer);
  console.log(`[contact-sheet] wrote ${(buffer.length / 1024).toFixed(0)}KB → ${outPath}`);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});