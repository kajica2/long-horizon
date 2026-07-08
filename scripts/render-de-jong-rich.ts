/**
 * render-de-jong-rich.ts — longer de Jong render for richer accumulation.
 */

import { promises as fs } from "node:fs";
import path from "node:path";
import { createCanvas } from "canvas";
import { createDeJongAttractorState, stepDeJongAttractor } from "../lib/engine/de-jong-attractor";

async function main() {
  const id = "dejong-bourke";
  const W = 1000, H = 1000;
  const canvas = createCanvas(W, H);
  const ctx = canvas.getContext("2d") as unknown as CanvasRenderingContext2D;
  const state = createDeJongAttractorState({ seed: id, width: W, height: H });
  console.log(`[de-jong-rich] ${id} — 600 frames @ ${W}x${H}...`);
  for (let i = 0; i < 600; i++) stepDeJongAttractor(state, ctx);
  const out = path.resolve(`tmp/renders/dejong-rich.png`);
  await fs.mkdir(path.dirname(out), { recursive: true });
  const buf = canvas.toBuffer("image/png");
  await fs.writeFile(out, buf);
  console.log(`  → ${(buf.length / 1024).toFixed(0)}KB`);
}
main().catch((e) => { console.error(e); process.exit(1); });