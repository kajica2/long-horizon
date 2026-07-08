/**
 * DeJongAttractor — R3F component hosting Tarbell's Peter de Jong attractor.
 *
 * 2D-canvas-based Living System, like SandTraveler. Renders the simulation
 * to a 2D canvas (offscreen, never cleared) and displays as a CanvasTexture
 * on a 3D plane.
 */
"use client";

import { useRef, useMemo, useEffect } from "react";
import { useFrame } from "@react-three/fiber";
import { CanvasTexture, LinearFilter, SRGBColorSpace, Mesh } from "three";
import {
  createDeJongAttractorState,
  stepDeJongAttractor,
} from "@/lib/engine/de-jong-attractor";

const PLANE_W = 14;
const PLANE_H = 14;

export function DeJongAttractor({ seed }: { seed: string }) {
  const meshRef = useRef<Mesh>(null);

  const CANVAS_W = 800;
  const CANVAS_H = 800;

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
    const state = createDeJongAttractorState({
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

  useFrame(() => {
    if (!canvas || !state) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;
    stepDeJongAttractor(state, ctx);
    if (texture) texture.needsUpdate = true;
  });

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
