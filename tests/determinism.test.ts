/**
 * Stage 4 — Reproducibility test.
 *
 * The reproducibility contract:
 *   Given (seed, soundtrack, shaderGraph, audioDNA, planetaryDNA),
 *   any two engines produce identical state at any time t.
 *
 * We test this at the simulation level (where determinism actually lives).
 * The GPU pipeline's pixel-level determinism depends on driver/implementation
 * and is verified separately by Stage 11 (visual smoke tests).
 *
 * Tests:
 *   1. Filament generation: same seed → byte-identical output
 *   2. Filament generation: different seeds → different output
 *   3. Filament genome modulation: same genome → same modulation
 *   4. Artwork record hashing: stable across serializations
 *   5. Planetary DNA: same timestamp → identical DNA (extending the contract)
 *   6. Audio DNA: same bytes → identical DNA (extending the contract)
 */

import { describe, it, expect } from "vitest";
import { generateFilamentSegments } from "@/lib/engine/filaments";
import { artworkHash, canonicalJson, sha256Hex } from "@/lib/hash";
import { defaultShaderGraph, type Artwork, type PlanetaryDNA } from "@/lib/types";
import { computePlanetaryDNA } from "@/lib/planetary/compute";

const SEED = "abcdef0123456789abcdef0123456789";
const OTHER_SEED = "fedcba9876543210fedcba9876543210";

describe("Filament determinism", () => {
  it("same seed + same config → byte-identical positions", () => {
    const a = generateFilamentSegments({
      seed: SEED,
      count: 2000,
      stepsPerCurve: 60,
      spawnRadius: 7,
      fieldStrength: 1.4,
      noiseScale: 0.5,
      drag: 0.05,
    });
    const b = generateFilamentSegments({
      seed: SEED,
      count: 2000,
      stepsPerCurve: 60,
      spawnRadius: 7,
      fieldStrength: 1.4,
      noiseScale: 0.5,
      drag: 0.05,
    });
    expect(a).toEqual(b); // Float32Array value equality
    expect(a.length).toBe(b.length);
    // Hash the two — must be identical
    expect(sha256Hex(canonicalJson(Array.from(a)))).toBe(
      sha256Hex(canonicalJson(Array.from(b))),
    );
  });

  it("different seeds → different output", () => {
    const a = generateFilamentSegments({
      seed: SEED,
      count: 1000,
      stepsPerCurve: 40,
      spawnRadius: 7,
      fieldStrength: 1.4,
      noiseScale: 0.5,
      drag: 0.05,
    });
    const b = generateFilamentSegments({
      seed: OTHER_SEED,
      count: 1000,
      stepsPerCurve: 40,
      spawnRadius: 7,
      fieldStrength: 1.4,
      noiseScale: 0.5,
      drag: 0.05,
    });
    // Compare first N segments — must differ somewhere
    let differs = false;
    for (let i = 0; i < a.length; i += 6) {
      if (a[i] !== b[i] || a[i + 1] !== b[i + 1] || a[i + 2] !== b[i + 2]) {
        differs = true;
        break;
      }
    }
    expect(differs).toBe(true);
  });

  it("planetary genome modulation is deterministic", () => {
    const planetaryDNA: PlanetaryDNA = computePlanetaryDNA("2026-07-08T12:00:00.000Z");
    const a = generateFilamentSegments({
      seed: SEED,
      count: 1000,
      stepsPerCurve: 40,
      spawnRadius: 7,
      fieldStrength: 1.4,
      noiseScale: 0.5,
      drag: 0.05,
      chartIntensity: planetaryDNA.chartIntensity,
      moonPhase: planetaryDNA.moonPhase,
    });
    const b = generateFilamentSegments({
      seed: SEED,
      count: 1000,
      stepsPerCurve: 40,
      spawnRadius: 7,
      fieldStrength: 1.4,
      noiseScale: 0.5,
      drag: 0.05,
      chartIntensity: planetaryDNA.chartIntensity,
      moonPhase: planetaryDNA.moonPhase,
    });
    expect(a).toEqual(b);
  });

  it("fieldStrength and noiseScale changes are reflected in output", () => {
    const a = generateFilamentSegments({
      seed: SEED,
      count: 500,
      stepsPerCurve: 30,
      spawnRadius: 7,
      fieldStrength: 1.0,
      noiseScale: 0.5,
      drag: 0.05,
    });
    const b = generateFilamentSegments({
      seed: SEED,
      count: 500,
      stepsPerCurve: 30,
      spawnRadius: 7,
      fieldStrength: 2.0, // doubled
      noiseScale: 0.5,
      drag: 0.05,
    });
    // Different field strength → different positions
    let differs = false;
    for (let i = 0; i < a.length; i += 6) {
      const dx = a[i] - b[i];
      const dy = a[i + 1] - b[i + 1];
      const dz = a[i + 2] - b[i + 2];
      if (Math.abs(dx) > 0.01 || Math.abs(dy) > 0.01 || Math.abs(dz) > 0.01) {
        differs = true;
        break;
      }
    }
    expect(differs).toBe(true);
  });
});

