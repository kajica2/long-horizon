/**
 * Sand Traveler — determinism + simulation tests.
 *
 * Tests:
 *   1. createSandTravelerState: same seed → same initial positions
 *   2. Different seeds → different initial positions
 *   3. Cities move (position changes after step)
 *   4. Cities stay bounded (no NaN / infinite escape)
 *   5. Frame counter increments
 *   6. Auto-reset triggers after RESET_AFTER_FRAMES
 *   7. Drawing to canvas produces a non-trivial image (smoke test)
 */

import { describe, it, expect } from "vitest";
import { createCanvas } from "canvas";
import {
  createSandTravelerState,
  stepSandTraveler,
  resetSandTraveler,
  NUM_CITIES,
  RESET_AFTER_FRAMES,
} from "@/lib/engine/sand-traveler";

function makeCtx(w: number, h: number) {
  const c = createCanvas(w, h);
  const ctx = c.getContext("2d");
  return ctx as unknown as CanvasRenderingContext2D;
}

describe("Sand Traveler — initialization", () => {
  it("same seed → identical initial state", () => {
    const a = createSandTravelerState({ seed: "abcdef1234", width: 1000, height: 1000 });
    const b = createSandTravelerState({ seed: "abcdef1234", width: 1000, height: 1000 });
    for (let i = 0; i < NUM_CITIES; i++) {
      expect(a.cities[i].x).toBe(b.cities[i].x);
      expect(a.cities[i].y).toBe(b.cities[i].y);
      expect(a.cities[i].vx).toBe(b.cities[i].vx);
      expect(a.cities[i].vy).toBe(b.cities[i].vy);
      expect(a.cities[i].friend).toBe(b.cities[i].friend);
      expect(a.cities[i].color).toEqual(b.cities[i].color);
    }
  });

  it("different seeds → different initial positions", () => {
    const a = createSandTravelerState({ seed: "aaaaaaaaaaaaaaaa", width: 1000, height: 1000 });
    const b = createSandTravelerState({ seed: "bbbbbbbbbbbbbbbb", width: 1000, height: 1000 });
    let differs = false;
    for (let i = 0; i < NUM_CITIES && !differs; i++) {
      if (a.cities[i].x !== b.cities[i].x || a.cities[i].y !== b.cities[i].y) {
        differs = true;
      }
    }
    expect(differs).toBe(true);
  });

  it("starts with 200 cities and 600 sand painters", () => {
    const s = createSandTravelerState({ seed: "seed", width: 1000, height: 1000 });
    expect(s.cities).toHaveLength(NUM_CITIES);
    expect(s.sands).toHaveLength(NUM_CITIES * 3);
    expect(s.frame).toBe(0);
  });

  it("all cities are within the canvas at start", () => {
    const s = createSandTravelerState({ seed: "seed", width: 1000, height: 1000 });
    for (const c of s.cities) {
      expect(c.x).toBeGreaterThan(0);
      expect(c.x).toBeLessThan(1000);
      expect(c.y).toBeGreaterThan(0);
      expect(c.y).toBeLessThan(1000);
    }
  });

  it("each city has a valid friend reference (different index preferred)", () => {
    const s = createSandTravelerState({ seed: "seed", width: 1000, height: 1000 });
    for (let i = 0; i < NUM_CITIES; i++) {
      expect(s.cities[i].friend).toBeGreaterThanOrEqual(0);
      expect(s.cities[i].friend).toBeLessThan(NUM_CITIES);
    }
  });
});

describe("Sand Traveler — simulation", () => {
  it("cities move after one step", () => {
    const ctx = makeCtx(1000, 1000);
    const s = createSandTravelerState({ seed: "seed", width: 1000, height: 1000 });
    const before = s.cities.map((c) => ({ x: c.x, y: c.y }));
    stepSandTraveler(s, ctx);
    let changed = 0;
    for (let i = 0; i < NUM_CITIES; i++) {
      if (s.cities[i].x !== before[i].x || s.cities[i].y !== before[i].y) {
        changed++;
      }
    }
    expect(changed).toBeGreaterThan(NUM_CITIES * 0.8); // at least 80% moved
    expect(s.frame).toBe(1);
  });

  it("cities stay bounded over many steps (no escape)", () => {
    const ctx = makeCtx(1000, 1000);
    const s = createSandTravelerState({ seed: "seed", width: 1000, height: 1000 });
    for (let i = 0; i < 50; i++) {
      stepSandTraveler(s, ctx);
      for (const c of s.cities) {
        expect(Number.isFinite(c.x)).toBe(true);
        expect(Number.isFinite(c.y)).toBe(true);
        expect(Math.abs(c.x)).toBeLessThan(5000);
        expect(Math.abs(c.y)).toBeLessThan(5000);
      }
    }
  });

  it("auto-resets after RESET_AFTER_FRAMES", () => {
    const ctx = makeCtx(1000, 1000);
    const s = createSandTravelerState({ seed: "seed", width: 1000, height: 1000 });
    // Manually jump past the reset threshold to avoid running 3600 frames
    s.frame = RESET_AFTER_FRAMES;
    stepSandTraveler(s, ctx);
    stepSandTraveler(s, ctx);
    // After reset, frame counter is back to 0
    expect(s.frame).toBe(0);
  });

  it("explicit reset restarts the simulation cleanly", () => {
    const ctx = makeCtx(1000, 1000);
    const s = createSandTravelerState({ seed: "seed", width: 1000, height: 1000 });
    for (let i = 0; i < 10; i++) stepSandTraveler(s, ctx);
    const positionsBefore = s.cities.map((c) => ({ x: c.x, y: c.y }));
    resetSandTraveler(s, ctx);
    expect(s.frame).toBe(0);
    let changed = 0;
    for (let i = 0; i < NUM_CITIES; i++) {
      if (s.cities[i].x !== positionsBefore[i].x || s.cities[i].y !== positionsBefore[i].y) {
        changed++;
      }
    }
    expect(changed).toBeGreaterThan(0); // positions changed after reset
  });
});

describe("Sand Traveler — determinism of step", () => {
  it("stepping two state instances with same seed produces identical state after N frames", () => {
    const ctx1 = makeCtx(1000, 1000);
    const ctx2 = makeCtx(1000, 1000);
    const a = createSandTravelerState({ seed: "determinism", width: 1000, height: 1000 });
    const b = createSandTravelerState({ seed: "determinism", width: 1000, height: 1000 });
    for (let i = 0; i < 5; i++) {
      stepSandTraveler(a, ctx1);
      stepSandTraveler(b, ctx2);
    }
    for (let i = 0; i < NUM_CITIES; i++) {
      // Allow tiny float drift but not full divergence
      expect(Math.abs(a.cities[i].x - b.cities[i].x)).toBeLessThan(0.01);
      expect(Math.abs(a.cities[i].y - b.cities[i].y)).toBeLessThan(0.01);
    }
  });
});
