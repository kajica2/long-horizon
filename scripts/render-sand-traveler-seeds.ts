/**
 * render-sand-traveler-seeds.ts — render both seeded sand traveler artworks
 * for the website contact sheet.
 */

import { promises as fs } from "node:fs";
import path from "node:path";
import { createCanvas } from "canvas";
import { createSandTravelerState, stepSandTraveler } from "../lib/engine/sand-traveler";
import { hashSeed } from "../lib/seed";

async function renderOne(id: string, frames: number) {
  const W = 1000;
  const H = 1000;
  const canvas = createCanvas(W, H);
  const ctx = canvas.getContext("2d") as unknown as CanvasRenderingContext2D;
  const state = createSandTravelerState({ seed: id, width: W, height: H });

  console.log(`[sand-traveler] ${id} — ${frames} frames...`);
  for (let i = 0; i < frames; i++) {
    stepSandTraveler(state, ctx);
  }
  const out = path.resolve(`tmp/renders/sand-${id}.png`);
  await fs.mkdir(path.dirname(out), { recursive: true });
  const buf = canvas.toBuffer("image/png");
  await fs.writeFile(out, buf);
  console.log(`  → ${(buf.length / 1024).toFixed(0)}KB`);
}

async function main() {
  await renderOne("sand-tarbell-port", 1200);
  await renderOne("sand-bone-reliquary", 1200);
}

main().catch((e) => { console.error(e); process.exit(1); });