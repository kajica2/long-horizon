/**
 * Audio bindings — pure resolver + hook integration tests.
 *
 * Coverage:
 *   1. Hook returns the right shape (param map)
 *   2. When audioBass changes, the bound param updates (with smoothing)
 *   3. For Lorenz: sigma/rho modulation is clamped so the attractor stays bounded
 *   4. For Physarum: decay modulation stays in [0, 1]
 *   5. When audioBindings change (panel re-bind), the hook respects the new bindings
 *   6. When the system changes (different configs), the hook re-resolves
 *   7. Pure helpers: smoothToward, resolveAudioModulatedParam clamp behaviour
 *
 * All tests use the pure `computeModulatedParamsPure` helper exported
 * from `use-audio-bindings.ts`. The hook itself is a thin React glue
 * that reads the store and manages a ref; the per-frame logic lives in
 * the pure helper and that's what we're verifying.
 */

import { describe, it, expect } from "vitest";
import {
  computeModulatedParamsPure,
  resolveAudioModulatedParam,
  smoothToward,
  type AudioBindingConfig,
} from "@/lib/engine/use-audio-bindings";
import { REACTION_DIFFUSION } from "@/lib/engine/dispatch-reaction-diffusion";
import { LORENZ_ATTRACTOR } from "@/lib/engine/dispatch-lorenz-attractor";
import { PHYSARUM } from "@/lib/engine/dispatch-physarum";

// ============================================================
// Per-system config maps — mirror what the components supply.
// ============================================================

const RD_CONFIGS: Record<string, AudioBindingConfig> = {
  feedRate: {
    min: REACTION_DIFFUSION.paramRanges.feedRate[0],
    max: REACTION_DIFFUSION.paramRanges.feedRate[1],
    modulationStrength: 0.02,
    baseline: REACTION_DIFFUSION.defaultParams.feedRate,
  },
  killRate: {
    min: REACTION_DIFFUSION.paramRanges.killRate[0],
    max: REACTION_DIFFUSION.paramRanges.killRate[1],
    modulationStrength: 0.015,
    baseline: REACTION_DIFFUSION.defaultParams.killRate,
  },
  stepsPerFrame: {
    min: REACTION_DIFFUSION.paramRanges.stepsPerFrame[0],
    max: REACTION_DIFFUSION.paramRanges.stepsPerFrame[1],
    modulationStrength: 8,
    baseline: 5,
  },
  dt: {
    min: REACTION_DIFFUSION.paramRanges.dt[0],
    max: REACTION_DIFFUSION.paramRanges.dt[1],
    modulationStrength: 0.4,
    baseline: REACTION_DIFFUSION.defaultParams.dt,
  },
};

const LZ_CONFIGS: Record<string, AudioBindingConfig> = {
  sigma: {
    min: LORENZ_ATTRACTOR.paramRanges.sigma[0],
    max: LORENZ_ATTRACTOR.paramRanges.sigma[1],
    modulationStrength: 3.0,
    baseline: LORENZ_ATTRACTOR.defaultParams.sigma,
  },
  rho: {
    min: LORENZ_ATTRACTOR.paramRanges.rho[0],
    max: LORENZ_ATTRACTOR.paramRanges.rho[1],
    modulationStrength: 5.0,
    baseline: LORENZ_ATTRACTOR.defaultParams.rho,
  },
  trailLength: {
    min: LORENZ_ATTRACTOR.paramRanges.trailLength[0],
    max: LORENZ_ATTRACTOR.paramRanges.trailLength[1],
    modulationStrength: 4000,
    baseline: LORENZ_ATTRACTOR.defaultParams.trailLength,
  },
  fadeTail: {
    min: LORENZ_ATTRACTOR.paramRanges.fadeTail[0],
    max: LORENZ_ATTRACTOR.paramRanges.fadeTail[1],
    modulationStrength: 0.1,
    baseline: LORENZ_ATTRACTOR.defaultParams.fadeTail,
  },
};

