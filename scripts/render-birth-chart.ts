/**
 * render-birth-chart.ts — render 2D top-down previews of seeded birth charts.
 *
 * Uses node-canvas to draw the wheel as a 2D image (matching the 3D wheel
 * layout but without WebGL).
 */

import { promises as fs } from "node:fs";
import path from "node:path";
import { createCanvas } from "canvas";
import { computeBirthChart, ZODIAC_SIGNS, SIGN_ELEMENT } from "../lib/planetary/birth-chart";
import type { BirthChart, BodyKey, AspectName, ZodiacSign } from "../lib/types";

const ZODIAC_GLYPHS: Record<ZodiacSign, string> = {
  aries: "♈", taurus: "♉", gemini: "♊", cancer: "♋",
  leo: "♌", virgo: "♍", libra: "♎", scorpio: "♏",
  sagittarius: "♐", capricorn: "♑", aquarius: "♒", pisces: "♓",
};

const BODY_GLYPHS: Record<BodyKey, string> = {
  sun: "☉", moon: "☽", mercury: "☿", venus: "♀", mars: "♂",
  jupiter: "♃", saturn: "♄", uranus: "♅", neptune: "♆", pluto: "♇",
};

const ELEMENT_COLOR: Record<"fire" | "earth" | "air" | "water", string> = {
  fire: "#d97a4a",
  earth: "#a58964",
  air: "#c8b48a",
  water: "#5a6c7c",
};

const ASPECT_COLOR: Record<AspectName, string> = {
  conjunction: "#e8d9b0",
  opposition: "#d96b3a",
  trine: "#7ab87a",
  square: "#c75a5a",
  sextile: "#5a8db8",
};

const ANGLE_COLOR = "#f5e6c8";
const R_OUTER = 360;
const R_ZODIAC_INNER = 305;
const R_BODY = 270;
const R_HOUSE = 240;
const R_ASPECT = 200;

function lonToXY(lonDeg: number, radius: number, cx: number, cy: number): [number, number] {
  const lonRad = (lonDeg * Math.PI) / 180;
  const x = cx + -Math.cos(lonRad) * radius;
  const y = cy + -Math.sin(lonRad) * radius;
  return [x, y];
}

function drawChart(ctx: CanvasRenderingContext2D, chart: BirthChart, W: number, H: number) {
  const cx = W / 2, cy = H / 2;

  // Background
  ctx.fillStyle = "#0a0a0e";
  ctx.fillRect(0, 0, W, H);
  // Inner disk
  ctx.beginPath();
  ctx.arc(cx, cy, R_OUTER + 30, 0, Math.PI * 2);
  ctx.fillStyle = "rgba(255, 255, 255, 0.02)";
  ctx.fill();

  // 12 zodiac segments
  for (let i = 0; i < 12; i++) {
    const sign = ZODIAC_SIGNS[i];
    const elem = SIGN_ELEMENT[sign];
    const startAngle = i * 30;
    const endAngle = (i + 1) * 30;
    const startRad = (startAngle * Math.PI) / 180;
    const endRad = (endAngle * Math.PI) / 180;

    ctx.beginPath();
    const segments = 24;
    for (let s = 0; s <= segments; s++) {
      const t = s / segments;
      const a = startRad + (endRad - startRad) * t;
      const x = cx + -Math.cos(a) * R_OUTER;
      const y = cy + -Math.sin(a) * R_OUTER;
      if (s === 0) ctx.moveTo(x, y);
      else ctx.lineTo(x, y);
    }
    for (let s = segments; s >= 0; s--) {
      const t = s / segments;
      const a = startRad + (endRad - startRad) * t;
      const x = cx + -Math.cos(a) * R_ZODIAC_INNER;
      const y = cy + -Math.sin(a) * R_ZODIAC_INNER;
      ctx.lineTo(x, y);
    }
    ctx.closePath();
    ctx.fillStyle = ELEMENT_COLOR[elem];
    ctx.globalAlpha = 0.55;
    ctx.fill();
    ctx.globalAlpha = 1;
    ctx.strokeStyle = "rgba(255, 255, 255, 0.15)";
    ctx.lineWidth = 0.5;
    ctx.stroke();

    // Sign glyph
    const midAngle = ((startAngle + endAngle) / 2 * Math.PI) / 180;
    const midR = (R_OUTER + R_ZODIAC_INNER) / 2;
    const gx = cx + -Math.cos(midAngle) * midR;
    const gy = cy + -Math.sin(midAngle) * midR;
    ctx.fillStyle = "#f4ecd8";
    ctx.font = "300 28px sans-serif";
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    ctx.fillText(ZODIAC_GLYPHS[sign], gx, gy);
  }

  // Ring outlines
  ctx.strokeStyle = "rgba(255, 255, 255, 0.18)";
  ctx.lineWidth = 1;
  ctx.beginPath();
  ctx.arc(cx, cy, R_OUTER, 0, Math.PI * 2);
  ctx.stroke();
  ctx.beginPath();
  ctx.arc(cx, cy, R_ZODIAC_INNER, 0, Math.PI * 2);
  ctx.stroke();

  // House cusp lines
  for (let i = 0; i < 12; i++) {
    const lon = chart.houses[i];
    const isAngle = i === 0 || i === 3 || i === 6 || i === 9;
    const [x1, y1] = lonToXY(lon, R_HOUSE, cx, cy);
    const [x2, y2] = lonToXY(lon, R_OUTER + 6, cx, cy);
    ctx.strokeStyle = isAngle ? ANGLE_COLOR : "rgba(255, 255, 255, 0.35)";
    ctx.lineWidth = isAngle ? 2.2 : 0.8;
    ctx.beginPath();
    ctx.moveTo(x1, y1);
    ctx.lineTo(x2, y2);
    ctx.stroke();
  }

  // Aspect lines
  ctx.lineWidth = 0.8;
  for (const a of chart.aspects) {
    const [x1, y1] = lonToXY(chart.bodies[a.a], R_ASPECT, cx, cy);
    const [x2, y2] = lonToXY(chart.bodies[a.b], R_ASPECT, cx, cy);
    ctx.strokeStyle = ASPECT_COLOR[a.type];
    ctx.globalAlpha = Math.max(0.3, 0.85 - a.orb / 12);
    ctx.beginPath();
    ctx.moveTo(x1, y1);
    ctx.lineTo(x2, y2);
    ctx.stroke();
    ctx.globalAlpha = 1;
  }

  // Body markers
  ctx.fillStyle = "#f4ecd8";
  ctx.font = "300 22px sans-serif";
  for (const k of Object.keys(chart.bodies) as BodyKey[]) {
    const lon = chart.bodies[k];
    const [bx, by] = lonToXY(lon, R_BODY, cx, cy);
    // tick
    const [tx1, ty1] = lonToXY(lon, R_ZODIAC_INNER - 4, cx, cy);
    const [tx2, ty2] = lonToXY(lon, R_BODY + 14, cx, cy);
    ctx.strokeStyle = "rgba(255, 255, 255, 0.3)";
    ctx.lineWidth = 0.7;
    ctx.beginPath();
    ctx.moveTo(tx1, ty1);
    ctx.lineTo(tx2, ty2);
    ctx.stroke();
    // glyph
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    ctx.fillText(BODY_GLYPHS[k], bx, by);
  }

  // Angle labels
  ctx.fillStyle = ANGLE_COLOR;
  ctx.font = "500 14px sans-serif";
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  const angleLabels: Array<[string, number]> = [
    ["ASC", chart.ascendant],
    ["IC", (chart.midheaven + 180) % 360],
    ["DSC", (chart.ascendant + 180) % 360],
    ["MC", chart.midheaven],
  ];
  for (const [name, lon] of angleLabels) {
    const [ax, ay] = lonToXY(lon, R_OUTER + 18, cx, cy);
    ctx.fillText(name, ax, ay);
  }

  // Center
  ctx.fillStyle = ANGLE_COLOR;
  ctx.beginPath();
  ctx.arc(cx, cy, 4, 0, Math.PI * 2);
  ctx.fill();
}

