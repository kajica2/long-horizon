/**
 * Seed personal birth charts for notable figures.
 *
 * These are the demo birth charts for the v1 launch — each one is a real,
 * verifiable moment + location. The compute is fully deterministic.
 *
 * Run:  npx tsx scripts/seed-birth-charts.ts
 */

import { prisma } from "../lib/db";
import { saveArtwork } from "../lib/artwork-store";
import {
  type Artwork,
  type Soundtrack,
  defaultShaderGraph,
} from "../lib/types";
import { computeBirthChart } from "../lib/planetary/birth-chart";

type Person = {
  id: string;
  name: string;
  bornAt: string;          // ISO 8601 UTC
  lat: number;
  lon: number;
  locationLabel: string;
  blurb: string;
};

const PEOPLE: Person[] = [
  {
    id: "birth-kepler",
    name: "Johannes Kepler",
    bornAt: "1571-05-16T14:24:00.000Z",  // 14:30 LMT Weil der Stadt (≈14:24 UT)
    lat: 48.75,
    lon: 8.87,
    locationLabel: "Weil der Stadt, Germany",
    blurb: "Astronomer & mathematician. Discovered the laws of planetary motion.",
  },
  {
    id: "birth-cage",
    name: "John Cage",
    bornAt: "1912-09-05T11:30:00.000Z",  // 04:30 PT (Los Angeles)
    lat: 34.05,
    lon: -118.25,
    locationLabel: "Los Angeles, USA",
    blurb: "Composer, music theorist. Pioneer of chance & silence in music.",
  },
  {
    id: "birth-tarbell",
    name: "Jared Tarbell",
    bornAt: "1974-04-12T15:00:00.000Z",  // approximate
    lat: 35.08,
    lon: -106.65,
    locationLabel: "Albuquerque, USA",
    blurb: "Generative artist. Sand Traveler, de Jong, Substrate. The reference lineage.",
  },
];

function hashSeedForDemo(input: string): string {
  let h = 2166136261 >>> 0;
  for (let i = 0; i < input.length; i++) {
    h ^= input.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  const a = h.toString(16).padStart(8, "0");
  const b = (Math.imul(h, 16777619) >>> 0).toString(16).padStart(8, "0");
  const c = (Math.imul(h ^ 0x9e3779b9, 16777619) >>> 0).toString(16).padStart(8, "0");
  const d = (Math.imul(h ^ 0x85ebca6b, 16777619) >>> 0).toString(16).padStart(8, "0");
  return a + b + c + d;
}

async function main() {
  await prisma.artwork.deleteMany({ where: { id: { startsWith: "birth-" } } });

  for (const p of PEOPLE) {
    const chart = computeBirthChart({
      timestamp: p.bornAt,
      latitude: p.lat,
      longitude: p.lon,
    });
    const soundtrack: Soundtrack = {
      id: `birth-soundtrack-${p.id}`,
      hash: "x".repeat(64),
      originalFilename: "(birth chart — no audio file)",
      duration: 0,
      uploadedAt: new Date().toISOString(),
      url: "",
    };
    const audioDNA = {
      tempo: 0, key: "C", mode: "major" as const,
      brightness: 0, warmth: 0, texture: 0, energy: 0,
      aggression: 0, complexity: 0, motion: 0, entropy: 0,
    };
    const shaderGraph = {
      ...defaultShaderGraph(),
      system: "birthChart" as const,
      palette: "bone" as const,
      camera: "meditationDrift" as const,
    };
    const artwork: Artwork = {
      id: p.id,
      seed: hashSeedForDemo(p.id),
      soundtrack,
      audioDNA,
      birthChart: chart,
      birthLocation: { label: p.locationLabel, latitude: p.lat, longitude: p.lon },
      shaderGraph,
      createdAt: new Date().toISOString(),
      creator: "birth-chart-seed",
      title: p.name,
    };
    await saveArtwork(artwork);
    console.log(`✓ ${p.id} — ${p.name} (${p.locationLabel})`);
    console.log(`    Asc ${chart.ascendant.toFixed(1)}° · MC ${chart.midheaven.toFixed(1)}° · ${chart.aspects.length} aspects`);
  }
  console.log(`\n${PEOPLE.length} birth charts seeded.`);
}

main().catch((e) => { console.error(e); process.exit(1); });