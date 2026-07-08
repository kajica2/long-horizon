/**
 * GPGPU particle manager — owns the position/velocity textures and runs the
 * compute pass on a fixed simulation clock (60Hz) independent of render FPS.
 *
 * Same seed → identical initial buffer → identical first frame → identical evolution.
 */

import * as THREE from "three";
import { PARTICLE_COMPUTE_FRAGMENT } from "./shaders/particle-compute";
import { hashSeed, mulberry32, rngUint32 } from "../seed";

export type ParticleEngineConfig = {
  seed: string;             // 32-char hex
  particleCount: number;
  spawnRadius: number;
  maxAge: number;
  fieldStrength: number;
  noiseScale: number;
  drag: number;
  fixedDt?: number;         // default 1/60
  textureSize?: number;     // default: smallest power-of-2 square that fits
};

export class ParticleEngine {
  readonly count: number;
  readonly textureSize: number;
  readonly fixedDt: number;

  private renderer: THREE.WebGLRenderer;
  private scene: THREE.Scene;
  private camera: THREE.OrthographicCamera;
  private mesh: THREE.Mesh;

  // Ping-pong targets
  private positionA: THREE.WebGLRenderTarget;
  private positionB: THREE.WebGLRenderTarget;
  private velocityA: THREE.WebGLRenderTarget;
  private velocityB: THREE.WebGLRenderTarget;
  private readPosition: THREE.WebGLRenderTarget;
  private readVelocity: THREE.WebGLRenderTarget;
  private writePosition: THREE.WebGLRenderTarget;
  private writeVelocity: THREE.WebGLRenderTarget;

  private positionMaterial: THREE.ShaderMaterial;
  private velocityMaterial: THREE.ShaderMaterial;
  private positionGeometry: THREE.PlaneGeometry;
  private velocityGeometry: THREE.PlaneGeometry;

  private simTime = 0;
  private audioBass = 0;
  private audioMid = 0;
  private audioTreble = 0;
  private config: ParticleEngineConfig;

  constructor(renderer: THREE.WebGLRenderer, config: ParticleEngineConfig) {
    this.renderer = renderer;
    this.config = config;
    this.count = config.particleCount;
    this.fixedDt = config.fixedDt ?? 1 / 60;
    this.textureSize = config.textureSize ?? nextPow2(Math.ceil(Math.sqrt(this.count)));

    // Verify FloatTexture support (mandatory for position/velocity)
    const gl = renderer.getContext();
    const hasFloat = !!gl.getExtension("OES_texture_float");
    if (!hasFloat) {
      throw new Error("WebGL OES_texture_float not available — GPGPU particles require float textures.");
    }

    // Render targets — RGBA float, no depth/stencil
    const rtOptions: THREE.RenderTargetOptions = {
      type: THREE.FloatType,
      format: THREE.RGBAFormat,
      minFilter: THREE.NearestFilter,
      magFilter: THREE.NearestFilter,
      depthBuffer: false,
      stencilBuffer: false,
    };
    this.positionA = new THREE.WebGLRenderTarget(this.textureSize, this.textureSize, rtOptions);
    this.positionB = new THREE.WebGLRenderTarget(this.textureSize, this.textureSize, rtOptions);
    this.velocityA = new THREE.WebGLRenderTarget(this.textureSize, this.textureSize, rtOptions);
    this.velocityB = new THREE.WebGLRenderTarget(this.textureSize, this.textureSize, rtOptions);
    this.readPosition = this.positionA;
    this.writePosition = this.positionB;
    this.readVelocity = this.velocityA;
    this.writeVelocity = this.velocityB;

    // Initialize buffers from the seed
    const { positions, velocities } = initBuffers(config.seed, this.count, config.spawnRadius, this.textureSize);
    uploadInitialData(this.renderer, this.positionA, positions);
    uploadInitialData(this.renderer, this.positionB, positions); // both targets start equal
    uploadInitialData(this.renderer, this.velocityA, velocities);
    uploadInitialData(this.renderer, this.velocityB, velocities);

    // Fullscreen quad scene for the compute pass
    this.scene = new THREE.Scene();
    this.camera = new THREE.OrthographicCamera(-1, 1, 1, -1, 0, 1);

    this.positionGeometry = new THREE.PlaneGeometry(2, 2);
    this.velocityGeometry = new THREE.PlaneGeometry(2, 2);

    // Position compute material
    this.positionMaterial = new THREE.ShaderMaterial({
      uniforms: {
        u_positionTexture: { value: null },
        u_velocityTexture: { value: null },
        u_seed: { value: hashSeed(config.seed) },
        u_simTime: { value: 0 },
        u_fieldStrength: { value: config.fieldStrength },
        u_noiseScale: { value: config.noiseScale },
        u_drag: { value: config.drag },
        u_spawnRadius: { value: config.spawnRadius },
        u_maxAge: { value: config.maxAge },
        u_fixedDt: { value: this.fixedDt },
        u_audioBass: { value: 0 },
        u_audioMid: { value: 0 },
        u_audioTreble: { value: 0 },
        u_textureSize: { value: new THREE.Vector2(this.textureSize, this.textureSize) },
      },
      vertexShader: /* glsl */ `
        varying vec2 v_uv;
        void main() {
          v_uv = uv;
          gl_Position = vec4(position, 1.0);
        }
      `,
      fragmentShader: PARTICLE_COMPUTE_FRAGMENT,
      depthTest: false,
      depthWrite: false,
    });

    // Velocity compute material — currently a passthrough; the position
    // compute pass handles velocity updates implicitly via force/drag.
    // (Keeping the slot for future explicit velocity compute.)
    this.velocityMaterial = new THREE.ShaderMaterial({
      uniforms: {},
      vertexShader: this.positionMaterial.vertexShader,
      fragmentShader: /* glsl */ `
        void main() { gl_FragColor = vec4(0.0); }
      `,
      depthTest: false,
      depthWrite: false,
    });

    this.mesh = new THREE.Mesh(this.positionGeometry, this.positionMaterial);
  }

