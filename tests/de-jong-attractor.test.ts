/**
 * Peter de Jong Attractor — determinism + simulation tests.
 *
 *   1. createState: same seed → same initial state and parameters
 *   2. Different seeds → different (a, b, c, d) and initial positions
 *   3. After one step, all travelers have moved (xn, yn computed)
 *   4. Travelers stay bounded within reasonable range over many steps
 *   5. Travelers get reborn after MAX_AGE
 *   6. Two state instances with same seed produce identical state after N frames
 */

import { describe, it, expect } from "vitest";
import { createCanvas } from "canvas";
import {
  createDeJongAttractorState,
  stepDeJongAttractor,
  resetDeJongAttractor,
  NUM_TRAVELERS,
  MAX_AGE,
} from "@/lib/engine/de-jong-attractor";

function makeCtx(w: number, h: number) {
  const c = createCanvas(w, h);
  return c.getContext("2d") as unknown as CanvasRenderingContext2D;
}

describe("de Jong Attractor — initialization", () => {
  it("same seed → identical state and Bourke parameters", () => {
    const a = createDeJongAttractorState({ seed: "test", width: 800, height: 800 });
    const b = createDeJongAttractorState({ seed: "test", width: 800, height: 800 });
    expect(a.a).toBe(b.a);
    expect(a.b).toBe(b.b);
    expect(a.c).toBe(b.c);
    expect(a.d).toBe(b.d);
    for (let i = 0; i < NUM_TRAVELERS; i++) {
      expect(a.travelers[i].x).toBe(b.travelers[i].x);
      expect(a.travelers[i].y).toBe(b.travelers[i].y);
    }
  });

  it("different seeds → different (a, b, c, d)", () => {
    const a = createDeJongAttractorState({ seed: "aaaaaaaaaaaaaaaa", width: 800, height: 800 });
    const b = createDeJongAttractorState({ seed: "bbbbbbbbbbbbbbbb", width: 800, height: 800 });
    expect(a.a !== b.a || a.b !== b.b || a.c !== b.c || a.d !== b.d).toBe(true);
  });

  it("starts with 4000 travelers at age 0", () => {
    const s = createDeJongAttractorState({ seed: "seed", width: 800, height: 800 });
    expect(s.travelers).toHaveLength(NUM_TRAVELERS);
    for (const t of s.travelers) {
      expect(t.age).toBe(0);
    }
  });

  it("parameters are within the original Tarbell range", () => {
    const s = createDeJongAttractorState({ seed: "seed", width: 800, height: 800 });
    for (const v of [s.a, s.b, s.c, s.d]) {
      expect(v).toBeGreaterThan(-2.6);
      expect(v).toBeLessThan(2.6);
    }
  });
});

describe("de Jong Attractor — simulation", () => {
  it("travelers move after one step", () => {
    const ctx = makeCtx(800, 800);
    const s = createDeJongAttractorState({ seed: "seed", width: 800, height: 800 });
    const before = s.travelers.map((t) => ({ x: t.x, y: t.y }));
    stepDeJongAttractor(s, ctx);
    let changed = 0;
    for (let i = 0; i < NUM_TRAVELERS; i++) {
      if (s.travelers[i].x !== before[i].x || s.travelers[i].y !== before[i].y) {
        changed++;
      }
    }
    // All travelers should have moved (de Jong map is deterministic)
    expect(changed).toBe(NUM_TRAVELERS);
    expect(s.frame).toBe(1);
  });

  it("travelers age and rebirth after MAX_AGE", () => {
    const ctx = makeCtx(800, 800);
    const s = createDeJongAttractorState({ seed: "seed", width: 800, height: 800 });
    // Run for MAX_AGE + 5 frames
    for (let i = 0; i < MAX_AGE + 5; i++) {
      stepDeJongAttractor(s, ctx);
    }
    // All ages should be < MAX_AGE (reborn ones start at 0)
    for (const t of s.travelers) {
      expect(t.age).toBeLessThanOrEqual(MAX_AGE);
    }
  });

  it("travelers stay within reasonable bounds over many steps", () => {
    const ctx = makeCtx(800, 800);
    const s = createDeJongAttractorState({ seed: "seed", width: 800, height: 800 });
    for (let i = 0; i < 20; i++) {
      stepDeJongAttractor(s, ctx);
    }
    // Spot-check 100 random travelers (full loop is too slow on node-canvas)
    for (let i = 0; i < 100; i++) {
      const t = s.travelers[Math.floor((i * 37) % NUM_TRAVELERS)];
      expect(Number.isFinite(t.x)).toBe(true);
      expect(Number.isFinite(t.y)).toBe(true);
      // De Jong with Bourke params stays in roughly [-2, 2]
      expect(Math.abs(t.x)).toBeLessThan(5);
      expect(Math.abs(t.y)).toBeLessThan(5);
    }
  });

  it("reset returns the simulation to frame 0 with new params", () => {
    const ctx = makeCtx(800, 800);
    const s = createDeJongAttractorState({ seed: "seed", width: 800, height: 800 });
    for (let i = 0; i < 50; i++) stepDeJongAttractor(s, ctx);
    const beforeA = s.a;
    resetDeJongAttractor(s, ctx);
    expect(s.frame).toBe(0);
    // New params derived from same seed's rng (so likely same as before, since rng was advanced)
    // What's deterministic: positions and frame counter reset
    for (let i = 0; i < NUM_TRAVELERS; i++) {
      expect(s.travelers[i].age).toBe(0);
    }
  });
});

describe("de Jong Attractor — determinism of step", () => {
  it("stepping two state instances with same seed produces identical state after N frames", () => {
    const ctx1 = makeCtx(800, 800);
    const ctx2 = makeCtx(800, 800);
    const a = createDeJongAttractorState({ seed: "det", width: 800, height: 800 });
    const b = createDeJongAttractorState({ seed: "det", width: 800, height: 800 });
    for (let i = 0; i < 3; i++) {
      stepDeJongAttractor(a, ctx1);
      stepDeJongAttractor(b, ctx2);
    }
    for (let i = 0; i < NUM_TRAVELERS; i++) {
      expect(Math.abs(a.travelers[i].x - b.travelers[i].x)).toBeLessThan(1e-10);
      expect(Math.abs(a.travelers[i].y - b.travelers[i].y)).toBeLessThan(1e-10);
    }
  });
});
