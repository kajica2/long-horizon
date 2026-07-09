/**
 * useAudioBindings — generic React hook that resolves audio reactivity for
 * a Living System.
 *
 * Each Living System's dispatch manifest declares `audioBindings`, a
 * mapping from AudioBand (bass / mid / treble / vocals) → paramKey. This
 * hook reads the binding map + the live audio band levels from the engine
 * store, applies a per-band modulation strength and attack/release
 * smoothing, and returns the resolved `paramKey → value` map for the
 * component to apply to its simulation.
 *
 * The 3 new systems (reactionDiffusion, lorenzAttractor, physarum) use
 * this hook. Existing systems (flowFieldMeditation, cosmicFilaments) have
 * their own bespoke audio reactivity paths in the particle compute shader;
 * they are out of scope for this slice.
 *
 * Design notes:
 *   - We deliberately do NOT call `updateParam()` per frame. Doing so would
 *     trigger 60 store mutations/sec and cascade fresh-object re-renders
 *     to every selector that reads `shaderGraph`. Instead the hook returns
 *     the resolved map; the component writes the values into its own
 *     simulation state (e.g. `state.sigma = result.sigma`).
 *   - Smoothing is a single-pole low-pass on the *delta* between the
 *     current smoothed value and the target. Coefficient 0.1 ≈ 90% of the
 *     way to target after ~22 frames at 60fps (~0.37s). Identical in
 *     spirit to a peak-follower's release ramp.
 *   - Per-system defaults are declared in the dispatch manifest's
 *     `paramRanges` field. We clamp the resolved value to that range so
 *     Lorenz's sigma/rho can never push the integrator out of the
 *     bounded attractor regime.
 */

import { useMemo, useRef } from "react";
import { useEngineStore } from "@/lib/engine/store";
import type { AudioBand } from "@/lib/types";

// ============================================================
// Types
// ============================================================

/**
 * Per-param mod configuration. Each bound param gets one of these.
 *
 * `min`/`max` clamp the resolved value to a safe range. `modulationStrength`
 * scales the band input: the band value in [0,1] gets multiplied by this
 * before being applied as `baseline + (bandValue * modulationStrength)`.
 * So a strength of 0.05 means the param can swing ±5% of its baseline
 * under full-band excitation.
 *
 * `baseline` is the value the param sits at when audio is silent (band=0).
 * Usually the dispatch manifest's `defaultParams[paramKey]`.
 */
export type AudioBindingConfig = {
  min: number;
  max: number;
  modulationStrength: number;
  baseline: number;
};

/**
 * Hook options. The component supplies:
 *   - the binding map (band → paramKey), from its dispatch manifest
 *   - a config map (paramKey → AudioBindingConfig), with safe ranges
 *     and the modulation amount per param
 *   - optional smoothing coefficient (defaults to 0.1, ≈0.37s 90% rise)
 *
 * The hook returns a function `computeModulatedParams()` that the
 * component calls per frame to get the smoothed param values. We also
 * expose the raw band levels for convenience (some systems want to use
 * the audio band directly without binding to a param).
 */
export type UseAudioBindingsOpts = {
  bindings: Record<AudioBand, string>;
  configs: Record<string, AudioBindingConfig>;
  smoothing?: number;
};

// ============================================================
// Pure resolver (exported for tests; no React dependency)
// ============================================================

/**
 * Single-pole low-pass smoothing toward a target value.
 *   next = current + (target - current) * coefficient
 * Pure function — no React, no store, no state mutation. Identical
 * math to a peak-follower's release ramp.
 */
export function smoothToward(
  current: number,
  target: number,
  coefficient: number,
): number {
  return current + (target - current) * coefficient;
}

/**
 * Resolve the target value of one bound param, given the band level
 * and the per-param config. The mapping is:
 *
 *   rawDelta = bandValue * modulationStrength
 *   target   = baseline + rawDelta
 *   clamped  = clamp(target, min, max)
 *
 * Returned value is already clamped and finite-safe — callers can
 * push it straight into a shader uniform or sim param without bounds
 * checking again.
 *
 * Pure function — exported for tests. `bandValue` is conventionally
 * in [0, 1] (the audio analyser's normalized output).
 */
export function resolveAudioModulatedParam(
  bandValue: number,
  config: AudioBindingConfig,
): number {
  // Defend against non-finite inputs (the analyser occasionally
  // produces NaN during context-loss); degenerate to baseline.
  if (!Number.isFinite(bandValue)) {
    return Math.min(config.max, Math.max(config.min, config.baseline));
  }
  const raw = bandValue * config.modulationStrength;
  const target = config.baseline + raw;
  if (target < config.min) return config.min;
  if (target > config.max) return config.max;
  return target;
}

// ============================================================
// Hook
// ============================================================

export type AudioBindingsResolved = {
  /** Smoothed param map — apply these to the sim each frame. */
  params: Record<string, number>;
  /** Raw band levels (also clamped to [0, 1]) for ad-hoc consumers. */
  bands: { bass: number; mid: number; treble: number; vocals: number };
};

export type ComputeModulatedParamsFn = () => AudioBindingsResolved;

