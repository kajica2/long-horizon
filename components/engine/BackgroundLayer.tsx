"use client";

import { useEffect, useMemo, useRef } from "react";
import { useFrame } from "@react-three/fiber";
import * as THREE from "three";
import { BACKGROUND_VERTEX, BACKGROUND_FRAGMENT } from "@/lib/engine/shaders/background";
import { useEngineStore } from "@/lib/engine/store";

/**
 * Background nebula layer — slow-evolving large-scale noise behind particles.
 * Renders to a fullscreen quad, depthWrite disabled so particles overlay it.
 */
export function BackgroundLayer() {
  const meshRef = useRef<THREE.Mesh>(null);
  const matRef = useRef<THREE.ShaderMaterial>(null);

  const audioBass = useEngineStore((s) => s.audioBass);
  const paused = useEngineStore((s) => s.paused);
  const simTimeRef = useRef(0);

  const palette = useEngineStore((s) => s.shaderGraph.palette);

  const paletteColors = useMemo<{ top: THREE.Vector3; bottom: THREE.Vector3 }>(() => {
    switch (palette) {
      case "ember":
        return { top: new THREE.Vector3(0.5, 0.15, 0.05), bottom: new THREE.Vector3(0.15, 0.02, 0.0) };
      case "tide":
        return { top: new THREE.Vector3(0.05, 0.4, 0.5), bottom: new THREE.Vector3(0.0, 0.1, 0.15) };
      case "ink":
        return { top: new THREE.Vector3(0.1, 0.05, 0.3), bottom: new THREE.Vector3(0.02, 0.0, 0.08) };
      case "bone":
        return { top: new THREE.Vector3(0.4, 0.4, 0.38), bottom: new THREE.Vector3(0.1, 0.1, 0.1) };
      case "moss":
        return { top: new THREE.Vector3(0.15, 0.3, 0.1), bottom: new THREE.Vector3(0.02, 0.08, 0.0) };
      case "aurora":
      default:
        return { top: new THREE.Vector3(0.3, 0.1, 0.5), bottom: new THREE.Vector3(0.02, 0.05, 0.15) };
    }
  }, [palette]);

  const material = useMemo(() => {
    return new THREE.ShaderMaterial({
      uniforms: {
        u_seed: { value: 0.5 },
        u_simTime: { value: 0 },
        u_audioBass: { value: 0 },
        u_colorTop: { value: paletteColors.top },
        u_colorBottom: { value: paletteColors.bottom },
      },
      vertexShader: BACKGROUND_VERTEX,
      fragmentShader: BACKGROUND_FRAGMENT,
      depthTest: false,
      depthWrite: false,
    });
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  // Update palette colors when palette changes.
  // Moved from "compare ref during render" to a useEffect to satisfy
  // react-hooks/refs and react-hooks/immutability rules — mutating refs
  // during render causes issues with concurrent rendering.
  useEffect(() => {
    material.uniforms.u_colorTop.value = paletteColors.top;
    material.uniforms.u_colorBottom.value = paletteColors.bottom;
  }, [material, paletteColors.top, paletteColors.bottom]);

  useFrame((_state, dt) => {
    if (paused) return;
    simTimeRef.current += dt;
    material.uniforms.u_simTime.value = simTimeRef.current;
    material.uniforms.u_audioBass.value = audioBass;
  });

  return (
    <mesh ref={meshRef} frustumCulled={false} renderOrder={-100}>
      <planeGeometry args={[2, 2]} />
      <primitive object={material} attach="material" ref={matRef} />
    </mesh>
  );
}