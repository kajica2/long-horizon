"use client";

/**
 * LorenzAttractor — R3F component hosting the 3D Lorenz strange attractor.
 *
 * Each frame the simulation advances one RK4 step and the new (x, y, z)
 * is appended to a circular trail buffer. The trail is uploaded as a
 * `THREE.Line` whose position attribute is rebuilt in chronological order
 * each frame so that older segments render behind the head.
 *
 * Reproducibility: the seed is the only input that determines the orbit
 * geometry. The engine store configures look-and-feel (palette, audio
 * modulation, params) but the underlying dynamics are fully determined
 * by `(seed, frame)`.
 */

import { useEffect, useMemo, useRef } from "react";
import { useFrame, useThree } from "@react-three/fiber";
import * as THREE from "three";

import { useEngineStore } from "@/lib/engine/store";
import {
  createLorenzState,
  stepLorenz,
  LORENZ_DEFAULTS,
  type LorenzState,
} from "@/lib/engine/lorenz-attractor";
import {
  LORENZ_VERTEX,
  LORENZ_FRAGMENT,
  LORENZ_PALETTES,
} from "@/lib/engine/shaders/lorenz-render";

/**
 * Static camera placement that frames the Lorenz attractor.
 * The orbit sits inside roughly [-25, 25]² × [0, 50]; pulling the
 * camera off-axis gives the butterfly its characteristic depth.
 */
const LORENZ_CAMERA_POS: [number, number, number] = [40, 25, 40];
const LORENZ_CAMERA_TARGET: [number, number, number] = [0, 15, 25];

type LorenzProps = {
  seed: string;
  /** Optional initial param override for the trail length. */
  initialMaxPoints?: number;
};

/**
 * Project the circular trail buffer into chronological order.
 * `head` points at the *next write slot*, so the most recent point
 * lives at `(head - 1) mod len`. We walk backwards from there.
 */
function orderedTrail(
  trail: Float32Array,
  head: number,
  count: number,
  trailLength: number,
): { x: Float32Array; y: Float32Array; z: Float32Array; n: number } {
  const n = count;
  const x = new Float32Array(n);
  const y = new Float32Array(n);
  const z = new Float32Array(n);
  for (let i = 0; i < n; i++) {
    const idx = ((head - 1 - i) % trailLength + trailLength) % trailLength;
    const o = idx * 3;
    x[i] = trail[o + 0];
    y[i] = trail[o + 1];
    z[i] = trail[o + 2];
  }
  return { x, y, z, n };
}