  /**
   * Run the simulation forward by `renderDt` seconds of wall-clock time.
   * Internally steps at fixedDt — multiple steps per call if needed to catch up.
   */
  step(renderDt: number): void {
    const stepsToRun = Math.min(8, Math.max(1, Math.floor(renderDt / this.fixedDt)));
    for (let i = 0; i < stepsToRun; i++) {
      this.simTime += this.fixedDt;
      this.runComputePass();
    }
  }

  setAudioModulation(bass: number, mid: number, treble: number): void {
    this.audioBass = bass;
    this.audioMid = mid;
    this.audioTreble = treble;
    this.positionMaterial.uniforms.u_audioBass.value = bass;
    this.positionMaterial.uniforms.u_audioMid.value = mid;
    this.positionMaterial.uniforms.u_audioTreble.value = treble;
  }

  setSeed(seed: string): void {
    this.config.seed = seed;
    this.positionMaterial.uniforms.u_seed.value = hashSeed(seed);
    // Re-initialize buffers with new seed
    const { positions, velocities } = initBuffers(seed, this.count, this.config.spawnRadius, this.textureSize);
    uploadInitialData(this.renderer, this.readPosition, positions);
    uploadInitialData(this.renderer, this.readVelocity, velocities);
    this.simTime = 0;
  }

  reset(): void {
    this.simTime = 0;
    const { positions, velocities } = initBuffers(this.config.seed, this.count, this.config.spawnRadius, this.textureSize);
    uploadInitialData(this.renderer, this.readPosition, positions);
    uploadInitialData(this.renderer, this.readVelocity, velocities);
  }

  getSimTime(): number {
    return this.simTime;
  }

  /** The texture the render shader should sample. */
  getPositionTexture(): THREE.Texture {
    return this.readPosition.texture;
  }

  dispose(): void {
    this.positionA.dispose();
    this.positionB.dispose();
    this.velocityA.dispose();
    this.velocityB.dispose();
    this.positionMaterial.dispose();
    this.velocityMaterial.dispose();
    this.positionGeometry.dispose();
    this.velocityGeometry.dispose();
  }

