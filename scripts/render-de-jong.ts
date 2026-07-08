/**
 * render-de-jong.ts — render the de Jong attractor polaroids.
 */

import { promises as fs } from "node:fs";
import path from "node:path";
import { createCanvas } from "canvas";
import {
  createDeJongAttractorState,
  stepDeJongAttractor,
} from "../lib/engine/de-jong-attractor";

async function renderOne(id: string, frames: number) {
  const W = 800;
  const H = 800;
  const canvas = createCanvas(W, H);
  const ctx = canvas.getContext("2d") as unknown as CanvasRenderingContext2D;
  const state = createDeJongAttractorState({ seed: id, width: W, height: H });

  console.log(`[de-jong] ${id} — ${frames} frames...`);
  for (let i = 0; i < frames; i++) {
    stepDeJongAttractor(state, ctx);
  }
  const out = path.resolve(`tmp/renders/${id}.png`);
  await fs.mkdir(path.dirname(out), { recursive: true });
  const buf = canvas.toBuffer("image/png");
  await fs.writeFile(out, buf);
  console.log(`  → ${(buf.length / 1024).toFixed(0)}KB`);
}

async function main() {
  await renderOne("dejong-bourke", 300);
  await renderOne("dejong-ribbon", 300);
}

main().catch((e) => { console.error(e); process.exit(1); });