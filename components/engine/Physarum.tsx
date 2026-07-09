/**
 * Physarum — R3F Living System component.
 *
 * 'use client' — R3F is browser-only.
 *
 * Hosts the slime mold simulation as ping-pong render targets:
 *   - agentTexture  (RGBA32F): one pixel per agent, packing (x, y, heading, agentSeed)
 *   - pheromoneA/B  (R32F):    the scalar pheromone field, 1024×1024
 *
 * Each frame:
 *   1. Compute pass — agents read pheromone, decide turn, write new state
 *      to a ping-pong target.
 *   2. Deposit pass — agents splat pheromone onto the field (additive point render).
 *   3. Diffuse/decay pass — gaussian blur + multiplicative decay on the field.
 *
 * The pheromone texture is then displayed on a JSX <mesh> using a 3D plane
 * (similar to SandTraveler). The CameraRig moves the plane for depth.
 *
 * Device tier handling: if deviceTier === "low" (or "mobile"), the agent
 * count drops to LOW_TIER_NUM_AGENTS (16384) to keep mobile GPUs smooth.
 */
"use client";

import { useEffect, useMemo, useRef } from "react";
import { useFrame, useThree } from "@react-three/fiber";
import * as THREE from "three";
import { mulberry32, hashSeed } from "@/lib/seed";
import {
  PHYSARUM_AGENT_COMPUTE_FRAGMENT,
} from "@/lib/engine/shaders/physarum-compute";
import {
  PHYSARUM_DEPOSIT_FRAGMENT,
  PHYSARUM_DEPOSIT_POINT_VERTEX,
  PHYSARUM_DEPOSIT_POINT_FRAGMENT,
} from "@/lib/engine/shaders/physarum-deposit";
import {
  PHYSARUM_RENDER_VERTEX,
  PHYSARUM_RENDER_FRAGMENT,
  PALETTES,
} from "@/lib/engine/shaders/physarum-render";
import {
  DEFAULT_NUM_AGENTS,
  LOW_TIER_NUM_AGENTS,
} from "@/lib/engine/physarum";
import { PHYSARUM } from "@/lib/engine/dispatch-physarum";
import { useEngineStore } from "@/lib/engine/store";
import { useAudioBindings } from "@/lib/engine/use-audio-bindings";
import type { DeviceTier } from "@/lib/engine/responsive";

const PHEROMONE_SIZE = 1024; // square pheromone field
const PLANE_W = 14;
const PLANE_H = 14;

function nextPow2(n: number): number {
  let p = 1;
  while (p < n) p *= 2;
  return p;
}

/**
 * Build the initial agent buffer for upload to the GPU.
 * RGBA32F: (x, y, heading, agentSeed)
 */
function buildAgentBuffer(
  seed: string,
  count: number,
  width: number,
  height: number,
  textureSize: number,
): Float32Array {
  const rng = mulberry32(hashSeed(seed));
  const data = new Float32Array(textureSize * textureSize * 4);
  for (let i = 0; i < count; i++) {
    const i4 = i * 4;
    data[i4 + 0] = rng() * width;
    data[i4 + 1] = rng() * height;
    data[i4 + 2] = rng() * Math.PI * 2;
    data[i4 + 3] = rng(); // per-agent seed in [0,1)
  }
  // Pad remainder of texture with deterministic "dead" agents so the unused
  // pixels don't sample garbage.
  const seed32 = hashSeed(seed) >>> 0;
  for (let i = count; i < textureSize * textureSize; i++) {
    const i4 = i * 4;
    data[i4 + 0] = 0;
    data[i4 + 1] = 0;
    data[i4 + 2] = 0;
    data[i4 + 3] = ((seed32 + i) >>> 0) / 4294967296;
  }
  return data;
}

/**
 * Upload a Float32Array buffer into an RGBA32F WebGLRenderTarget.
 * Uses a one-shot copy shader so the data lands in the FBO's color
 * attachment (DataTexture → FBO blit, same pattern as ParticleEngine).
 */
