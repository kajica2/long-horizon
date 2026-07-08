/**
 * Stage 3a acceptance test — PlanetaryDNA pipeline.
 *
 *  1. Compute for a known timestamp returns expected shape + ranges
 *  2. Same timestamp → byte-identical DNA across calls
 *  3. Different timestamps → different DNA
 *  4. Moon phase in [0, 1]; longitudes in [0, 360)
 *  5. Cache hit returns identical DNA without recomputation
 *  6. Endpoint integration: POST /api/planetary/dna
 */

import {
  afterAll,
  beforeAll,
  beforeEach,
  describe,
  expect,
  it,
} from "vitest";
import {
  getPlanetaryDNA,
  clearPlanetaryCache,
  getPlanetaryCacheSize,
} from "@/lib/planetary/cache";
import { computePlanetaryDNA } from "@/lib/planetary/compute";

const KNOWN_TIMESTAMP = "2026-07-08T12:00:00.000Z";
const OTHER_TIMESTAMP = "2025-01-15T06:00:00.000Z";

beforeAll(() => {
  clearPlanetaryCache();
});

beforeEach(() => {
  clearPlanetaryCache();
});

afterAll(() => {
  clearPlanetaryCache();
});

describe("PlanetaryDNA compute", () => {
  it("returns expected shape for a known timestamp", () => {
    const dna = computePlanetaryDNA(KNOWN_TIMESTAMP);
    expect(dna.timestamp).toBe(KNOWN_TIMESTAMP);
    // Longitudes
    expect(dna.sunLongitude).toBeGreaterThanOrEqual(0);
    expect(dna.sunLongitude).toBeLessThan(360);
    expect(dna.moonLongitude).toBeGreaterThanOrEqual(0);
    expect(dna.moonLongitude).toBeLessThan(360);
    for (const planet of ["mercury", "venus", "mars", "jupiter", "saturn", "uranus", "neptune"] as const) {
      expect(dna[`${planet}Longitude`]).toBeGreaterThanOrEqual(0);
      expect(dna[`${planet}Longitude`]).toBeLessThan(360);
    }
    // Moon phase
    expect(dna.moonPhase).toBeGreaterThanOrEqual(0);
    expect(dna.moonPhase).toBeLessThanOrEqual(1);
    expect(dna.moonPhaseAngle).toBeGreaterThanOrEqual(0);
    expect(dna.moonPhaseAngle).toBeLessThan(360);
    // Retrograde (booleans)
    for (const planet of ["mercury", "venus", "mars", "jupiter", "saturn", "uranus", "neptune"] as const) {
      expect(typeof dna[`${planet}Retrograde`]).toBe("boolean");
    }
    // Aspects
    expect(dna.aspectCount).toBeGreaterThanOrEqual(0);
    expect(dna.aspectCount).toBeLessThan(40); // upper bound: C(9,2)=36 pairs
    expect(dna.chartIntensity).toBeGreaterThanOrEqual(0);
    expect(dna.chartIntensity).toBeLessThanOrEqual(1);
    // Element
    expect(["fire", "earth", "air", "water"]).toContain(dna.dominantElement);
    for (const e of ["fire", "earth", "air", "water"] as const) {
      expect(dna.elementBalance[e]).toBeGreaterThanOrEqual(0);
      expect(dna.elementBalance[e]).toBeLessThanOrEqual(1);
    }
  });

  it("is deterministic — same timestamp → byte-identical DNA", () => {
    const a = computePlanetaryDNA(KNOWN_TIMESTAMP);
    const b = computePlanetaryDNA(KNOWN_TIMESTAMP);
    expect(a).toEqual(b);
  });

  it("different timestamps → different DNA (with very high probability)", () => {
    const a = computePlanetaryDNA(KNOWN_TIMESTAMP);
    const b = computePlanetaryDNA(OTHER_TIMESTAMP);
    // Sun longitude will definitely differ; full record should differ
    expect(a.sunLongitude).not.toBe(b.sunLongitude);
    expect(a).not.toEqual(b);
  });

  it("accepts Date object as well as ISO string", () => {
    const fromString = computePlanetaryDNA(KNOWN_TIMESTAMP);
    const fromDate = computePlanetaryDNA(new Date(KNOWN_TIMESTAMP));
    expect(fromString.timestamp).toBe(fromDate.timestamp);
    expect(fromString.sunLongitude).toBeCloseTo(fromDate.sunLongitude, 6);
  });

  it("element distribution sums to ~1", () => {
    const dna = computePlanetaryDNA(KNOWN_TIMESTAMP);
    const sum =
      dna.elementBalance.fire +
      dna.elementBalance.earth +
      dna.elementBalance.air +
      dna.elementBalance.water;
    expect(sum).toBeCloseTo(1, 6);
  });
});

describe("PlanetaryDNA cache", () => {
  it("first call is uncached, second is cached", () => {
    expect(getPlanetaryCacheSize()).toBe(0);
    const a = getPlanetaryDNA(KNOWN_TIMESTAMP);
    expect(a.cached).toBe(false);
    expect(getPlanetaryCacheSize()).toBe(1);
    const b = getPlanetaryDNA(KNOWN_TIMESTAMP);
    expect(b.cached).toBe(true);
    expect(b.dna).toEqual(a.dna);
    expect(getPlanetaryCacheSize()).toBe(1);
  });

  it("different timestamps grow the cache", () => {
    getPlanetaryDNA(KNOWN_TIMESTAMP);
    expect(getPlanetaryCacheSize()).toBe(1);
    getPlanetaryDNA(OTHER_TIMESTAMP);
    expect(getPlanetaryCacheSize()).toBe(2);
  });
});

describe("PlanetaryDNA endpoint", () => {
  it("POST without body returns DNA for now", async () => {
    const { POST } = await import("@/app/api/planetary/dna/route");
    const request = new Request("http://localhost/api/planetary/dna", {
      method: "POST",
    });
    const response = await POST(request);
    expect(response.status).toBe(200);
    const json = await response.json();
    expect(json.dna).toBeDefined();
    expect(json.dna.timestamp).toBeDefined();
    expect(json.cached).toBe(false);
  });

  it("POST with timestamp returns DNA for that moment", async () => {
    const { POST } = await import("@/app/api/planetary/dna/route");
    const request = new Request("http://localhost/api/planetary/dna", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ timestamp: KNOWN_TIMESTAMP }),
    });
    const response = await POST(request);
    expect(response.status).toBe(200);
    const json = await response.json();
    expect(json.dna.timestamp).toBe(KNOWN_TIMESTAMP);
  });

  it("second POST with same timestamp hits the cache", async () => {
    const { POST } = await import("@/app/api/planetary/dna/route");
    const body = JSON.stringify({ timestamp: "2026-08-01T00:00:00.000Z" });
    const r1 = await POST(
      new Request("http://localhost/api/planetary/dna", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body,
      }),
    );
    const r2 = await POST(
      new Request("http://localhost/api/planetary/dna", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body,
      }),
    );
    const j1 = await r1.json();
    const j2 = await r2.json();
    expect(j1.cached).toBe(false);
    expect(j2.cached).toBe(true);
    expect(j1.dna).toEqual(j2.dna);
  });
});