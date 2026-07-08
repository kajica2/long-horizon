/**
 * BirthChartScene — 3D natal chart with OrbitControls.
 *
 * Wraps the BirthChartWheel in a group with:
 *   - OrbitControls (drei) for user rotation + zoom
 *   - Idle slow rotation when the user isn't interacting
 *   - Key + fill + rim lights for depth
 *
 * Camera is positioned to look at the wheel from an oblique angle.
 */

"use client";

import { useRef, useState, useEffect } from "react";
import { useFrame, useThree } from "@react-three/fiber";
import { OrbitControls } from "@react-three/drei";
import { Group } from "three";
import { BirthChartWheel } from "./BirthChartWheel";
import type { BirthChart } from "@/lib/types";

const IDLE_DELAY = 4.0; // seconds before idle auto-rotation kicks in

export function BirthChartScene({ chart, seed }: { chart: BirthChart; seed: string }) {
  const groupRef = useRef<Group>(null);
  const lastInteractionRef = useRef(0);
  const [autoRotate, setAutoRotate] = useState(false);
  const { gl } = useThree();

  // Track user interaction so we can pause auto-rotation when they're
  // actively engaging with the wheel.
  useEffect(() => {
    const onPointer = () => {
      lastInteractionRef.current = performance.now();
      if (autoRotate) setAutoRotate(false);
    };
    gl.domElement.addEventListener("pointerdown", onPointer);
    gl.domElement.addEventListener("wheel", onPointer);
    return () => {
      gl.domElement.removeEventListener("pointerdown", onPointer);
      gl.domElement.removeEventListener("wheel", onPointer);
    };
  }, [gl, autoRotate]);

  // Idle detection — enable auto-rotation after IDLE_DELAY of no interaction
  useEffect(() => {
    const id = setInterval(() => {
      const idleSec = (performance.now() - lastInteractionRef.current) / 1000;
      if (idleSec > IDLE_DELAY && !autoRotate) setAutoRotate(true);
    }, 500);
    return () => clearInterval(id);
  }, [autoRotate]);

  useFrame((_, dt) => {
    if (autoRotate && groupRef.current) {
      groupRef.current.rotation.y += dt * 0.05;
    }
  });

  return (
    <>
      {/* Lighting — 3-point setup for depth */}
      <ambientLight intensity={0.25} color="#fff5e0" />
      <directionalLight
        position={[6, 10, 4]}
        intensity={1.0}
        color="#fff5e0"
        castShadow
      />
      <directionalLight position={[-6, 4, -4]} intensity={0.4} color="#a0c4d8" />
      <pointLight position={[0, 6, 0]} intensity={0.6} color="#fff" />

      <group ref={groupRef} position={[0, 0, 0]}>
        <BirthChartWheel chart={chart} seed={seed} />
      </group>

      <OrbitControls
        enablePan={false}
        minDistance={4}
        maxDistance={20}
        minPolarAngle={0.1}
        maxPolarAngle={Math.PI / 2.2}
        target={[0, 0, 0]}
        onStart={() => {
          lastInteractionRef.current = performance.now();
          if (autoRotate) setAutoRotate(false);
        }}
        onEnd={() => {
          lastInteractionRef.current = performance.now();
        }}
      />
    </>
  );
}