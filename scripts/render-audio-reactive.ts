/**
 * render-audio-reactive.ts — render a section image showing audio levels +
 * the B/M/T meters with the engine peeking through.
 */

import { promises as fs } from "node:fs";
import path from "node:path";
import { createCanvas } from "canvas";

const W = 1600;
const H = 1200;

async function main() {
  const canvas = createCanvas(W, H);
  const ctx = canvas.getContext("2d");

  // Dark background
  ctx.fillStyle = "#0a0a12";
  ctx.fillRect(0, 0, W, H);

  // Subtle radial gradient
  const bg = ctx.createRadialGradient(W/2, H*0.4, 0, W/2, H*0.4, W*0.7);
  bg.addColorStop(0, "rgba(124, 58, 237, 0.15)");
  bg.addColorStop(0.4, "rgba(6, 182, 212, 0.05)");
  bg.addColorStop(1, "rgba(0,0,0,0)");
  ctx.fillStyle = bg;
  ctx.fillRect(0, 0, W, H);

  // Faux particle field — scatter of dots
  ctx.fillStyle = "rgba(124, 58, 237, 0.6)";
  for (let i = 0; i < 800; i++) {
    const x = Math.random() * W;
    const y = Math.random() * H;
    const r = 0.5 + Math.random() * 2.5;
    const alpha = 0.3 + Math.random() * 0.7;
    ctx.fillStyle = `rgba(${100 + Math.random()*60}, ${80 + Math.random()*80}, ${200 + Math.random()*55}, ${alpha})`;
    ctx.beginPath();
    ctx.arc(x, y, r, 0, Math.PI * 2);
    ctx.fill();
  }

  // Bloom halo in center
  const halo = ctx.createRadialGradient(W/2, H/2, 0, W/2, H/2, 400);
  halo.addColorStop(0, "rgba(245, 230, 200, 0.18)");
  halo.addColorStop(1, "rgba(245, 230, 200, 0)");
  ctx.fillStyle = halo;
  ctx.fillRect(0, 0, W, H);

  // Audio meters — three bars in the center
  const meterY = H - 200;
  const meterW = 80;
  const meterH = 120;
  const labels = ["BASS", "MID", "TREBLE"];
  const colors = ["rgba(124, 58, 237, 1)", "rgba(6, 182, 212, 1)", "rgba(236, 72, 153, 1)"];
  // Active levels (snapshot of music)
  const levels = [0.78, 0.55, 0.40];
  const startX = W/2 - (meterW * 3 + 40 * 2) / 2;

  for (let i = 0; i < 3; i++) {
    const x = startX + i * (meterW + 40);
    // Track
    ctx.fillStyle = "rgba(255, 255, 255, 0.08)";
    ctx.beginPath();
    ctx.roundRect(x, meterY, meterW, meterH, 6);
    ctx.fill();
    // Fill
    const fillH = meterH * levels[i];
    ctx.fillStyle = colors[i];
    ctx.beginPath();
    ctx.roundRect(x, meterY + meterH - fillH, meterW, fillH, 6);
    ctx.fill();
    // Glow at peak
    const peakGlow = ctx.createRadialGradient(
      x + meterW/2, meterY + meterH - fillH, 0,
      x + meterW/2, meterY + meterH - fillH, 30
    );
    peakGlow.addColorStop(0, colors[i].replace(", 1)", ", 0.7)"));
    peakGlow.addColorStop(1, "rgba(0,0,0,0)");
    ctx.fillStyle = peakGlow;
    ctx.fillRect(x - 20, meterY + meterH - fillH - 20, meterW + 40, 40);
    // Label
    ctx.fillStyle = "rgba(255, 255, 255, 0.7)";
    ctx.font = "300 12px sans-serif";
    ctx.textAlign = "center";
    ctx.textBaseline = "top";
    ctx.fillText(labels[i], x + meterW/2, meterY + meterH + 14);
    // Value
    ctx.fillStyle = "rgba(255, 255, 255, 0.4)";
    ctx.font = "300 10px sans-serif";
    ctx.fillText((levels[i] * 100).toFixed(0), x + meterW/2, meterY + meterH + 30);
  }

  // Title overlay
  ctx.fillStyle = "rgba(255, 255, 255, 0.9)";
  ctx.font = "300 38px sans-serif";
  ctx.textAlign = "left";
  ctx.textBaseline = "top";
  ctx.fillText("LIVE MODE", 60, 60);
  ctx.fillStyle = "rgba(255, 255, 255, 0.55)";
  ctx.font = "300 16px sans-serif";
  ctx.fillText("Web Audio · AnalyserNode · bass / mid / treble / onset", 60, 110);
  ctx.fillText("Real-time response to MP3 playback · bloom pulse on transients", 60, 132);

  // Live indicator
  ctx.fillStyle = "rgba(236, 72, 153, 1)";
  ctx.beginPath();
  ctx.arc(W - 80, 76, 6, 0, Math.PI * 2);
  ctx.fill();
  // Pulse halo
  const pulseHalo = ctx.createRadialGradient(W - 80, 76, 0, W - 80, 76, 20);
  pulseHalo.addColorStop(0, "rgba(236, 72, 153, 0.5)");
  pulseHalo.addColorStop(1, "rgba(236, 72, 153, 0)");
  ctx.fillStyle = pulseHalo;
  ctx.beginPath();
  ctx.arc(W - 80, 76, 20, 0, Math.PI * 2);
  ctx.fill();
  ctx.fillStyle = "rgba(255, 255, 255, 0.7)";
  ctx.font = "300 12px sans-serif";
  ctx.textAlign = "right";
  ctx.fillText("● LIVE", W - 100, 70);

  // Time display
  ctx.fillStyle = "rgba(255, 255, 255, 0.5)";
  ctx.font = "300 14px monospace";
  ctx.textAlign = "center";
  ctx.fillText("0:42 / 3:18", W/2, 60);

  // Scrub bar
  const scrubW = W * 0.4;
  const scrubX = (W - scrubW) / 2;
  const scrubY = 90;
  ctx.fillStyle = "rgba(255, 255, 255, 0.1)";
  ctx.fillRect(scrubX, scrubY, scrubW, 2);
  ctx.fillStyle = "rgba(255, 255, 255, 0.5)";
  ctx.fillRect(scrubX, scrubY, scrubW * 0.21, 2);

  // Camera/param overlay (bottom)
  const cy = H - 80;
  ctx.fillStyle = "rgba(255, 255, 255, 0.4)";
  ctx.font = "300 11px sans-serif";
  ctx.textAlign = "left";
  ctx.fillText("FIELD STRENGTH  1.42", 60, cy);
  ctx.fillText("DRAG  0.06", 250, cy);
  ctx.fillText("NOISE SCALE  0.62", 410, cy);
  ctx.fillText("BLOOM  0.95", 600, cy);

  ctx.textAlign = "right";
  ctx.fillText("CAMERA  MEDITATION DRIFT", W - 60, cy);

  const out = path.resolve('tmp/renders/website-audio-reactive.png');
  await fs.mkdir(path.dirname(out), { recursive: true });
  const buf = canvas.toBuffer("image/png");
  await fs.writeFile(out, buf);
  console.log(`✓ wrote ${(buf.length / 1024).toFixed(0)}KB → ${out}`);

  // Also save a smaller version for the website
  const dest = '/workspace/website/images/audio-reactive.png';
  const buf2 = canvas.toBuffer("image/png");
  await fs.writeFile(dest, buf2);
  console.log(`✓ copied to ${dest}`);
}

main().catch((e) => { console.error(e); process.exit(1); });