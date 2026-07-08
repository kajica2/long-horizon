"use client";

import { useEffect, useMemo, useRef } from "react";
import { useFrame, useThree } from "@react-three/fiber";
import * as THREE from "three";
import { ParticleEngine } from "@/lib/engine/particles";
import {
  PARTICLE_VERTEX,
  PARTICLE_FRAGMENT,
  PALETTES,
} from "@/lib/engine/shaders/particle-render";
import { useEngineStore } from "@/lib/engine/store";

/**
 * ParticleSystem — owns the GPGPU compute + render for Flow Field Meditation.
 *
 * Particle positions live in a floating-point texture updated by a compute
 * pass on a fixed simulation clock. Render reads from that texture and
 * draws additive points with age-based gradient coloring.
 */
export function ParticleSystem({ seed }: { seed: string }) {
  const { gl } = useThree();
  const engineRef = useRef<ParticleEngine | null>(null);
  const pointsRef = useRef<THREE.Points>(null);

  const shaderGraph = useEngineStore((s) => s.shaderGraph);
  const paused = useEngineStore((s) => s.paused);
  const setSimTime = useEngineStore((s) => s.setSimTime);
  const audioBass = useEngineStore((s) => s.audioBass);
  const audioMid = useEngineStore((s) => s.audioMid);
  const audioTreble = useEngineStore((s) => s.audioTreble);

  const seedRef = useRef(seed);

  // Initialize engine once
  useEffect(() => {
    const count = Number(shaderGraph.params.particleCount) || 250_000;
    const engine = new ParticleEngine(gl, {
      seed,
      particleCount: count,
      spawnRadius: Number(shaderGraph.params.spawnRadius) || 8,
      maxAge: Number(shaderGraph.params.maxAge) || 12,
      fieldStrength: Number(shaderGraph.params.fieldStrength) || 1,
      noiseScale: Number(shaderGraph.params.noiseScale) || 0.6,
      drag: Number(shaderGraph.params.drag) || 0.08,
    });
    engineRef.current = engine;

    return () => {
      engine.dispose();
      engineRef.current = null;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [gl]);

  // React to seed changes (e.g., when /engine/[id] loads a different artwork)
  useEffect(() => {
    if (engineRef.current && seedRef.current !== seed) {
      engineRef.current.setSeed(seed);
      seedRef.current = seed;
    }
  }, [seed]);

  // Update engine uniforms when shader graph params change
  useEffect(() => {
    const engine = engineRef.current;
    if (!engine) return;
    // ParticleEngine reads params at construction; for live tweaks we
    // would need to expose more setters. For Stage 3 we re-init on big changes.
    // (Stage 7 will add proper live updates via the parameter panel.)
  }, [shaderGraph]);

  // Build the render material once
  const material = useMemo(() => {
    return new THREE.ShaderMaterial({
      uniforms: {
        u_positionTexture: { value: null },
        u_textureSize: { value: new THREE.Vector2(0, 0) },
        u_pointSize: { value: shaderGraph.params.pointSize ?? 1.4 },
        u_pixelRatio: { value: Math.min(window.devicePixelRatio, 2) },
        u_colorStart: { value: new THREE.Vector3(0.2, 0.4, 0.95) },
        u_colorEnd: { value: new THREE.Vector3(0.95, 0.3, 0.8) },
        u_maxAge: { value: shaderGraph.params.maxAge ?? 12 },
        u_energy: { value: 0 },
        u_alpha: { value: 1.0 },
      },
      vertexShader: PARTICLE_VERTEX,
      fragmentShader: PARTICLE_FRAGMENT,
      transparent: true,
      depthTest: false,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
    });
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  // Build geometry with per-particle index attribute
  const geometry = useMemo(() => {
    const engine = engineRef.current;
    const count = engine?.count ?? Number(shaderGraph.params.particleCount) ?? 250_000;
    const textureSize = engine?.textureSize ?? 1024;

    const indices = new Float32Array(count);
    for (let i = 0; i < count; i++) indices[i] = i;

    const geo = new THREE.BufferGeometry();
    geo.setAttribute("position", new THREE.BufferAttribute(new Float32Array(count * 3), 3));
    geo.setAttribute("a_index", new THREE.BufferAttribute(indices, 1));
    geo.setDrawRange(0, count);
    // We don't really use the position attribute — the shader samples the texture
    // by a_index. But Three.js requires some position attribute, so we set it to
    // a constant origin and rely on the shader override.

    return { geometry: geo, textureSize };
  }, [shaderGraph.params.particleCount]);

  // Update palette colors when palette changes
  useEffect(() => {
    const palette = PALETTES[shaderGraph.palette];
    material.uniforms.u_colorStart.value.set(...palette.start);
    material.uniforms.u_colorEnd.value.set(...palette.end);
  }, [shaderGraph.palette, material]);

  // Per-frame: step simulation + update render uniforms
  useFrame((_state, dt) => {
    const engine = engineRef.current;
    if (!engine || paused) return;

    engine.step(dt);
    engine.setAudioModulation(audioBass, audioMid, audioTreble);

    // Update render material with the latest position texture
    material.uniforms.u_positionTexture.value = engine.getPositionTexture();
    material.uniforms.u_textureSize.value.set(engine.textureSize, engine.textureSize);
    material.uniforms.u_pointSize.value = shaderGraph.params.pointSize ?? 1.4;
    material.uniforms.u_maxAge.value = shaderGraph.params.maxAge ?? 12;
    material.uniforms.u_energy.value = audioBass + audioMid * 0.5; // aggregate energy

    // Sync sim time back to store (for UI display)
    setSimTime(engine.getSimTime());
  });

  return (
    <points ref={pointsRef} frustumCulled={false} renderOrder={10}>
      <primitive object={geometry.geometry} attach="geometry" />
      <primitive object={material} attach="material" />
    </points>
  );
}