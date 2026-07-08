/**
 * Camera modes — pure functions of simTime → camera transform.
 *
 * Determinism: same simTime → same camera position across all devices.
 */

import * as THREE from "three";
import type { CameraMode } from "../types";

export type CameraState = {
  position: THREE.Vector3;
  target: THREE.Vector3;
};

const TWO_PI = Math.PI * 2;

// Simple deterministic noise for drift modes (Mulberry32-based, fixed seed)
function drift(t: number, axis: number, magnitude: number): number {
  // Slow perlin-like walk on t
  const x = Math.sin(t * 0.17 + axis * 31.0) * 0.5 +
            Math.sin(t * 0.31 + axis * 47.0) * 0.3 +
            Math.sin(t * 0.07 + axis * 13.0) * 0.2;
  return x * magnitude;
}

export function cameraStateFor(mode: CameraMode, simTime: number): CameraState {
  switch (mode) {
    case "drone": {
      // Slow forward dolly along a Lissajous curve
      const x = Math.sin(simTime * 0.06) * 4.5;
      const y = 1.0 + Math.sin(simTime * 0.04) * 0.8;
      const z = Math.cos(simTime * 0.05) * 4.5 + 2.0;
      return {
        position: new THREE.Vector3(x, y, z),
        target: new THREE.Vector3(0, 0, 0),
      };
    }
    case "orbit": {
      const r = 8.0;
      const angle = simTime * 0.05;
      return {
        position: new THREE.Vector3(Math.cos(angle) * r, 1.5, Math.sin(angle) * r),
        target: new THREE.Vector3(0, 0, 0),
      };
    }
    case "meditationDrift": {
      // Slow random-feeling walk, magnitude grows with simTime
      const growth = 1.0 + simTime * 0.01;
      return {
        position: new THREE.Vector3(
          drift(simTime, 1, 6 * growth),
          drift(simTime, 2, 3 * growth),
          drift(simTime, 3, 6 * growth),
        ),
        target: new THREE.Vector3(0, 0, 0),
      };
    }
    case "inside": {
      // Sit at origin; particles flow past camera
      return {
        position: new THREE.Vector3(0, 0, 0),
        target: new THREE.Vector3(
          drift(simTime, 1, 1),
          drift(simTime, 2, 0.5),
          -1,
        ),
      };
    }
    case "cinematic": {
      // Phase 2 — keyframe-based scripted camera. For Stage 3, use orbit.
      const r = 6.0;
      const angle = simTime * 0.08;
      return {
        position: new THREE.Vector3(Math.cos(angle) * r, 2.0, Math.sin(angle) * r),
        target: new THREE.Vector3(0, 0, 0),
      };
    }
    default: {
      const _exhaustive: never = mode;
      return {
        position: new THREE.Vector3(0, 0, 8),
        target: new THREE.Vector3(0, 0, 0),
      };
    }
  }
}

export const CAMERA_MODE_LABELS: Record<CameraMode, string> = {
  drone: "Floating Drone",
  orbit: "Slow Orbit",
  meditationDrift: "Meditation Drift",
  inside: "Inside Particle Cloud",
  cinematic: "Automatic Cinematic",
};

export const CAMERA_FOV = 55;
export const CAMERA_NEAR = 0.1;
export const CAMERA_FAR = 100;