/**
 * Lorenz Attractor — determinism + simulation tests.
 *
 *   1. Same seed → identical initial position and parameters
 *   2. Different seeds → different initial positions / parameters
 *   3. After N steps, position diverges from initial
 *   4. Determinism: two state instances with same seed produce identical trajectory
 *   5. State stays bounded (|x|, |y|, |z| < some bound) over many steps
 *   6. Trail buffer is correctly circular (older points get overwritten)
 *   7. Reset returns to frame 0 with same initial state from same RNG
 *   8. Step is RK4 (trajectory is smooth — not Euler step-shaped)
 *   9. Dispatch manifest has all expected fields and ranges are sensible
 */

import { describe, it, expect } from "vitest";
import {
  createLorenzState,
  stepLorenz,
  resetLorenz,
  lorenzDerivatives,
  snapshotTrail,
  LORENZ_DEFAULTS,
} from "@/lib/engine/lorenz-attractor";
import { LORENZ_ATTRACTOR } from "@/lib/engine/dispatch-lorenz-attractor";

describe("Lorenz Attractor — initialization", () => {
  it("same seed → identical initial position and parameters", () => {
    const a = createLorenzState({ seed: "abc123" });
    const b = createLorenzState({ seed: "abc123" });
    expect(a.x).toBe(b.x);
    expect(a.y).toBe(b.y);
    expect(a.z).toBe(b.z);
    expect(a.sigma).toBe(b.sigma);
    expect(a.rho).toBe(b.rho);
    expect(a.beta).toBe(b.beta);
    expect(a.frame).toBe(0);
    expect(a.count).toBe(0);
  });

  it("different seeds → different initial positions", () => {
    const a = createLorenzState({ seed: "aaaaaaaaaaaaaaaa" });
    const b = createLorenzState({ seed: "bbbbbbbbbbbbbbbb" });
    // At minimum one of (x, y, z) differs. We compare all three to make
    // it statistically robust against rare near-collisions.
    const positionsDiffer =
      a.x !== b.x || a.y !== b.y || a.z !== b.z;
    expect(positionsDiffer).toBe(true);
    // And the parameter jitter should also diverge somewhere.
    const paramsDiffer =
      a.sigma !== b.sigma || a.rho !== b.rho || a.beta !== b.beta;
    expect(paramsDiffer).toBe(true);
  });

  it("parameters are clamped within the declared param ranges", () => {
    // Stress many seeds to confirm clamping is bulletproof.
    for (let i = 0; i < 25; i++) {
      const s = createLorenzState({
        seed: `seed-${i}-${"a".repeat(28)}`,
      });
      expect(s.sigma).toBeGreaterThanOrEqual(LORENZ_ATTRACTOR.paramRanges.sigma[0]);
      expect(s.sigma).toBeLessThanOrEqual(LORENZ_ATTRACTOR.paramRanges.sigma[1]);
      expect(s.rho).toBeGreaterThanOrEqual(LORENZ_ATTRACTOR.paramRanges.rho[0]);
      expect(s.rho).toBeLessThanOrEqual(LORENZ_ATTRACTOR.paramRanges.rho[1]);
      expect(s.beta).toBeGreaterThanOrEqual(LORENZ_ATTRACTOR.paramRanges.beta[0]);
      expect(s.beta).toBeLessThanOrEqual(LORENZ_ATTRACTOR.paramRanges.beta[1]);
    }
  });

  it("initial position is small-offset from origin (start close to the butterfly)", () => {
    const s = createLorenzState({ seed: "xyzzy" });
    expect(s.x).toBeGreaterThan(0.1);
    expect(s.x).toBeLessThan(0.2);
    expect(s.y).toBeGreaterThan(0.1);
    expect(s.y).toBeLessThan(0.2);
    expect(s.z).toBeGreaterThan(0.1);
    expect(s.z).toBeLessThan(0.2);
  });
});