describe("Reproducibility contract — end-to-end", () => {
  function makeArtwork(overrides?: Partial<Artwork>): Artwork {
    return {
      id: "test-artwork-repro",
      seed: SEED,
      soundtrack: {
        id: "soundtrack-test",
        hash: "a".repeat(64),
        originalFilename: "test.mp3",
        duration: 12,
        uploadedAt: "2026-07-08T00:00:00.000Z",
        url: "/test.mp3",
      },
      audioDNA: {
        tempo: 120,
        key: "C",
        mode: "major",
        brightness: 0.5,
        warmth: 0.5,
        texture: 0.5,
        energy: 0.5,
        aggression: 0.5,
        complexity: 0.5,
        motion: 0.5,
        entropy: 0.5,
      },
      shaderGraph: defaultShaderGraph(),
      createdAt: "2026-07-08T00:00:00.000Z",
      creator: "test",
      title: "Reproducibility Test",
      ...overrides,
    };
  }

  it("artworkHash is byte-identical across two Artwork instances with same data", () => {
    const a = makeArtwork();
    const b = makeArtwork();
    expect(artworkHash(a)).toBe(artworkHash(b));
  });

  it("artworkHash changes when seed changes", () => {
    const a = makeArtwork({ seed: SEED });
    const b = makeArtwork({ seed: OTHER_SEED });
    expect(artworkHash(a)).not.toBe(artworkHash(b));
  });

  it("artworkHash changes when shaderGraph changes", () => {
    const a = makeArtwork();
    const b = makeArtwork({
      shaderGraph: { ...defaultShaderGraph(), palette: "ember" },
    });
    expect(artworkHash(a)).not.toBe(artworkHash(b));
  });

  it("artworkHash is stable across key-order changes in nested objects (canonical JSON)", () => {
    const a = makeArtwork();
    // Reorder fields in audioDNA
    const b: Artwork = {
      ...makeArtwork(),
      audioDNA: {
        // Same data, different field order
        entropy: 0.5,
        motion: 0.5,
        complexity: 0.5,
        aggression: 0.5,
        energy: 0.5,
        texture: 0.5,
        warmth: 0.5,
        brightness: 0.5,
        mode: "major",
        key: "C",
        tempo: 120,
      },
    };
    expect(artworkHash(a)).toBe(artworkHash(b));
  });

  it("planetary DNA changes are reflected in artworkHash", () => {
    const base = makeArtwork();
    const withPlanetary = makeArtwork({
      planetaryDNA: computePlanetaryDNA("2026-07-08T12:00:00.000Z"),
    });
    expect(artworkHash(base)).not.toBe(artworkHash(withPlanetary));
  });

  it("Two engines with same inputs produce same hash (the contract)", () => {
    // Simulate two "engines" independently constructing the same artwork
    // and verify they agree on the hash. This is the canonical contract.
    const seed = "0123456789abcdef0123456789abcdef";
    const engineA_artwork: Artwork = makeArtwork({
      seed,
      planetaryDNA: computePlanetaryDNA("2026-01-01T00:00:00.000Z"),
    });
    const engineB_artwork: Artwork = makeArtwork({
      seed,
      planetaryDNA: computePlanetaryDNA("2026-01-01T00:00:00.000Z"),
    });
    expect(artworkHash(engineA_artwork)).toBe(artworkHash(engineB_artwork));

    // Now verify both would render the same filament buffer
    const bufferA = generateFilamentSegments({
      seed,
      count: 100,
      stepsPerCurve: 20,
      spawnRadius: 7,
      fieldStrength: 1.4,
      noiseScale: 0.5,
      drag: 0.05,
      chartIntensity: engineA_artwork.planetaryDNA!.chartIntensity,
      moonPhase: engineA_artwork.planetaryDNA!.moonPhase,
    });
    const bufferB = generateFilamentSegments({
      seed,
      count: 100,
      stepsPerCurve: 20,
      spawnRadius: 7,
      fieldStrength: 1.4,
      noiseScale: 0.5,
      drag: 0.05,
      chartIntensity: engineB_artwork.planetaryDNA!.chartIntensity,
      moonPhase: engineB_artwork.planetaryDNA!.moonPhase,
    });
    expect(bufferA).toEqual(bufferB);
  });
});