const PM_CONFIGS: Record<string, AudioBindingConfig> = {
  decay: {
    min: PHYSARUM.paramRanges.decay[0],
    max: PHYSARUM.paramRanges.decay[1],
    modulationStrength: 0.05,
    baseline: PHYSARUM.defaultParams.decay,
  },
  sensorDistance: {
    min: PHYSARUM.paramRanges.sensorDistance[0],
    max: PHYSARUM.paramRanges.sensorDistance[1],
    modulationStrength: 6.0,
    baseline: PHYSARUM.defaultParams.sensorDistance,
  },
  stepSize: {
    min: PHYSARUM.paramRanges.stepSize[0],
    max: PHYSARUM.paramRanges.stepSize[1],
    modulationStrength: 0.8,
    baseline: PHYSARUM.defaultParams.stepSize,
  },
  diffuse: {
    min: PHYSARUM.paramRanges.diffuse[0],
    max: PHYSARUM.paramRanges.diffuse[1],
    modulationStrength: 0.3,
    baseline: PHYSARUM.defaultParams.diffuse,
  },
};

const SILENCE = { bass: 0, mid: 0, treble: 0 } as const;

// ============================================================
// Pure helper tests
// ============================================================

describe("smoothToward (pure)", () => {
  it("returns the target when coefficient is 1", () => {
    expect(smoothToward(0.5, 0.9, 1)).toBeCloseTo(0.9, 10);
  });

  it("returns the current when coefficient is 0", () => {
    expect(smoothToward(0.5, 0.9, 0)).toBe(0.5);
  });

  it("moves 10% of the way when coefficient is 0.1", () => {
    // (0.5 + (0.9 - 0.5) * 0.1) = 0.54
    expect(smoothToward(0.5, 0.9, 0.1)).toBeCloseTo(0.54, 10);
  });

  it("is order-dependent (release vs attack reach same target eventually)", () => {
    // Attacking toward a target — climbs monotonically
    let v = 0;
    for (let i = 0; i < 10; i++) v = smoothToward(v, 1, 0.3);
    expect(v).toBeGreaterThan(0.95);
    // Release back down — climbs back monotonically
    v = smoothToward(v, 0, 0.3);
    expect(v).toBeLessThan(0.95);
  });
});

describe("resolveAudioModulatedParam (pure)", () => {
  const cfg: AudioBindingConfig = {
    min: 0,
    max: 1,
    modulationStrength: 0.5,
    baseline: 0.5,
  };

  it("returns baseline when band is 0", () => {
    expect(resolveAudioModulatedParam(0, cfg)).toBe(0.5);
  });

  it("returns baseline + strength when band is 1 (within range)", () => {
    expect(resolveAudioModulatedParam(1, cfg)).toBe(1.0);
  });

  it("clamps to max when strength would push above max", () => {
    // strength = 0.5, baseline 0.5 → raw = 1.0 → at max
    const tight: AudioBindingConfig = { min: 0, max: 0.6, modulationStrength: 0.5, baseline: 0.5 };
    expect(resolveAudioModulatedParam(1, tight)).toBe(0.6);
  });

  it("clamps to min when strength would push below min", () => {
    // Negative band input should not underflow the param.
    expect(resolveAudioModulatedParam(-1, cfg)).toBe(0);
  });

  it("returns clamped baseline for non-finite band input (NaN/Inf guard)", () => {
    expect(Number.isFinite(resolveAudioModulatedParam(NaN, cfg))).toBe(true);
    expect(Number.isFinite(resolveAudioModulatedParam(Infinity, cfg))).toBe(true);
    // Clamped to the baseline range
    expect(resolveAudioModulatedParam(NaN, cfg)).toBe(0.5);
  });
});

// ============================================================
// Hook contract tests
// ============================================================