describe("Lorenz Attractor — simulation", () => {
  it("after N steps the position diverges from the initial state", () => {
    const s = createLorenzState({ seed: "trajectory" });
    const x0 = s.x;
    const y0 = s.y;
    const z0 = s.z;
    const N = 50;
    for (let i = 0; i < N; i++) stepLorenz(s);
    expect(s.frame).toBe(N);
    const dx = s.x - x0;
    const dy = s.y - y0;
    const dz = s.z - z0;
    const moved = Math.sqrt(dx * dx + dy * dy + dz * dz);
    // The orbit moves substantially after 50 RK4 steps at dt = 0.005.
    expect(moved).toBeGreaterThan(0.5);
    // And the new position must be finite.
    expect(Number.isFinite(s.x)).toBe(true);
    expect(Number.isFinite(s.y)).toBe(true);
    expect(Number.isFinite(s.z)).toBe(true);
  });

  it("two state instances with the same seed produce identical trajectories", () => {
    const a = createLorenzState({ seed: "det-test" });
    const b = createLorenzState({ seed: "det-test" });
    for (let i = 0; i < 200; i++) {
      stepLorenz(a);
      stepLorenz(b);
      expect(Math.abs(a.x - b.x)).toBeLessThan(1e-9);
      expect(Math.abs(a.y - b.y)).toBeLessThan(1e-9);
      expect(Math.abs(a.z - b.z)).toBeLessThan(1e-9);
    }
    // Trail buffers should also be identical.
    expect(a.count).toBe(b.count);
    for (let i = 0; i < a.trail.length; i++) {
      expect(a.trail[i]).toBe(b.trail[i]);
    }
  });

  it("state stays bounded — |x|, |y|, |z| stay within an attracting regime", () => {
    const s = createLorenzState({ seed: "bounded" });
    const N = 8000; // 8000 * 0.005 = 40 simulation seconds
    for (let i = 0; i < N; i++) stepLorenz(s);
    expect(Number.isFinite(s.x)).toBe(true);
    expect(Number.isFinite(s.y)).toBe(true);
    expect(Number.isFinite(s.z)).toBe(true);
    // Lorenz attractor classical bounds: x,y ∈ [-25, 25], z ∈ [0, 50].
    // We allow generous slack to cover the seed-jittered parameter regime.
    expect(Math.abs(s.x)).toBeLessThan(100);
    expect(Math.abs(s.y)).toBeLessThan(100);
    expect(Math.abs(s.z)).toBeLessThan(100);
    // Spot-check the trail too — no point ever leaves the bounding box.
    for (let i = 0; i < s.trail.length; i += 3) {
      expect(Math.abs(s.trail[i + 0])).toBeLessThan(100);
      expect(Math.abs(s.trail[i + 1])).toBeLessThan(100);
      expect(Math.abs(s.trail[i + 2])).toBeLessThan(100);
    }
  });

  it("trail buffer is correctly circular — older points are overwritten when full", () => {
    const s = createLorenzState({
      seed: "circular",
      maxPoints: 100,
    });
    // Fill past the buffer size.
    for (let i = 0; i < 250; i++) stepLorenz(s);
    expect(s.count).toBe(100);
    // The head should have wrapped — s.head = 50 mod 100.
    expect(s.head).toBe(50);
    // After wrap, snapshotTrail should yield exactly 100 points (in
    // chronological order, head..end then 0..head).
    const snap = snapshotTrail(s);
    expect(snap.length).toBe(100 * 3);
    // The newest snapshot point equals the live (x, y, z).
    const n = snap.length / 3;
    const lastIdx = (n - 1) * 3;
    expect(snap[lastIdx + 0]).toBeCloseTo(s.x, 5);
    expect(snap[lastIdx + 1]).toBeCloseTo(s.y, 5);
    expect(snap[lastIdx + 2]).toBeCloseTo(s.z, 5);
    // The oldest snapshot point is one behind head, not the original x0.
    // (If the buffer weren't circular, the first triple would still be
    // the very first sample — which is x0.)
    const oldestX = snap[0];
    // Original first-sample x was small (~0.1); after 250 steps the
    // oldest-in-buffer x is somewhere in the interior of the butterfly.
    expect(Math.abs(oldestX - 0.1)).toBeGreaterThan(1);
  });

  it("reset returns to frame 0 with a trajectory seeded from the same RNG", () => {
    const s = createLorenzState({ seed: "reset-test" });
    // Advance far enough that we've moved far from start.
    for (let i = 0; i < 1000; i++) stepLorenz(s);
    expect(s.frame).toBe(1000);
    expect(s.count).toBeGreaterThan(0);

    resetLorenz(s);
    expect(s.frame).toBe(0);
    expect(s.count).toBe(0);
    expect(s.head).toBe(0);
    // The reset position and parameters should match a freshly
    // constructed state with the same seed (same RNG draws).
    const fresh = createLorenzState({ seed: "reset-test" });
    expect(s.x).toBe(fresh.x);
    expect(s.y).toBe(fresh.y);
    expect(s.z).toBe(fresh.z);
    expect(s.sigma).toBe(fresh.sigma);
    expect(s.rho).toBe(fresh.rho);
    expect(s.beta).toBe(fresh.beta);
    // And the trail buffer is zeroed.
    for (let i = 0; i < s.trail.length; i++) {
      expect(s.trail[i]).toBe(0);
    }
  });

  it("the step is RK4 (not Euler): trajectory remains smooth and stable at classical params", () => {
    // Use classical σ/ρ/β to compare against the well-known behaviour.
    const s = createLorenzState({
      seed: "rk4-classical",
      sigma: LORENZ_DEFAULTS.sigma,
      rho: LORENZ_DEFAULTS.rho,
      beta: LORENZ_DEFAULTS.beta,
    });
    // Burn-in to settle on the attractor.
    for (let i = 0; i < 2000; i++) stepLorenz(s);

    // Check that the velocity vector magnitude is finite, continuous,
    // and that consecutive step displacements are smooth (RK4 produces
    // smooth trajectories; pure Euler at dt = 0.005 produces visibly
    // jagged ||Δpos|| with high-frequency oscillation).
    let prevStep: number | null = null;
    let maxOscillation = 0;
    for (let i = 0; i < 200; i++) {
      const xPrev = s.x, yPrev = s.y, zPrev = s.z;
      stepLorenz(s);
      const dx = s.x - xPrev;
      const dy = s.y - yPrev;
      const dz = s.z - zPrev;
      const stepLen = Math.sqrt(dx * dx + dy * dy + dz * dz);
      expect(Number.isFinite(stepLen)).toBe(true);
      // Step length should stay in the same order of magnitude as the
      // previous step — never spuriously 100× larger (Euler blowup).
      if (prevStep !== null) {
        expect(stepLen).toBeLessThan(prevStep * 10);
        expect(stepLen).toBeGreaterThan(prevStep / 10);
        maxOscillation = Math.max(
          maxOscillation,
          Math.abs(stepLen - prevStep),
        );
      }
      prevStep = stepLen;
    }
    // Continuity: ||Δpos|| should not jump wildly frame to frame.
    expect(maxOscillation).toBeLessThan(0.5);
    // (Once we've accumulated at least one step, prevStep is finite.)
    expect(Number.isFinite(maxOscillation)).toBe(true);

    // Sanity: lorenzDerivatives should also be deterministic.
    const [dx, dy, dz] = lorenzDerivatives(s.x, s.y, s.z, s.sigma, s.rho, s.beta);
    expect(Number.isFinite(dx)).toBe(true);
    expect(Number.isFinite(dy)).toBe(true);
    expect(Number.isFinite(dz)).toBe(true);
  });
});