async function main() {
  const people = [
    { name: "Johannes Kepler", file: "birth-chart-kepler.png", timestamp: "1571-05-16T14:24:00.000Z", lat: 48.75, lon: 8.87, subtitle: "Weil der Stadt, Germany  ·  16 May 1571" },
    { name: "John Cage",       file: "birth-chart-cage.png",   timestamp: "1912-09-05T11:30:00.000Z", lat: 34.05, lon: -118.25, subtitle: "Los Angeles, USA  ·  5 September 1912" },
    { name: "Jared Tarbell",   file: "birth-chart-tarbell.png",timestamp: "1974-04-12T15:00:00.000Z", lat: 35.08, lon: -106.65, subtitle: "Albuquerque, USA  ·  12 April 1974" },
  ];

  for (const p of people) {
    const chart = computeBirthChart({ timestamp: p.timestamp, latitude: p.lat, longitude: p.lon });
    const W = 900, H = 900;
    const canvas = createCanvas(W, H);
    const ctx = canvas.getContext("2d") as unknown as CanvasRenderingContext2D;
    drawChart(ctx, chart, W, H);

    // Title
    ctx.fillStyle = "rgba(255, 255, 255, 0.95)";
    ctx.font = "300 22px sans-serif";
    ctx.textAlign = "left";
    ctx.textBaseline = "top";
    ctx.fillText(p.name.toUpperCase(), 30, 30);
    ctx.fillStyle = "rgba(255, 255, 255, 0.55)";
    ctx.font = "300 13px sans-serif";
    ctx.fillText(p.subtitle, 30, 60);

    // Stats
    const stats = `${chart.aspects.length} aspects  ·  ${chart.aspectCount} major  ·  ${chart.dominantElement} dominant`;
    ctx.fillText(stats, 30, 82);

    // Asc / MC
    const asc = `${Math.floor(chart.ascendant / 30)}° ${ZODIAC_SIGNS[Math.floor(chart.ascendant / 30)]} rising  ·  MC ${Math.floor(chart.midheaven / 30)}° ${ZODIAC_SIGNS[Math.floor(chart.midheaven / 30)]}`;
    ctx.fillStyle = "rgba(245, 230, 200, 0.7)";
    ctx.fillText(asc, 30, H - 36);

    const out = path.resolve(`tmp/renders/${p.file}`);
    await fs.mkdir(path.dirname(out), { recursive: true });
    const buf = canvas.toBuffer("image/png");
    await fs.writeFile(out, buf);
    console.log(`✓ ${p.file} (${(buf.length / 1024).toFixed(0)}KB) — ${chart.aspects.length} aspects`);
  }
}

main().catch((e) => { console.error(e); process.exit(1); });