describe("computeModulatedParamsPure — shape & basic behaviour", () => {
  it("returns the right shape: { params, bands, nextSmoothed }", () => {
    const result = computeModulatedParamsPure({
      bindings: REACTION_DIFFUSION.audioBindings,
      configs: RD_CONFIGS,
      bands: SILENCE,
      smoothing: 0.1,
      prevSmoothed: {},
    });
    expect(result).toHaveProperty("params");
    expect(result).toHaveProperty("bands");
    expect(result).toHaveProperty("nextSmoothed");
    // RD bindings: bass→feedRate, mid→killRate, treble→stepsPerFrame, vocals→dt
    expect(result.params).toHaveProperty("feedRate");
    expect(result.params).toHaveProperty("killRate");
    expect(result.params).toHaveProperty("stepsPerFrame");
    expect(result.params).toHaveProperty("dt");
    // Bands shape includes vocals (approximated from treble)
    expect(result.bands).toHaveProperty("bass");
    expect(result.bands).toHaveProperty("mid");
    expect(result.bands).toHaveProperty("treble");
    expect(result.bands).toHaveProperty("vocals");
  });

  it("silence → all params at baseline", () => {
    const result = computeModulatedParamsPure({
      bindings: REACTION_DIFFUSION.audioBindings,
      configs: RD_CONFIGS,
      bands: SILENCE,
      smoothing: 0.1,
      prevSmoothed: {},
    });
    // First-frame snap: all values at their baseline (band=0 → baseline).
    expect(result.params.feedRate).toBeCloseTo(REACTION_DIFFUSION.defaultParams.feedRate, 10);
    expect(result.params.killRate).toBeCloseTo(REACTION_DIFFUSION.defaultParams.killRate, 10);
    expect(result.params.stepsPerFrame).toBeCloseTo(5, 10);
    expect(result.params.dt).toBeCloseTo(REACTION_DIFFUSION.defaultParams.dt, 10);
  });

  it("vocals is approximated from treble (capped at 1.0)", () => {
    const result = computeModulatedParamsPure({
      bindings: REACTION_DIFFUSION.audioBindings,
      configs: RD_CONFIGS,
      bands: { bass: 0, mid: 0, treble: 1 },
      smoothing: 0.1,
      prevSmoothed: {},
    });
    // vocals = min(1, treble * 1.2) = 1.0
    expect(result.bands.vocals).toBe(1.0);
  });
});

describe("computeModulatedParamsPure — smoothing", () => {
  it("when audioBass jumps, the bound param moves smoothly toward target (not instant)", () => {
    // First frame: silence → starts at baseline (snap).
    const first = computeModulatedParamsPure({
      bindings: REACTION_DIFFUSION.audioBindings,
      configs: RD_CONFIGS,
      bands: SILENCE,
      smoothing: 0.1,
      prevSmoothed: {},
    });
    expect(first.params.feedRate).toBeCloseTo(
      REACTION_DIFFUSION.defaultParams.feedRate,
      10,
    );

    // Second frame: bass jumps to 1.0 → target = baseline + 0.02 = 0.0567.
    // With smoothing 0.1, the value should move 10% of the way.
    // cur = 0.0367, target = 0.0367 + 0.02 = 0.0567.
    // next = 0.0367 + (0.0567 - 0.0367) * 0.1 = 0.0387
    const second = computeModulatedParamsPure({
      bindings: REACTION_DIFFUSION.audioBindings,
      configs: RD_CONFIGS,
      bands: { bass: 1, mid: 0, treble: 0 },
      smoothing: 0.1,
      prevSmoothed: first.nextSmoothed,
    });
    const expectedAfter1 = REACTION_DIFFUSION.defaultParams.feedRate + 0.02;
    const actualAfter1 = second.params.feedRate;
    expect(actualAfter1).toBeGreaterThan(REACTION_DIFFUSION.defaultParams.feedRate);
    expect(actualAfter1).toBeLessThan(expectedAfter1);
    expect(actualAfter1).toBeCloseTo(
      REACTION_DIFFUSION.defaultParams.feedRate + 0.02 * 0.1,
      10,
    );

    // After many frames the smoothed value converges to the target.
    let smoothed = second.nextSmoothed;
    for (let i = 0; i < 200; i++) {
      const r = computeModulatedParamsPure({
        bindings: REACTION_DIFFUSION.audioBindings,
        configs: RD_CONFIGS,
        bands: { bass: 1, mid: 0, treble: 0 },
        smoothing: 0.1,
        prevSmoothed: smoothed,
      });
      smoothed = r.nextSmoothed;
    }
    expect(smoothed.feedRate).toBeCloseTo(expectedAfter1, 6);
  });
});

