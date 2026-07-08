/**
 * render-sand-traveler.ts — offline render of Tarbell's Sand Traveler
 * after N frames of accumulation. Saves a PNG to tmp/renders/.
 */

import { promises as fs } from "node:fs";
import path from "node:path";
import { createCanvas } from "canvas";
import {
  createSandTravelerState,
  stepSandTraveler,
} from "../lib/engine/sand-traveler";

async function main() {
  const W = 1000;
  const H = 1000;
  const canvas = createCanvas(W, H);
  const ctx = canvas.getContext("2d") as unknown as CanvasRenderingContext2D;

  const seed = "sand-traveler-tarbell-port";
  const state = createSandTravelerState({ seed, width: W, height: H });

  // Warm up — run for ~1500 frames to get a richer accumulation
  // (each frame is slow on node-canvas; ~25ms/frame = ~40s)
  const FRAMES = 1500;
  console.log(`[sand-traveler] running ${FRAMES} frames for ${seed}...`);
  for (let i = 0; i < FRAMES; i++) {
    stepSandTraveler(state, ctx);
    if (i % 200 === 0) console.log(`  frame ${i}/${FRAMES}`);
  }

  const outPath = path.resolve("tmp/renders/sand-traveler-tarbell.png");
  await fs.mkdir(path.dirname(outPath), { recursive: true });
  const buf = canvas.toBuffer("image/png");
  await fs.writeFile(outPath, buf);
  console.log(`[sand-traveler] wrote ${(buf.length / 1024).toFixed(0)}KB → ${outPath}`);
}

main().catch((e) => { console.error(e); process.exit(1); });