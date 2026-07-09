/**
 * Reaction-Diffusion — determinism + simulation tests.
 *
 * Covers the engine's reproducibility contract:
 *   1. Same seed → identical initial u/v state and frame counter
 *   2. Different seeds → different initial u/v state
 *   3. After N steps, state diverges from the initial state
 *   4. Two state instances with the same seed produce identical state
 *      after the same number of steps
 *   5. Reset returns the simulation to frame 0 with re-derived state
 *   6. u/v values stay bounded across many steps (no NaN, no Inf)
 *   7. The dispatch manifest declares the expected fields and ranges
 *   8. Defaults sit within the published param ranges
 *   9. Distinct (F, k) presets produce measurably different fields
 *
 * Uses the same `node-canvas` pattern as de-jong-attractor.test.ts.
 */

import { describe, it, expect } from "vitest";
import { createCanvas } from "canvas";
import {
  createReactionDiffusionState,
  stepReactionDiffusion,
  resetReactionDiffusion,
  renderReactionDiffusion,
  REACTION_DIFFUSION_PRESETS,
} from "@/lib/engine/reaction-diffusion";
import { REACTION_DIFFUSION } from "@/lib/engine/dispatch-reaction-diffusion";

function makeCtx(w: number, h: number): CanvasRenderingContext2D {
  const c = createCanvas(w, h);
  return c.getContext("2d") as unknown as CanvasRenderingContext2D;
}

// ============================================================
// Determinism / Initialization
// ============================================================

describe("Reaction-Diffusion — initialization", () => {
  it("same seed → identical u/v state and frame counter", () => {
    const a = createReactionDiffusionState({ seed: "reactive-seed", width: 64, height: 64 });
    const b = createReactionDiffusionState({ seed: "reactive-seed", width: 64, height: 64 });
    expect(a.frame).toBe(b.frame);
    expect(a.u.length).toBe(b.u.length);
    expect(a.v.length).toBe(b.v.length);
    // Every cell must agree exactly — same seed → identical Float32 contents.
    for (let i = 0; i < a.u.length; i++) {
      expect(a.u[i]).toBe(b.u[i]);
      expect(a.v[i]).toBe(b.v[i]);
    }
  });

  it("different seeds → different initial u/v state", () => {
    const a = createReactionDiffusionState({ seed: "seed-alpha", width: 64, height: 64 });
    const b = createReactionDiffusionState({ seed: "seed-beta",  width: 64, height: 64 });
    let diffCount = 0;
    for (let i = 0; i < a.v.length; i++) {
      if (a.v[i] !== b.v[i]) diffCount++;
    }
    // At least some cells must be perturbed differently.
    expect(diffCount).toBeGreaterThan(0);
  });

  it("starts at frame 0 with sane default parameters", () => {
    const s = createReactionDiffusionState({ seed: "x", width: 32, height: 32 });
    expect(s.frame).toBe(0);
    expect(s.params.F).toBeGreaterThan(0);
    expect(s.params.k).toBeGreaterThan(0);
    expect(s.params.du).toBeGreaterThan(s.params.dv); // du > dv is required for Turing instability
  });

  it("u is initialized to ~1 (steady state) and v near 0 outside perturbation", () => {
    const s = createReactionDiffusionState({ seed: "init", width: 64, height: 64 });
    // Top-left corner should be untouched by either perturbation
    let cornerU = 0;
    let cornerV = 0;
    for (let i = 0; i < 16; i++) {
      cornerU += s.u[i];
      cornerV += s.v[i];
    }
    expect(cornerU).toBeGreaterThan(8); // ~16 * 1.0
    expect(cornerV).toBeLessThan(1.0);  // untouched corner has v near 0
  });
});

// ============================================================
// Simulation step
// ============================================================