describe("computeModulatedParamsPure — Lorenz safety (sigma/rho clamping)", () => {
  it("sigma stays within [5, 30] even under extreme band input", () => {
    const r = computeModulatedParamsPure({
      bindings: LORENZ_ATTRACTOR.audioBindings,
      configs: LZ_CONFIGS,
      bands: { bass: 10, mid: 10, treble: 10 },
      smoothing: 0.1,
      prevSmoothed: {},
    });
    // sigma range is [5, 30] per the manifest; we never go outside it
    // regardless of how loud the band is.
    expect(r.params.sigma).toBeGreaterThanOrEqual(LORENZ_ATTRACTOR.paramRanges.sigma[0]);
    expect(r.params.sigma).toBeLessThanOrEqual(LORENZ_ATTRACTOR.paramRanges.sigma[1]);
    // First-frame snap to target (clamped)
    // target = 10 + 10*3.0 = 40 → clamped to 30
    expect(r.params.sigma).toBe(LORENZ_ATTRACTOR.paramRanges.sigma[1]);
  });

  it("rho stays within [10, 50] even under extreme band input", () => {
    const r = computeModulatedParamsPure({
      bindings: LORENZ_ATTRACTOR.audioBindings,
      configs: LZ_CONFIGS,
      bands: { bass: 0, mid: 100, treble: 0 },
      smoothing: 0.1,
      prevSmoothed: {},
    });
    expect(r.params.rho).toBeGreaterThanOrEqual(LORENZ_ATTRACTOR.paramRanges.rho[0]);
    expect(r.params.rho).toBeLessThanOrEqual(LORENZ_ATTRACTOR.paramRanges.rho[1]);
    // target = 28 + 100*5.0 = 528 → clamped to 50
    expect(r.params.rho).toBe(LORENZ_ATTRACTOR.paramRanges.rho[1]);
  });

  it("attractor stays bounded under sustained bass hits (sigma never leaves safe range)", () => {
    // Simulate 60 frames of sustained bass = 1, then verify sigma is
    // still inside the bounded-attractor regime. The classical Lorenz
    // system is bounded and butterfly-shaped for sigma in [5, 30].
    let smoothed: Record<string, number> = {};
    for (let i = 0; i < 60; i++) {
      const r = computeModulatedParamsPure({
        bindings: LORENZ_ATTRACTOR.audioBindings,
        configs: LZ_CONFIGS,
        bands: { bass: 1, mid: 1, treble: 1 },
        smoothing: 0.1,
        prevSmoothed: smoothed,
      });
      smoothed = r.nextSmoothed;
      expect(smoothed.sigma).toBeGreaterThanOrEqual(5);
      expect(smoothed.sigma).toBeLessThanOrEqual(30);
      expect(smoothed.rho).toBeGreaterThanOrEqual(10);
      expect(smoothed.rho).toBeLessThanOrEqual(50);
    }
  });
});

describe("computeModulatedParamsPure — Physarum decay clamp", () => {
  it("decay stays in [0.8, 0.99] under any audio input", () => {
    const r = computeModulatedParamsPure({
      bindings: PHYSARUM.audioBindings,
      configs: PM_CONFIGS,
      bands: { bass: 1, mid: 1, treble: 1 },
      smoothing: 0.1,
      prevSmoothed: {},
    });
    // Decay is in [0.8, 0.99] per the manifest; modulation can swing
    // within that range but never outside it.
    expect(r.params.decay).toBeGreaterThanOrEqual(0.8);
    expect(r.params.decay).toBeLessThanOrEqual(0.99);
  });

  it("decay never reaches 1 (would cause pheromone to grow without bound)", () => {
    let smoothed: Record<string, number> = {};
    for (let i = 0; i < 200; i++) {
      const r = computeModulatedParamsPure({
        bindings: PHYSARUM.audioBindings,
        configs: PM_CONFIGS,
        bands: { bass: 1, mid: 0, treble: 0 },
        smoothing: 0.1,
        prevSmoothed: smoothed,
      });
      smoothed = r.nextSmoothed;
    }
    expect(smoothed.decay).toBeLessThanOrEqual(0.99);
    expect(smoothed.decay).toBeGreaterThan(0.8);
  });

  it("decay never drops to 0 (would evaporate the field instantly)", () => {
    let smoothed: Record<string, number> = {};
    // Bass = 0 (the binding target — no modulation, but vocals modulates diffuse).
    for (let i = 0; i < 200; i++) {
      const r = computeModulatedParamsPure({
        bindings: PHYSARUM.audioBindings,
        configs: PM_CONFIGS,
        bands: SILENCE,
        smoothing: 0.1,
        prevSmoothed: smoothed,
      });
      smoothed = r.nextSmoothed;
    }
    // Silence → decay at baseline (0.92)
    expect(smoothed.decay).toBeCloseTo(PHYSARUM.defaultParams.decay, 6);
  });
});

