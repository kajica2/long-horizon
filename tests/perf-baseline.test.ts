/**
 * Perf baseline vitest test.
 *
 * Runs `scripts/perf-baseline.ts` (importing `main`) and asserts that every
 * Living System hits the configured FPS floor on headless Chromium.
 *
 * The default thresholds are deliberately low — this is SwiftShader, not a
 * real GPU. They're a *floor*: fail loud if any system slides below this on
 * the reference headless runner; raise the bar on a GPU-equipped box.
 *
 * Override thresholds via env vars:
 *   PERF_MIN_FPS               — global floor (default 5)
 *   PERF_MIN_FPS_<SYSTEM>      — per-system floor (e.g. PERF_MIN_FPS_REACTIONDIFFUSION=8)
 *
 * Skip on environments without Playwright + Chromium:
 *   PERF_SKIP=1  — skips the suite entirely (returns 1 passing "skipped" test).
 *
 * Total expected tests in this file: 1 suite + 8 system assertions + 1 config
 * probe = 10. (The shared suite-level test wraps the assertions.)
 */

import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { main, TARGETS, type Measurement } from "@/scripts/perf-baseline";

const GLOBAL_FLOOR = Number(process.env.PERF_MIN_FPS ?? 5);

function floorForSystem(system: string): number {
  const envKey = `PERF_MIN_FPS_${system.toUpperCase()}`;
  const v = Number(process.env[envKey]);
  return Number.isFinite(v) && v > 0 ? v : GLOBAL_FLOOR;
}

const SKIP = process.env.PERF_SKIP === "1";

describe.skipIf(SKIP)("perf baseline — 8 living systems", () => {
  let rows: Measurement[] = [];
  let skipReason: string | null = null;

  beforeAll(async () => {
    // Sanity probe — bail with a clear message if Playwright Chromium can't launch
    try {
      const result = await main();
      rows = result.rows;
    } catch (err) {
      skipReason =
        err instanceof Error ? err.message : "perf-baseline.main() failed";
    }
  }, 240_000); // 4 minutes for boot + 8 systems × (3s boot + 10s sample)

  afterAll(() => {
    rows = [];
  });

  it("measures all 8 living systems", () => {
    if (skipReason) {
      throw new Error(`perf-baseline skipped: ${skipReason}`);
    }
    expect(rows.length).toBe(TARGETS.length);
    expect(TARGETS.length).toBe(8);
  });

  it("reports the correct seed ids", () => {
    if (skipReason) {
      throw new Error(`perf-baseline skipped: ${skipReason}`);
    }
    const ids = rows.map((r) => r.seedId).sort();
    const expected = TARGETS.map((t) => t.seedId).sort();
    expect(ids).toEqual(expected);
  });

  it.each(
    TARGETS.map((t) => [t.system, t] as const),
  )("%s boots without fatal errors", (_name, target) => {
    if (skipReason) {
      throw new Error(`perf-baseline skipped: ${skipReason}`);
    }
    const row = rows.find((r) => r.system === target.system);
    expect(row, `row for ${target.system} not found`).toBeDefined();
    expect(row!.status, `fatal error for ${target.system}: ${row!.error ?? "?"}`).toBe("ok");
  });

  it.each(
    TARGETS.map((t) => [t.system, t] as const),
  )("%s hits the FPS floor (≥ %d fps)", (_name, target) => {
    if (skipReason) {
      throw new Error(`perf-baseline skipped: ${skipReason}`);
    }
    const row = rows.find((r) => r.system === target.system);
    expect(row, `row for ${target.system} not found`).toBeDefined();
    const floor = floorForSystem(target.system);
    expect(
      row!.fps,
      `${target.system} fps ${row!.fps.toFixed(2)} < floor ${floor} on SwiftShader`,
    ).toBeGreaterThanOrEqual(floor);
  });
});

describe("perf baseline — config", () => {
  it("exports 8 system targets", () => {
    expect(TARGETS.length).toBe(8);
    const systems = TARGETS.map((t) => t.system).sort();
    expect(systems).toEqual(
      [
        "birthChart",
        "cosmicFilaments",
        "deJongAttractor",
        "flowFieldMeditation",
        "lorenzAttractor",
        "physarum",
        "reactionDiffusion",
        "sandTraveler",
      ].sort(),
    );
  });

  it("every target has a non-empty seedId", () => {
    for (const t of TARGETS) {
      expect(t.seedId.length).toBeGreaterThan(0);
    }
  });
});