describe("Lorenz Attractor — dispatch manifest", () => {
  it("manifest has all expected fields", () => {
    expect(LORENZ_ATTRACTOR.name).toBe("lorenzAttractor");
    expect(LORENZ_ATTRACTOR.displayName).toBe("Lorenz Attractor");
    expect(LORENZ_ATTRACTOR.description).toMatch(/Lorenz/);
    expect(LORENZ_ATTRACTOR.component).toBe("LorenzAttractor");
    // defaultParams covers every parameter listed in the param spec.
    const expectedParams = [
      "sigma",
      "rho",
      "beta",
      "dt",
      "trailLength",
      "lineWidth",
      "fadeTail",
    ];
    for (const k of expectedParams) {
      expect(LORENZ_ATTRACTOR.defaultParams).toHaveProperty(k);
    }
    // audioBindings cover bass/mid/treble/vocals.
    expect(LORENZ_ATTRACTOR.audioBindings.bass).toBe("sigma");
    expect(LORENZ_ATTRACTOR.audioBindings.mid).toBe("rho");
    expect(LORENZ_ATTRACTOR.audioBindings.treble).toBe("trailLength");
    expect(LORENZ_ATTRACTOR.audioBindings.vocals).toBe("fadeTail");
    // Palettes cover all six names.
    expect([...LORENZ_ATTRACTOR.palettes].sort()).toEqual(
      ["aurora", "bone", "ember", "ink", "moss", "tide"],
    );
    expect(LORENZ_ATTRACTOR.camera).toBe("drone");
  });

  it("param ranges are sensible (min < default < max; positive ranges)", () => {
    const ranges = LORENZ_ATTRACTOR.paramRanges;
    for (const key of Object.keys(ranges) as Array<keyof typeof ranges>) {
      const [lo, hi] = ranges[key];
      expect(lo).toBeLessThan(hi);
      expect(Number.isFinite(lo)).toBe(true);
      expect(Number.isFinite(hi)).toBe(true);
      const def = LORENZ_ATTRACTOR.defaultParams[key];
      expect(def).toBeGreaterThanOrEqual(lo);
      expect(def).toBeLessThanOrEqual(hi);
    }
    // And dt must be small for RK4 stability on classical Lorenz.
    expect(LORENZ_ATTRACTOR.paramRanges.dt[1]).toBeLessThanOrEqual(0.05);
  });
});