describe("computeModulatedParamsPure — dynamic re-binding", () => {
  it("respects the current bindings map (re-binding in the panel takes effect)", () => {
    // Initial binding: bass → feedRate (the RD manifest default).
    const r1 = computeModulatedParamsPure({
      bindings: REACTION_DIFFUSION.audioBindings,
      configs: RD_CONFIGS,
      bands: { bass: 1, mid: 0, treble: 0 },
      smoothing: 0.1,
      prevSmoothed: {},
    });
    expect(r1.params.feedRate).toBeGreaterThan(REACTION_DIFFUSION.defaultParams.feedRate);
    // killRate is bound to mid → at 0 it stays at baseline.
    expect(r1.params.killRate).toBeCloseTo(
      REACTION_DIFFUSION.defaultParams.killRate,
      10,
    );

    // Re-bind: user swaps bass → killRate, mid → feedRate (in the panel).
    const swappedBindings = {
      bass: "killRate" as const,
      mid: "feedRate" as const,
      treble: "stepsPerFrame" as const,
      vocals: "dt" as const,
    };
    const r2 = computeModulatedParamsPure({
      bindings: swappedBindings,
      configs: RD_CONFIGS,
      bands: { bass: 1, mid: 0, treble: 0 },
      smoothing: 0.1,
      prevSmoothed: {}, // reset because the binding topology changed
    });
    // Now bass drives killRate (so killRate is high), not feedRate.
    expect(r2.params.killRate).toBeGreaterThan(REACTION_DIFFUSION.defaultParams.killRate);
    expect(r2.params.feedRate).toBeCloseTo(
      REACTION_DIFFUSION.defaultParams.feedRate,
      10,
    );
  });

  it("handles bindings pointing at a key with no config (silently skips)", () => {
    // Bind bass to a paramKey that has no entry in configs. The hook
    // should skip it rather than throw.
    const bindingsWithMissing = {
      bass: "feedRate",
      mid: "nonexistent" as string,
      treble: "stepsPerFrame",
      vocals: "dt",
    };
    const r = computeModulatedParamsPure({
      // Cast to the expected type so TS doesn't complain; the runtime
      // type is checked.
      bindings: bindingsWithMissing as Record<string, string>,
      configs: RD_CONFIGS,
      bands: { bass: 1, mid: 1, treble: 0 },
      smoothing: 0.1,
      prevSmoothed: {},
    });
    expect(r.params.feedRate).toBeGreaterThan(REACTION_DIFFUSION.defaultParams.feedRate);
    expect(r.params).not.toHaveProperty("nonexistent");
    expect(r.params.stepsPerFrame).toBeCloseTo(5, 10);
    expect(r.params.dt).toBeCloseTo(REACTION_DIFFUSION.defaultParams.dt, 10);
  });
});