function uploadToTarget(
  renderer: THREE.WebGLRenderer,
  target: THREE.WebGLRenderTarget,
  data: Float32Array,
): void {
  const texture = new THREE.DataTexture(
    data,
    target.width,
    target.height,
    THREE.RGBAFormat,
    THREE.FloatType,
  );
  texture.needsUpdate = true;

  const scene = new THREE.Scene();
  const cam = new THREE.OrthographicCamera(-1, 1, 1, -1, 0, 1);
  const mat = new THREE.ShaderMaterial({
    uniforms: { u_tex: { value: texture } },
    vertexShader: /* glsl */ `
      varying vec2 v_uv;
      void main() { v_uv = uv; gl_Position = vec4(position, 1.0); }
    `,
    fragmentShader: /* glsl */ `
      uniform sampler2D u_tex;
      varying vec2 v_uv;
      void main() { gl_FragColor = texture2D(u_tex, v_uv); }
    `,
    depthTest: false,
    depthWrite: false,
  });
  const mesh = new THREE.Mesh(new THREE.PlaneGeometry(2, 2), mat);
  scene.add(mesh);

  const prev = renderer.getRenderTarget();
  renderer.setRenderTarget(target);
  renderer.render(scene, cam);
  renderer.setRenderTarget(prev);

  texture.dispose();
  mat.dispose();
  (mesh.geometry as THREE.BufferGeometry).dispose();
}