/**
 * Pure per-frame resolver. Reads `bindings` + the current audio bands,
 * applies smoothing into the `prevSmoothed` accumulator, and returns
 * the resolved param map and the next smoothed accumulator.
 *
 * This is the testable core of `useAudioBindings` — the hook itself
 * is just glue that reads the store and manages a ref. Exported so
 * tests can verify the smoothing/clamping/identity behaviour without
 * needing a React renderer.
 *
 * `prevSmoothed` is mutated and returned; callers should pass the
 * returned value back in on the next call. Initial call should pass
 * `{}` (first-frame snap behaviour).
 */
export function computeModulatedParamsPure(args: {
  bindings: Record<AudioBand, string>;
  configs: Record<string, AudioBindingConfig>;
  bands: { bass: number; mid: number; treble: number; vocals?: number };
  smoothing: number;
  prevSmoothed: Record<string, number>;
}): AudioBindingsResolved & { nextSmoothed: Record<string, number> } {
  const { bindings, configs, bands, smoothing, prevSmoothed } = args;
  const bass = Number.isFinite(bands.bass) ? bands.bass : 0;
  const mid = Number.isFinite(bands.mid) ? bands.mid : 0;
  const treble = Number.isFinite(bands.treble) ? bands.treble : 0;
  const vocalsRaw = bands.vocals ?? Math.min(1, treble * 1.2);
  const vocals = Number.isFinite(vocalsRaw) ? vocalsRaw : 0;

  const bandMap: Record<AudioBand, number> = { bass, mid, treble, vocals };

  const nextSmoothed: Record<string, number> = { ...prevSmoothed };
  const out: Record<string, number> = {};
  for (const band of Object.keys(bindings) as AudioBand[]) {
    const paramKey = bindings[band];
    const config = configs[paramKey];
    if (!config) continue;
    const target = resolveAudioModulatedParam(bandMap[band], config);
    const cur = prevSmoothed[paramKey];
    const next =
      cur === undefined ? target : smoothToward(cur, target, smoothing);
    nextSmoothed[paramKey] = next;
    out[paramKey] = next;
  }

  return {
    params: out,
    bands: { bass, mid, treble, vocals },
    nextSmoothed,
  };
}

/**
 * Resolve audio reactivity for a Living System.
 *
 * Returns a stable function `computeModulatedParams()` that the
 * component invokes each frame to get the smoothed param values.
 * The function:
 *
 *   1. Reads `shaderGraph.audioBindings` and the live audio bands from
 *      the engine store (so re-binding in the panel takes effect on the
 *      very next frame).
 *   2. For each binding, resolves `bandValue * modulationStrength` and
 *      smooths toward that target with the supplied coefficient.
 *   3. Returns the smoothed param map + raw band levels.
 *
 * The smoothed values live in a ref (so we don't trigger re-renders on
 * every frame); the resolver mutates the ref in-place.
 *
 * When `bindings` or `configs` changes (system switch, panel re-bind,
 * dispatch manifest swap), the ref is rebuilt so we never carry stale
 * smoothed values across system boundaries.
 */
export function useAudioBindings(opts: UseAudioBindingsOpts): {
  computeModulatedParams: ComputeModulatedParamsFn;
} {
  const { bindings, configs, smoothing = 0.1 } = opts;

  // Per-(band, paramKey) smoothed state. Rebuilt whenever the binding
  // map or the config map changes identity (system switch, panel re-bind).
  //
  // We key the inner ref by `JSON.stringify(bindings)` so a panel-driven
  // re-bind to a different paramKey resets the smoothed value rather
  // than carrying the previous key's value into a new param.
  const bindingKey = useMemo(
    () =>
      JSON.stringify({
        b: bindings,
        c: Object.fromEntries(
          Object.entries(configs).map(([k, v]) => [
            k,
            `${v.min}|${v.max}|${v.modulationStrength}|${v.baseline}`,
          ]),
        ),
      }),
    [bindings, configs],
  );

  const smoothedRef = useRef<Record<string, number>>({});
  const lastKeyRef = useRef<string>(bindingKey);

  if (lastKeyRef.current !== bindingKey) {
    // Reset the smoothed values when the binding or config topology changes.
    smoothedRef.current = {};
    lastKeyRef.current = bindingKey;
  }

  const computeModulatedParams = (): AudioBindingsResolved => {
    // Read the live audio bands + bindings from the store imperatively
    // (not via useEngineStore selectors) so we never trigger a React
    // re-render. The function runs at frame rate.
    const store = useEngineStore.getState();
    const bass = store.audioBass;
    const mid = store.audioMid;
    const treble = store.audioTreble;

    // The pure helper does the actual smoothing/clamping/identity work.
    // We re-import the result back into our ref so subsequent frames
    // continue from the right smoothed value.
    const result = computeModulatedParamsPure({
      bindings,
      configs,
      bands: { bass, mid, treble },
      smoothing,
      prevSmoothed: smoothedRef.current,
    });
    smoothedRef.current = result.nextSmoothed;
    return {
      params: result.params,
      bands: result.bands,
    };
  };

  return { computeModulatedParams };
}

export default useAudioBindings;