describe("computeModulatedParamsPure — system switch (config topology change)", () => {
  it("different dispatch manifests (RD vs LZ vs PM) resolve to different param keys", () => {
    const rd = computeModulatedParamsPure({
      bindings: REACTION_DIFFUSION.audioBindings,
      configs: RD_CONFIGS,
      bands: { bass: 1, mid: 0, treble: 0 },
      smoothing: 0.1,
      prevSmoothed: {},
    });
    const lz = computeModulatedParamsPure({
      bindings: LORENZ_ATTRACTOR.audioBindings,
      configs: LZ_CONFIGS,
      bands: { bass: 1, mid: 0, treble: 0 },
      smoothing: 0.1,
      prevSmoothed: {},
    });
    const pm = computeModulatedParamsPure({
      bindings: PHYSARUM.audioBindings,
      configs: PM_CONFIGS,
      bands: { bass: 1, mid: 0, treble: 0 },
      smoothing: 0.1,
      prevSmoothed: {},
    });
    // Each system binds bass to a different param key.
    expect(rd.params).toHaveProperty("feedRate");
    expect(lz.params).toHaveProperty("sigma");
    expect(pm.params).toHaveProperty("decay");
    // None of them have the others' keys.
    expect(rd.params).not.toHaveProperty("sigma");
    expect(rd.params).not.toHaveProperty("decay");
    expect(lz.params).not.toHaveProperty("feedRate");
    expect(lz.params).not.toHaveProperty("decay");
    expect(pm.params).not.toHaveProperty("feedRate");
    expect(pm.params).not.toHaveProperty("sigma");
  });

  it("system switch resets smoothing baseline (does not carry LZ sigma into RD feedRate)", () => {
    // Frame many LZ steps to build up sigma smoothing.
    let smoothed: Record<string, number> = {};
    for (let i = 0; i < 50; i++) {
      const r = computeModulatedParamsPure({
        bindings: LORENZ_ATTRACTOR.audioBindings,
        configs: LZ_CONFIGS,
        bands: { bass: 1, mid: 0, treble: 0 },
        smoothing: 0.1,
        prevSmoothed: smoothed,
      });
      smoothed = r.nextSmoothed;
    }
    expect(smoothed.sigma).toBeGreaterThan(LORENZ_ATTRACTOR.defaultParams.sigma);

    // Now switch to RD with a fresh empty prevSmoothed (this is what
    // the hook's bindingKey-change path does: it resets the ref).
    const rd = computeModulatedParamsPure({
      bindings: REACTION_DIFFUSION.audioBindings,
      configs: RD_CONFIGS,
      bands: { bass: 1, mid: 0, treble: 0 },
      smoothing: 0.1,
      prevSmoothed: {},
    });
    // RD's first frame snaps to target (no carry-over from LZ's sigma).
    const target = REACTION_DIFFUSION.defaultParams.feedRate + 0.02;
    expect(rd.params.feedRate).toBeCloseTo(target, 10);
  });
});

describe("computeModulatedParamsPure — sustained modulation (convergence)", () => {
  it("sustained loud bass converges feedRate to the clamped target", () => {
    let smoothed: Record<string, number> = {};
    for (let i = 0; i < 500; i++) {
      const r = computeModulatedParamsPure({
        bindings: REACTION_DIFFUSION.audioBindings,
        configs: RD_CONFIGS,
        bands: { bass: 1, mid: 0, treble: 0 },
        smoothing: 0.1,
        prevSmoothed: smoothed,
      });
      smoothed = r.nextSmoothed;
    }
    const expected = REACTION_DIFFUSION.defaultParams.feedRate + 0.02;
    expect(smoothed.feedRate).toBeCloseTo(expected, 6);
  });

  it("sustained loud bass with strength pushing past max → clamps to max", () => {
    // Tighten the config to provoke a clamp.
    const tightConfigs: Record<string, AudioBindingConfig> = {
      ...RD_CONFIGS,
      feedRate: {
        min: REACTION_DIFFUSION.paramRanges.feedRate[0],
        max: REACTION_DIFFUSION.paramRanges.feedRate[1],
        // Massive strength — would push target way past max
        modulationStrength: 100,
        baseline: REACTION_DIFFUSION.defaultParams.feedRate,
      },
    };
    let smoothed: Record<string, number> = {};
    for (let i = 0; i < 500; i++) {
      const r = computeModulatedParamsPure({
        bindings: REACTION_DIFFUSION.audioBindings,
        configs: tightConfigs,
        bands: { bass: 1, mid: 0, treble: 0 },
        smoothing: 0.1,
        prevSmoothed: smoothed,
      });
      smoothed = r.nextSmoothed;
    }
    // Converges to the manifest's max, not to the unclamped target.
    expect(smoothed.feedRate).toBeCloseTo(
      REACTION_DIFFUSION.paramRanges.feedRate[1],
      6,
    );
  });
});