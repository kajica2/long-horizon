/**
 * ReactionDiffusion — R3F component hosting the Gray-Scott simulator.
 *
 * Mirrors the structure of DeJongAttractor.tsx / SandTraveler.tsx:
 *   - Allocate a 2D <canvas> sized to the simulation grid.
 *   - Init the simulation state with the seed.
 *   - Step it `stepsPerFrame` times per render frame to converge fast.
 *   - Paint the current v-field into the canvas each frame.
 *   - Wrap the canvas in a `CanvasTexture` and display it on a 3D plane.
 *
 * The colour-map is palette-driven via the engine's PaletteName.
 * Palette changes are observed via `useEngineStore` and trigger a
 * render-loop repaint with the new palette.
 *
 * Audio reactivity (Stage 19 — slice "audio-bindings-new-systems"):
 *   bass    → feedRate     (F — feed rate of u)
 *   mid     → killRate     (k — kill rate of v)
 *   treble  → stepsPerFrame (inner-loop count; more = faster pattern emergence)
 *   vocals  → dt           (Euler time step)
 *
 * The bound params are smoothed by useAudioBindings and written into
 * `state.params` each frame so the integrator sees a coherent value.
 */
"use client";

import { useEffect, useMemo, useRef } from "react";
import { useFrame } from "@react-three/fiber";
import { CanvasTexture, LinearFilter, SRGBColorSpace } from "three";
import {
  createReactionDiffusionState,
  stepReactionDiffusion,
  renderReactionDiffusion,
} from "@/lib/engine/reaction-diffusion";
import { useEngineStore } from "@/lib/engine/store";
import { useAudioBindings } from "@/lib/engine/use-audio-bindings";
import { REACTION_DIFFUSION } from "@/lib/engine/dispatch-reaction-diffusion";
import type { PaletteName } from "@/lib/types";

const PLANE_W = 14;
const PLANE_H = 14;

// Canvas runs at a square resolution matching the simulation grid.
// 512×512 balances simulation cost and visible detail (each cell maps
// to 1 pixel; CanvasTexture's bilinear filter smooths visually).
const CANVAS_W = 512;
const CANVAS_H = 512;
const SIM_W = 512;
const SIM_H = 512;
const DEFAULT_STEPS_PER_FRAME = 5;

export function ReactionDiffusion({ seed }: { seed: string }) {
  // Re-init when seed changes
  const { canvas, texture, state } = useMemo(() => {
    if (typeof document === "undefined") {
      return { canvas: null, texture: null, state: null };
    }
    const canvas = document.createElement("canvas");
    canvas.width = CANVAS_W;
    canvas.height = CANVAS_H;
    const ctx = canvas.getContext("2d");
    if (!ctx) {
      return { canvas: null, texture: null, state: null };
    }
    const state = createReactionDiffusionState({
      seed,
      width: SIM_W,
      height: SIM_H,
    });
    // Prime the visible texture with the initial state so a t=0 frame
    // is on screen before the first useFrame tick.
    renderReactionDiffusion(state, ctx, "ink");
    const texture = new CanvasTexture(canvas);
    texture.colorSpace = SRGBColorSpace;
    texture.minFilter = LinearFilter;
    texture.magFilter = LinearFilter;
    texture.needsUpdate = true;
    return { canvas, texture, state };
  }, [seed]);

  // Read palette reactively — every render sees the current value,
  // and useFrame always uses the latest closure.
  const palette: PaletteName = useEngineStore((s) => s.shaderGraph.palette);

  // ---------- Audio bindings ----------
  // The dispatch manifest declares the per-band → paramKey mapping; we
  // supply per-param configs with safe ranges from `paramRanges` and a
  // modulation strength scaled to each param's typical dynamic range.
  //
  // Strength values: feedRate and killRate sit in narrow ranges (~0.03
  // and ~0.06 respectively), so a strength of ~0.02 swings the param by
  // up to ±0.02 — enough to perturb regime without destabilizing. dt
  // sits in [0.5, 1.5] so 0.4 strength gives ±40% swing. stepsPerFrame
  // ranges 1..20 so 8 strength gives ±8 step swing.
  const { computeModulatedParams } = useAudioBindings({
    bindings: REACTION_DIFFUSION.audioBindings,
    configs: {
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
        baseline: DEFAULT_STEPS_PER_FRAME,
      },
      dt: {
        min: REACTION_DIFFUSION.paramRanges.dt[0],
        max: REACTION_DIFFUSION.paramRanges.dt[1],
        modulationStrength: 0.4,
        baseline: REACTION_DIFFUSION.defaultParams.dt,
      },
    },
  });

  // Cache the previous stepsPerFrame so we only loop on changes (avoids
  // re-evaluating the inner loop condition on every frame when the value
  // has stabilised).
  const lastStepsRef = useRef<number>(DEFAULT_STEPS_PER_FRAME);

  // Step + paint each frame
  useFrame(() => {
    if (!canvas || !state) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    // Apply audio-modulated params to the simulation state. We write
    // directly into state.params (F/k/dt) rather than going through
    // updateParam() — calling updateParam() per-frame would trigger
    // 60 store mutations/sec and re-render every selector that reads
    // shaderGraph. The simulation reads state.params.F/k/dt each step.
    const mod = computeModulatedParams();
    const p = mod.params;
    if (typeof p.feedRate === "number") state.params.F = p.feedRate;
    if (typeof p.killRate === "number") state.params.k = p.killRate;
    if (typeof p.dt === "number") state.params.dt = p.dt;

    // stepsPerFrame is the inner-loop count; clamp + floor + at least 1
    // so we always make progress.
    const stepsRaw =
      typeof p.stepsPerFrame === "number" ? p.stepsPerFrame : DEFAULT_STEPS_PER_FRAME;
    const steps = Math.max(1, Math.floor(stepsRaw));
    lastStepsRef.current = steps;

    // Convergence sweet spot: run several inner steps per frame so
    // visible patterns emerge within seconds rather than minutes.
    for (let i = 0; i < steps; i++) {
      stepReactionDiffusion(state);
    }
    renderReactionDiffusion(state, ctx, palette);
    if (texture) texture.needsUpdate = true;
  });

  // Dispose texture on unmount
  useEffect(() => {
    return () => {
      texture?.dispose();
    };
  }, [texture]);

  if (!texture) return null;

  return (
    <mesh position={[0, 0, 0]}>
      <planeGeometry args={[PLANE_W, PLANE_H, 1, 1]} />
      <meshBasicMaterial map={texture} toneMapped={false} />
    </mesh>
  );
}