export function Physarum({
  seed,
  deviceTier = "desktop",
}: {
  seed: string;
  deviceTier?: DeviceTier | "low";
}) {
  const { gl } = useThree();

  const shaderGraph = useEngineStore((s) => s.shaderGraph);
  const palette = shaderGraph.palette;
  const paused = useEngineStore((s) => s.paused);
  const setSimTime = useEngineStore((s) => s.setSimTime);

  // ---------- Audio bindings ----------
  // The dispatch manifest binds:
  //   bass    → decay        (pheromone field retention per step; [0.8, 0.99])
  //   mid     → sensorDistance (how far the agent senses ahead)
  //   treble  → stepSize     (how far the agent moves per step)
  //   vocals  → diffuse      (3x3 gaussian blend coefficient; [0, 1])
  //
  // The hook's per-param `min`/`max` keeps decay in the physically-meaningful
  // range [0.8, 0.99] so audio modulation cannot push it into divergence
  // (decay >= 1 means pheromone grows without bound; decay <= 0 means the
  // field instantly evaporates, killing the network).
  const { computeModulatedParams } = useAudioBindings({
    bindings: PHYSARUM.audioBindings,
    configs: {
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
    },
  });

  const seedRef = useRef(seed);

  // Resolve agent count from device tier + dispatch default.
  const numAgents = useMemo(() => {
    if (deviceTier === "low" || deviceTier === "mobile") {
      return LOW_TIER_NUM_AGENTS;
    }
    return Number(PHYSARUM.defaultParams.numAgents) || DEFAULT_NUM_AGENTS;
  }, [deviceTier]);

  // The agent texture is square; size = nextPow2(ceil(sqrt(count))).
  const agentTexSize = useMemo(() => nextPow2(Math.ceil(Math.sqrt(numAgents))), [numAgents]);

  // Build initial agent buffer when seed/agent-count changes.
  const initialAgentBuffer = useMemo(
    () => buildAgentBuffer(seed, numAgents, PHEROMONE_SIZE, PHEROMONE_SIZE, agentTexSize),
    [seed, numAgents, agentTexSize],
  );

  // ---------- Framebuffers (built once per agentTexSize) ----------
  const framebuffers = useMemo(() => {
    const rtOptions: THREE.RenderTargetOptions = {
      type: THREE.FloatType,
      format: THREE.RGBAFormat,
      minFilter: THREE.NearestFilter,
      magFilter: THREE.NearestFilter,
      depthBuffer: false,
      stencilBuffer: false,
    };
    const agentA = new THREE.WebGLRenderTarget(agentTexSize, agentTexSize, rtOptions);
    const agentB = new THREE.WebGLRenderTarget(agentTexSize, agentTexSize, rtOptions);
    const pheromoneA = new THREE.WebGLRenderTarget(PHEROMONE_SIZE, PHEROMONE_SIZE, rtOptions);
    const pheromoneB = new THREE.WebGLRenderTarget(PHEROMONE_SIZE, PHEROMONE_SIZE, rtOptions);
    return { agentA, agentB, pheromoneA, pheromoneB };
  }, [agentTexSize]);

  // Ping-pong pointers
  const agents = useRef({
    read: framebuffers.agentA,
    write: framebuffers.agentB,
  });
  const pheromone = useRef({
    read: framebuffers.pheromoneA,
    write: framebuffers.pheromoneB,
  });

  // ---------- Shaders & meshes ----------
  const sim = useMemo(() => {
    const ortho = new THREE.OrthographicCamera(-1, 1, 1, -1, 0, 1);
    const scene = new THREE.Scene();
    const geom = new THREE.PlaneGeometry(2, 2);

    const computeMat = new THREE.ShaderMaterial({
      uniforms: {
        u_agentTexture: { value: null },
        u_pheromoneTex: { value: null },
        u_seed: { value: hashSeed(seed) },
        u_frame: { value: 0 },
        u_sensorAngle: {
          value: (Number(PHYSARUM.defaultParams.sensorAngle) * Math.PI) / 180,
        },
        u_sensorDistance: { value: Number(PHYSARUM.defaultParams.sensorDistance) },
        u_stepSize: { value: Number(PHYSARUM.defaultParams.stepSize) },
        u_turnRate: {
          value: (Number(PHYSARUM.defaultParams.turnRate) * Math.PI) / 180,
        },
        u_fieldWidth: { value: PHEROMONE_SIZE },
        u_fieldHeight: { value: PHEROMONE_SIZE },
        u_agentTexSize: { value: new THREE.Vector2(agentTexSize, agentTexSize) },
      },
      vertexShader: /* glsl */ `
        varying vec2 v_uv;
        void main() { v_uv = uv; gl_Position = vec4(position, 1.0); }
      `,
      fragmentShader: PHYSARUM_AGENT_COMPUTE_FRAGMENT,
      depthTest: false,
      depthWrite: false,
    });

    const depositMat = new THREE.ShaderMaterial({
      uniforms: {
        u_prevPheromone: { value: null },
        u_texSize: { value: new THREE.Vector2(PHEROMONE_SIZE, PHEROMONE_SIZE) },
        u_diffuse: { value: Number(PHYSARUM.defaultParams.diffuse) },
        u_decay: { value: Number(PHYSARUM.defaultParams.decay) },
      },
      vertexShader: /* glsl */ `
        varying vec2 v_uv;
        void main() { v_uv = uv; gl_Position = vec4(position, 1.0); }
      `,
      fragmentShader: PHYSARUM_DEPOSIT_FRAGMENT,
      depthTest: false,
      depthWrite: false,
    });

    const renderMat = new THREE.ShaderMaterial({
      uniforms: {
        u_pheromoneTex: { value: null },
        u_colorLow: { value: new THREE.Vector3(0.05, 0.04, 0.12) },
        u_colorHigh: { value: new THREE.Vector3(0.95, 0.30, 0.80) },
        u_intensity: { value: 1.0 },
        u_exposure: { value: 0.6 },
      },
      vertexShader: PHYSARUM_RENDER_VERTEX,
      fragmentShader: PHYSARUM_RENDER_FRAGMENT,
    });

    const computeMesh = new THREE.Mesh(geom, computeMat);
    const depositMesh = new THREE.Mesh(geom, depositMat);

    scene.add(computeMesh);
    scene.add(depositMesh);

    return {
      ortho,
      scene,
      computeMat,
      depositMat,
      renderMat,
      computeMesh,
      depositMesh,
    };
  }, [seed, agentTexSize]);

  // ---------- Splat (deposit) geometry/material for agents → pheromone ----------
  const splat = useMemo(() => {
    const indices = new Float32Array(numAgents);
    for (let i = 0; i < numAgents; i++) indices[i] = i;
    const geo = new THREE.BufferGeometry();
    geo.setAttribute("position", new THREE.BufferAttribute(new Float32Array(numAgents * 3), 3));
    geo.setAttribute("a_index", new THREE.BufferAttribute(indices, 1));
    geo.setDrawRange(0, numAgents);

    const mat = new THREE.ShaderMaterial({
      uniforms: {
        u_agentTexture: { value: null },
        u_agentTexSize: { value: new THREE.Vector2(agentTexSize, agentTexSize) },
        u_fieldSize: { value: PHEROMONE_SIZE },
        u_pointSize: { value: 2.0 },
        u_pixelRatio: {
          value: Math.min(typeof window !== "undefined" ? window.devicePixelRatio : 1, 2),
        },
      },
      vertexShader: PHYSARUM_DEPOSIT_POINT_VERTEX,
      fragmentShader: PHYSARUM_DEPOSIT_POINT_FRAGMENT,
      transparent: true,
      depthTest: false,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
    });

    const points = new THREE.Points(geo, mat);
    points.frustumCulled = false;
    return { geo, mat, points };
  }, [numAgents, agentTexSize]);

  // ---------- Render plane (3D plane geometry that displays the pheromone) ----------
  const renderMesh = useMemo(() => {
    const geom = new THREE.PlaneGeometry(PLANE_W, PLANE_H, 1, 1);
    const mesh = new THREE.Mesh(geom, sim.renderMat);
    mesh.frustumCulled = false;
    return { geom, mesh };
  }, [sim.renderMat]);

  // ---------- Mount: upload initial agent buffer to both ping-pong targets ----------
  useEffect(() => {
    uploadToTarget(gl, agents.current.read, initialAgentBuffer);
    uploadToTarget(gl, agents.current.write, initialAgentBuffer);
     
  }, [initialAgentBuffer, gl]);

  // ---------- React to seed changes (re-init from new seed) ----------
  useEffect(() => {
    if (seedRef.current !== seed) {
      const buf = buildAgentBuffer(seed, numAgents, PHEROMONE_SIZE, PHEROMONE_SIZE, agentTexSize);
      uploadToTarget(gl, agents.current.read, buf);
      uploadToTarget(gl, agents.current.write, buf);
      sim.computeMat.uniforms.u_seed.value = hashSeed(seed);
      sim.computeMat.uniforms.u_frame.value = 0;
      seedRef.current = seed;
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [seed, numAgents, agentTexSize, gl]);

  // ---------- Update palette colors when palette changes ----------
  useEffect(() => {
    const p = PALETTES[palette];
    sim.renderMat.uniforms.u_colorLow.value.set(...p.low);
    sim.renderMat.uniforms.u_colorHigh.value.set(...p.high);
  }, [palette, sim]);

  // ---------- Per-frame: compute → deposit → diffuse/decay ----------
  const frameCounter = useRef(0);
  useFrame(() => {
    if (paused) return;

    // 1. Agent compute pass — read agents.read, write agents.write
    sim.computeMat.uniforms.u_agentTexture.value = agents.current.read.texture;
    sim.computeMat.uniforms.u_pheromoneTex.value = pheromone.current.read.texture;
    sim.computeMat.uniforms.u_frame.value = frameCounter.current;
    sim.computeMesh.material = sim.computeMat;
    gl.setRenderTarget(agents.current.write);
    gl.render(sim.scene, sim.ortho);
    {
      const tmp = agents.current.read;
      agents.current.read = agents.current.write;
      agents.current.write = tmp;
    }

    // 2. Splat pheromone deposit from agents → pheromone (additive)
    splat.mat.uniforms.u_agentTexture.value = agents.current.read.texture;
    gl.setRenderTarget(pheromone.current.write);
    gl.render(splat.points, sim.ortho);
    {
      const tmp = pheromone.current.read;
      pheromone.current.read = pheromone.current.write;
      pheromone.current.write = tmp;
    }

    // 3. Diffuse + decay pass
    sim.depositMat.uniforms.u_prevPheromone.value = pheromone.current.read.texture;
    sim.depositMesh.material = sim.depositMat;
    gl.setRenderTarget(pheromone.current.write);
    gl.render(sim.scene, sim.ortho);
    {
      const tmp = pheromone.current.read;
      pheromone.current.read = pheromone.current.write;
      pheromone.current.write = tmp;
    }

    // 4. Audio modulation — driven by the dispatch manifest's audioBindings
    //    via useAudioBindings. The hook smooths each band toward its target
    //    with attack/release smoothing and clamps to the per-param safe range.
    const mod = computeModulatedParams();
    const p = mod.params;
    const bands = mod.bands;
    if (typeof p.sensorDistance === "number") {
      sim.computeMat.uniforms.u_sensorDistance.value = p.sensorDistance;
    }
    if (typeof p.stepSize === "number") {
      sim.computeMat.uniforms.u_stepSize.value = p.stepSize;
    }
    if (typeof p.decay === "number") {
      sim.depositMat.uniforms.u_decay.value = p.decay;
    }
    if (typeof p.diffuse === "number") {
      sim.depositMat.uniforms.u_diffuse.value = p.diffuse;
    }

    // 5. Update the visible render material with the current pheromone texture
    sim.renderMat.uniforms.u_pheromoneTex.value = pheromone.current.read.texture;
    sim.renderMat.uniforms.u_intensity.value =
      1.0 + bands.bass * 0.4 + bands.treble * 0.2;

    frameCounter.current++;
    setSimTime(frameCounter.current / 60);
  });

  // ---------- Cleanup ----------
  useEffect(() => {
    return () => {
      framebuffers.agentA.dispose();
      framebuffers.agentB.dispose();
      framebuffers.pheromoneA.dispose();
      framebuffers.pheromoneB.dispose();
      sim.computeMat.dispose();
      sim.depositMat.dispose();
      sim.renderMat.dispose();
      (sim.computeMesh.geometry as THREE.BufferGeometry).dispose();
      (sim.depositMesh.geometry as THREE.BufferGeometry).dispose();
      renderMesh.geom.dispose();
      splat.geo.dispose();
      splat.mat.dispose();
    };
  }, [framebuffers, sim, renderMesh, splat]);

  // Display the pheromone field on a 3D plane (like SandTraveler does).
  return <primitive object={renderMesh.mesh} />;
}