describe("Reaction-Diffusion — simulation step", () => {
  it("after N steps, state diverges from the initial state", () => {
    const s = createReactionDiffusionState({ seed: "evolve", width: 64, height: 64 });
    // Snapshot initial v
    const v0 = new Float32Array(s.v);
    for (let i = 0; i < 50; i++) stepReactionDiffusion(s);
    expect(s.frame).toBe(50);
    let diff = 0;
    for (let i = 0; i < v0.length; i++) {
      if (Math.abs(s.v[i] - v0[i]) > 1e-4) diff++;
    }
    // Many cells should have diverged from initial state
    expect(diff).toBeGreaterThan(0);
  });

  it("two same-seed instances produce identical state after N steps", () => {
    const a = createReactionDiffusionState({ seed: "det", width: 64, height: 64 });
    const b = createReactionDiffusionState({ seed: "det", width: 64, height: 64 });
    for (let i = 0; i < 30; i++) {
      stepReactionDiffusion(a);
      stepReactionDiffusion(b);
    }
    expect(a.frame).toBe(b.frame);
    for (let i = 0; i < a.u.length; i++) {
      expect(Math.abs(a.u[i] - b.u[i])).toBeLessThan(1e-5);
      expect(Math.abs(a.v[i] - b.v[i])).toBeLessThan(1e-5);
    }
  });

  it("u/v arrays stay bounded after many steps (no NaN, no Inf)", () => {
    const s = createReactionDiffusionState({ seed: "stable", width: 64, height: 64 });
    for (let i = 0; i < 200; i++) stepReactionDiffusion(s);
    let badU = 0;
    let badV = 0;
    for (let i = 0; i < s.u.length; i++) {
      if (!Number.isFinite(s.u[i])) badU++;
      if (!Number.isFinite(s.v[i])) badV++;
    }
    expect(badU).toBe(0);
    expect(badV).toBe(0);
    // clampFinite holds values in [-1, 2]. After PDE evolution they
    // typically sit in [0, 1] but a generous bound is fine.
    for (let i = 0; i < s.u.length; i++) {
      expect(s.u[i]).toBeGreaterThanOrEqual(-1);
      expect(s.u[i]).toBeLessThanOrEqual(2);
      expect(s.v[i]).toBeGreaterThanOrEqual(-1);
      expect(s.v[i]).toBeLessThanOrEqual(2);
    }
  });

  it("reset returns to frame 0 with re-derived initial state", () => {
    const s = createReactionDiffusionState({ seed: "reset-test", width: 64, height: 64 });
    for (let i = 0; i < 40; i++) stepReactionDiffusion(s);
    const v0 = new Float32Array(s.v);
    resetReactionDiffusion(s);
    expect(s.frame).toBe(0);
    // After reset, v should match a fresh same-seed creation.
    const fresh = createReactionDiffusionState({ seed: "reset-test", width: 64, height: 64 });
    let match = 0;
    for (let i = 0; i < s.v.length; i++) {
      if (s.v[i] === fresh.v[i]) match++;
    }
    expect(match).toBe(s.v.length);
    // And should differ from pre-reset state.
    expect(s.v).not.toEqual(v0);
  });

  it("render to a 2D canvas produces a non-empty image", () => {
    // Sanity check that the rendering pipeline can be exercised in node-canvas.
    const s = createReactionDiffusionState({ seed: "paint", width: 32, height: 32 });
    for (let i = 0; i < 10; i++) stepReactionDiffusion(s);
    const ctx = makeCtx(32, 32);
    renderReactionDiffusion(s, ctx, "aurora");
    const data = ctx.getImageData(0, 0, 32, 32).data;
    // At least one pixel must be non-zero.
    let any = false;
    for (let i = 0; i < data.length; i += 4) {
      if (data[i] !== 0 || data[i + 1] !== 0 || data[i + 2] !== 0) {
        any = true;
        break;
      }
    }
    expect(any).toBe(true);
  });
});

// ============================================================
// Dispatch manifest
// ============================================================

