/**
 * render-4systems-sheet.ts — final contact sheet showing all 4 visual systems
 * the engine can produce. Two columns × 2 rows.
 */

import { promises as fs } from "node:fs";
import path from "node:path";
import { createCanvas, loadImage } from "canvas";

const TILES = [
  // Top row: audio-driven systems
  { file: "tmp/renders/demo-demo-shimmerwav.png", label: "SHIMMER", subtitle: "Audio · Flow Field Meditation · 250K particles" },
  { file: "tmp/renders/polaroid-planetary-jan2026.png", label: "JAN 15, 2026", subtitle: "Planetary · Cosmic Filaments · curl noise" },
  // Bottom row: classic generative ports
  { file: "tmp/renders/sand-tarbell-port.png", label: "SAND TRAVELER", subtitle: "Tarbell 2004 · 200 cities · sand-painter accumulation" },
  { file: "tmp/renders/dejong-rich.png", label: "DE JONG", subtitle: "Tarbell 2004 · 4K travelers · de Jong map (Bourke)" },
];

const COLS = 2;
const TILE_W = 1280;
const TILE_H = 720;
const GAP = 24;
const PADDING = 80;
const LABEL_H = 70;
const TITLE_H = 160;
const FOOTER_H = 80;

const ROWS = Math.ceil(TILES.length / COLS);
const W = PADDING * 2 + TILE_W * COLS + GAP * (COLS - 1);
const H = TITLE_H + PADDING + TILE_H * ROWS + GAP * (ROWS - 1) + LABEL_H * ROWS + FOOTER_H + PADDING;

async function main() {
  const canvas = createCanvas(W, H);
  const ctx = canvas.getContext("2d");

  ctx.fillStyle = "#050507";
  ctx.fillRect(0, 0, W, H);

  // Aurora background
  const bg = ctx.createRadialGradient(W/2, H*0.3, 0, W/2, H*0.3, W*0.6);
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
  ctx.fillText("Stages 0–4 done  ·  4 living systems  ·  10 seed artworks  ·  56 tests  ·  reproducibility locked", PADDING, 130);

  for (let i = 0; i < TILES.length; i++) {
    const t = TILES[i];
    const col = i % COLS;
    const row = Math.floor(i / COLS);
    const x = PADDING + col * (TILE_W + GAP);
    const y = TITLE_H + PADDING + row * (TILE_H + GAP + LABEL_H);

    try {
      const img = await loadImage(path.resolve(t.file));
      ctx.save();
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

      ctx.strokeStyle = "rgba(255, 255, 255, 0.06)";
      ctx.lineWidth = 1;
      ctx.stroke();
    } catch (e) {
      // missing image — draw placeholder
      ctx.fillStyle = "rgba(255, 255, 255, 0.05)";
      ctx.fillRect(x, y, TILE_W, TILE_H);
    }

    ctx.fillStyle = "rgba(237, 237, 237, 0.9)";
    ctx.font = "300 26px sans-serif";
    ctx.textBaseline = "middle";
    ctx.fillText(t.label, x, y + TILE_H + LABEL_H / 2);

    ctx.fillStyle = "rgba(237, 237, 237, 0.5)";
    ctx.font = "300 14px sans-serif";
    ctx.textAlign = "right";
    ctx.fillText(t.subtitle.toUpperCase(), x + TILE_W, y + TILE_H + LABEL_H / 2);
    ctx.textAlign = "left";
  }

  // Footer
  ctx.fillStyle = "rgba(237, 237, 237, 0.4)";
  ctx.font = "300 13px sans-serif";
  ctx.textBaseline = "bottom";
  ctx.fillText("Top row: audio & planetary genomes → particle/curve systems.   Bottom row: classic Tarbell ports (2004).", PADDING, H - PADDING);

  const outPath = path.resolve("tmp/renders/4systems-sheet.png");
  await fs.mkdir(path.dirname(outPath), { recursive: true });
  const buffer = canvas.toBuffer("image/png");
  await fs.writeFile(outPath, buffer);
  console.log(`[4systems] wrote ${(buffer.length / 1024).toFixed(0)}KB → ${outPath}`);
}

main().catch((e) => { console.error(e); process.exit(1); });