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
 */
"use client";

import { useEffect, useMemo } from "react";
import { useFrame } from "@react-three/fiber";
import { CanvasTexture, LinearFilter, SRGBColorSpace } from "three";
import {
  createReactionDiffusionState,
  stepReactionDiffusion,
  renderReactionDiffusion,
} from "@/lib/engine/reaction-diffusion";
import { useEngineStore } from "@/lib/engine/store";
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

  // Step + paint each frame
  useFrame(() => {
    if (!canvas || !state) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;
    // Convergence sweet spot: run several inner steps per frame so
    // visible patterns emerge within seconds rather than minutes.
    for (let i = 0; i < DEFAULT_STEPS_PER_FRAME; i++) {
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