describe("Reaction-Diffusion — dispatch manifest", () => {
  it("declares all expected fields", () => {
    expect(REACTION_DIFFUSION.name).toBe("reactionDiffusion");
    expect(REACTION_DIFFUSION.displayName).toBeTruthy();
    expect(REACTION_DIFFUSION.description).toBeTruthy();
    expect(REACTION_DIFFUSION.component).toBe("ReactionDiffusion");
    expect(REACTION_DIFFUSION.defaultParams).toBeTypeOf("object");
    expect(REACTION_DIFFUSION.audioBindings).toBeTypeOf("object");
    expect(Array.isArray(REACTION_DIFFUSION.palettes)).toBe(true);
    expect(REACTION_DIFFUSION.paramRanges).toBeTypeOf("object");
  });

  it("defaultParams are within declared paramRanges", () => {
    for (const [k, def] of Object.entries(REACTION_DIFFUSION.defaultParams)) {
      const range = REACTION_DIFFUSION.paramRanges[k as keyof typeof REACTION_DIFFUSION.paramRanges];
      expect(range, `missing range for ${k}`).toBeDefined();
      expect(def, `${k} default`).toBeGreaterThanOrEqual(range[0]);
      expect(def, `${k} default`).toBeLessThanOrEqual(range[1]);
    }
  });

  it("audioBindings cover all four bands and reference valid param keys", () => {
    expect(REACTION_DIFFUSION.audioBindings.bass).toBeTruthy();
    expect(REACTION_DIFFUSION.audioBindings.mid).toBeTruthy();
    expect(REACTION_DIFFUSION.audioBindings.treble).toBeTruthy();
    expect(REACTION_DIFFUSION.audioBindings.vocals).toBeTruthy();
    const paramKeys = new Set(Object.keys(REACTION_DIFFUSION.defaultParams));
    for (const [band, key] of Object.entries(REACTION_DIFFUSION.audioBindings)) {
      expect(paramKeys.has(key), `audio binding ${band} → ${key} must be a defaultParam key`).toBe(true);
    }
  });

  it("palettes are a subset of the engine PaletteName union (only known names)", () => {
    const KNOWN = new Set(["aurora", "ember", "tide", "ink", "bone", "moss"]);
    for (const p of REACTION_DIFFUSION.palettes) {
      expect(KNOWN.has(p), `unknown palette ${p}`).toBe(true);
    }
  });
});

// ============================================================
// Pattern presets — distinct (F, k) regimes diverge over time
// ============================================================

describe("Reaction-Diffusion — presets produce distinct regimes", () => {
  it("spots vs stripes vs maze presets produce distinct v statistics", () => {
    // Run each preset for a fixed number of steps from identical init;
    // the resulting v distributions should differ measurably.
    const presetList = [
      REACTION_DIFFUSION_PRESETS.spots,
      REACTION_DIFFUSION_PRESETS.stripes,
      REACTION_DIFFUSION_PRESETS.maze,
    ];
    const summaries: { mean: number; max: number; nonzero: number }[] = [];
    for (const p of presetList) {
      const s = createReactionDiffusionState({
        seed: "preset",
        width: 96,
        height: 96,
        F: p.F,
        k: p.k,
      });
      for (let i = 0; i < 400; i++) stepReactionDiffusion(s);
      let sum = 0;
      let maxV = 0;
      let nonzero = 0;
      for (let i = 0; i < s.v.length; i++) {
        sum += s.v[i];
        if (s.v[i] > maxV) maxV = s.v[i];
        if (s.v[i] > 0.05) nonzero++;
      }
      summaries.push({
        mean: sum / s.v.length,
        max: maxV,
        nonzero,
      });
    }
    // At least two of the three summaries must differ — Gray-Scott is
    // famously sensitive to (F, k) so regimes are visually obvious.
    const a = summaries[0];
    const b = summaries[1];
    const c = summaries[2];
    const differ = (x: typeof a, y: typeof b) =>
      Math.abs(x.mean - y.mean) > 1e-3 ||
      Math.abs(x.nonzero - y.nonzero) > 100;
    expect(differ(a, b) || differ(a, c) || differ(b, c)).toBe(true);
  });

  it("well-known (F, k) regime pairs differ from the default mitosis", () => {
    const defaultS = createReactionDiffusionState({
      seed: "x", width: 96, height: 96,
    });
    const stripesS = createReactionDiffusionState({
      seed: "x", width: 96, height: 96,
      F: REACTION_DIFFUSION_PRESETS.stripes.F,
      k: REACTION_DIFFUSION_PRESETS.stripes.k,
    });
    for (let i = 0; i < 300; i++) {
      stepReactionDiffusion(defaultS);
      stepReactionDiffusion(stripesS);
    }
    let diff = 0;
    for (let i = 0; i < defaultS.v.length; i++) {
      if (Math.abs(defaultS.v[i] - stripesS.v[i]) > 1e-3) diff++;
    }
    expect(diff).toBeGreaterThan(0);
  });
});
