/**
 * SandTraveler — R3F component that hosts Tarbell's Sand Traveler simulation.
 *
 * Renders the simulation to a 2D canvas (offscreen, never cleared) and displays
 * the result as a CanvasTexture on a 3D plane. The camera rig can move around
 * the plane for depth/parallax.
 *
 * 'use client' because R3F is browser-only.
 */
"use client";

import { useRef, useMemo, useEffect } from "react";
import { useFrame } from "@react-three/fiber";
import { CanvasTexture, LinearFilter, SRGBColorSpace, Mesh } from "three";
import {
  createSandTravelerState,
  stepSandTraveler,
} from "@/lib/engine/sand-traveler";

const PLANE_W = 14;
const PLANE_H = 14;

export function SandTraveler({ seed }: { seed: string }) {
  const meshRef = useRef<Mesh>(null);

  // Canvas size matches the underlying simulation (square is fine; we
  // letterbox in the 3D plane).
  const CANVAS_W = 1000;
  const CANVAS_H = 1000;

  // Set up canvas + simulation state once per seed.
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
    const state = createSandTravelerState({
      seed,
      width: CANVAS_W,
      height: CANVAS_H,
    });
    const texture = new CanvasTexture(canvas);
    texture.colorSpace = SRGBColorSpace;
    texture.minFilter = LinearFilter;
    texture.magFilter = LinearFilter;
    texture.needsUpdate = true;
    return { canvas, texture, state };
  }, [seed]);

  // Step the simulation each frame. The texture auto-updates because
  // CanvasTexture re-reads the canvas on render.
  useFrame(() => {
    if (!canvas || !state) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;
    stepSandTraveler(state, ctx);
    if (texture) texture.needsUpdate = true;
  });

  // Dispose on unmount
  useEffect(() => {
    return () => {
      texture?.dispose();
    };
  }, [texture]);

  if (!texture) return null;

  return (
    <mesh ref={meshRef} position={[0, 0, 0]}>
      <planeGeometry args={[PLANE_W, PLANE_H, 1, 1]} />
      <meshBasicMaterial map={texture} toneMapped={false} />
    </mesh>
  );
}