  private runComputePass(): void {
    const prevTarget = this.renderer.getRenderTarget();

    this.positionMaterial.uniforms.u_positionTexture.value = this.readPosition.texture;
    this.positionMaterial.uniforms.u_velocityTexture.value = this.readVelocity.texture;
    this.positionMaterial.uniforms.u_simTime.value = this.simTime;
    this.mesh.material = this.positionMaterial;

    this.renderer.setRenderTarget(this.writePosition);
    this.renderer.render(this.scene, this.camera);

    // Ping-pong: write becomes read for next frame
    const tmp = this.readPosition;
    this.readPosition = this.writePosition;
    this.writePosition = tmp;

    this.renderer.setRenderTarget(prevTarget);
  }
}

// ============================================================
// Helpers
// ============================================================

function nextPow2(n: number): number {
  let p = 1;
  while (p < n) p *= 2;
  return p;
}

function initBuffers(
  seed: string,
  count: number,
  spawnRadius: number,
  textureSize: number,
): { positions: Float32Array; velocities: Float32Array } {
  // Pack as RGBA: position.xyz + age in w; velocity.xyz + per-particle seed in w.
  const positions = new Float32Array(textureSize * textureSize * 4);
  const velocities = new Float32Array(textureSize * textureSize * 4);

  const rng = mulberry32(hashSeed(seed));
  const seed32 = hashSeed(seed);

  for (let i = 0; i < count; i++) {
    // Uniform sphere distribution (cube root for uniform volume)
    const u = rng();
    const v = rng();
    const theta = 2 * Math.PI * u;
    const phi = Math.acos(2 * v - 1);
    const r = Math.cbrt(rng()) * spawnRadius;

    const px = r * Math.sin(phi) * Math.cos(theta);
    const py = r * Math.sin(phi) * Math.sin(theta);
    const pz = r * Math.cos(phi);

    const i4 = i * 4;
    positions[i4 + 0] = px;
    positions[i4 + 1] = py;
    positions[i4 + 2] = pz;
    positions[i4 + 3] = 0; // age starts at 0

    // Velocity starts at zero
    velocities[i4 + 0] = 0;
    velocities[i4 + 1] = 0;
    velocities[i4 + 2] = 0;
    // Per-particle seed for noise variation (must be reproducible)
    velocities[i4 + 3] = rngUint32(rng) / 4294967296;
  }

  // The remainder of the texture (count → textureSize^2) gets a deterministic
  // "dead" particle placed at the origin so the unused slots don't sample garbage.
  const deadSeed32 = (seed32 ^ 0x9e3779b9) >>> 0;
  for (let i = count; i < textureSize * textureSize; i++) {
    const i4 = i * 4;
    positions[i4 + 0] = 0;
    positions[i4 + 1] = 0;
    positions[i4 + 2] = 0;
    positions[i4 + 3] = 100; // already old, will respawn quickly
    velocities[i4 + 0] = 0;
    velocities[i4 + 1] = 0;
    velocities[i4 + 2] = 0;
    velocities[i4 + 3] = (deadSeed32 + i) >>> 0;
  }

  return { positions, velocities };
}

function uploadInitialData(
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
  // We don't actually use this DataTexture directly — we copy it into the RT.
  // The simplest portable approach: use copyFramebufferToTexture.
  const prevTarget = renderer.getRenderTarget();
  const prevClear = renderer.getClearColor(new THREE.Color());

  // Use a no-op shader pass that just writes the DataTexture to the FBO.
  const copyScene = new THREE.Scene();
  const copyCamera = new THREE.OrthographicCamera(-1, 1, 1, -1, 0, 1);
  const copyMat = new THREE.ShaderMaterial({
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
  const copyMesh = new THREE.Mesh(new THREE.PlaneGeometry(2, 2), copyMat);
  copyScene.add(copyMesh);

  renderer.setRenderTarget(target);
  renderer.render(copyScene, copyCamera);
  renderer.setRenderTarget(prevTarget);

  texture.dispose();
  copyMat.dispose();
  (copyMesh.geometry as THREE.BufferGeometry).dispose();
}