export function LorenzAttractor({ seed, initialMaxPoints }: LorenzProps) {
  const { size, camera } = useThree();
  const shaderGraph = useEngineStore((s) => s.shaderGraph);
  const paletteName = shaderGraph.palette;
  const params = shaderGraph.params;
  const audioBass = useEngineStore((s) => s.audioBass);
  const audioMid = useEngineStore((s) => s.audioMid);

  // Build a fresh simulation whenever the seed changes.
  const state: LorenzState = useMemo(() => {
    return createLorenzState({
      seed,
      maxPoints: initialMaxPoints ?? LORENZ_DEFAULTS.trailLength,
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [seed]);

  // Set up GPU resources once per seed.
  useEffect(() => {
    const trailLength = state.trailLength;

    // Allocate the position attribute once; we'll re-upload its
    // contents each frame by mutating the typed array and marking
    // the attribute as needing an update. The draw range shrinks as
    // the buffer fills, then stays at `trailLength` once full.
    const positions = new Float32Array(trailLength * 3);
    const ages = new Float32Array(trailLength);

    const geometry = new THREE.BufferGeometry();
    const positionAttribute = new THREE.BufferAttribute(positions, 3);
    positionAttribute.setUsage(THREE.DynamicDrawUsage);
    const ageAttribute = new THREE.BufferAttribute(ages, 1);
    ageAttribute.setUsage(THREE.DynamicDrawUsage);
    geometry.setAttribute("position", positionAttribute);
    geometry.setAttribute("a_age", ageAttribute);
    geometry.setDrawRange(0, 0);

    const palette = LORENZ_PALETTES[paletteName] ?? LORENZ_PALETTES.aurora;
    const material = new THREE.ShaderMaterial({
      vertexShader: LORENZ_VERTEX,
      fragmentShader: LORENZ_FRAGMENT,
      uniforms: {
        u_maxAge: { value: trailLength },
        u_lineWidth: { value: Number(params.lineWidth) || 1.2 },
        u_pixelRatio: { value: Math.min(window.devicePixelRatio || 1, 2) },
        u_colorStart: { value: new THREE.Vector3(...palette.start) },
        u_colorEnd:   { value: new THREE.Vector3(...palette.end) },
        u_fadeTail:   { value: Number(params.fadeTail) || 0.85 },
        u_alpha:      { value: 0.95 },
        u_audioBass:  { value: 0 },
        u_audioMid:   { value: 0 },
      },
      transparent: true,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
    });

    const line = new THREE.Line(geometry, material);
    line.frustumCulled = false;

    geometryRef.current = geometry;
    materialRef.current = material;
    lineRef.current = line;
    positionsRef.current = positions;
    agesRef.current = ages;

    return () => {
      geometry.dispose();
      material.dispose();
      lineRef.current = null;
      geometryRef.current = null;
      materialRef.current = null;
      positionsRef.current = null;
      agesRef.current = null;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [seed]);

  const lineRef = useRef<THREE.Line | null>(null);
  const geometryRef = useRef<THREE.BufferGeometry | null>(null);
  const materialRef = useRef<THREE.ShaderMaterial | null>(null);
  const positionsRef = useRef<Float32Array | null>(null);
  const agesRef = useRef<Float32Array | null>(null);

  // Camera framing — done once on mount. The component is self-contained
  // before the orchestrator wires it into `EngineCanvas`.
  useEffect(() => {
    if (!camera) return;
    if (!(camera instanceof THREE.PerspectiveCamera)) return;
    camera.position.set(...LORENZ_CAMERA_POS);
    camera.lookAt(new THREE.Vector3(...LORENZ_CAMERA_TARGET));
    camera.far = 200;
    camera.updateProjectionMatrix();
  }, [camera]);

  // Keep the explicit camera framing applied even if CameraRig later
  // nudges the camera elsewhere (we re-stamp each frame at low priority).
  useFrame((_, dt) => {
    // Step the simulation at the configured dt (independent of frame dt).
    if (state) stepLorenz(state);

    const positions = positionsRef.current;
    const ages = agesRef.current;
    const geo = geometryRef.current;
    const mat = materialRef.current;
    if (!positions || !ages || !geo || !mat) return;

    // Project the circular buffer into chronological positions and
    // copy them into the GPU-bound typed arrays.
    const ordered = orderedTrail(state.trail, state.head, state.count, state.trailLength);
    positions.set(ordered.x);
    positions.set(ordered.y, ordered.n);
    positions.set(ordered.z, ordered.n * 2);
    for (let i = 0; i < ordered.n; i++) {
      ages[i] = i / Math.max(1, ordered.n - 1);
    }

    const posAttr = geo.getAttribute("position") as THREE.BufferAttribute;
    const ageAttr = geo.getAttribute("a_age") as THREE.BufferAttribute;
    posAttr.needsUpdate = true;
    ageAttr.needsUpdate = true;
    geo.setDrawRange(0, ordered.n);

    // Smoothly nudge the camera position back to framing if CameraRig
    // hasn't already centered it. Cheap lerp; dt-aware.
    if (camera instanceof THREE.PerspectiveCamera) {
      const tx = LORENZ_CAMERA_POS[0] - camera.position.x;
      const ty = LORENZ_CAMERA_POS[1] - camera.position.y;
      const tz = LORENZ_CAMERA_POS[2] - camera.position.z;
      camera.position.x += tx * Math.min(1, dt);
      camera.position.y += ty * Math.min(1, dt);
      camera.position.z += tz * Math.min(1, dt);
    }
  });

  // Live uniform updates — palette colors, line params, audio reactivity.
  useEffect(() => {
    const mat = materialRef.current;
    if (!mat) return;
    const palette = LORENZ_PALETTES[paletteName] ?? LORENZ_PALETTES.aurora;
    mat.uniforms.u_colorStart.value.set(palette.start[0], palette.start[1], palette.start[2]);
    mat.uniforms.u_colorEnd.value.set(palette.end[0], palette.end[1], palette.end[2]);
    const w = Number(params.lineWidth) || 1.2;
    mat.uniforms.u_lineWidth.value = w;
    mat.uniforms.u_fadeTail.value = Number(params.fadeTail) || 0.85;
  }, [paletteName, params.lineWidth, params.fadeTail]);

  useEffect(() => {
    const mat = materialRef.current;
    if (!mat) return;
    mat.uniforms.u_audioBass.value = audioBass;
    mat.uniforms.u_audioMid.value = audioMid;
  }, [audioBass, audioMid]);

  // Resolution tracking — the standard line shader doesn't strictly
  // need it but downstream `LineMaterial` paths do; harmless here.
  useEffect(() => {
    void size.width;
    void size.height;
  }, [size.width, size.height]);

  if (!lineRef.current) return null;
  return <primitive object={lineRef.current} />;
}

export { LORENZ_CAMERA_POS, LORENZ_CAMERA_TARGET };
