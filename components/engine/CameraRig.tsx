"use client";

import { useEffect, useRef } from "react";
import { useFrame, useThree } from "@react-three/fiber";
import * as THREE from "three";
import { cameraStateFor, CAMERA_FOV, CAMERA_NEAR, CAMERA_FAR } from "@/lib/engine/camera-modes";
import { useEngineStore } from "@/lib/engine/store";

/**
 * CameraRig — applies the camera state derived from simTime + camera mode.
 *
 * Updates every frame to track the deterministic camera transform.
 */
export function CameraRig({ seed: _seed }: { seed: string }) {
  const { camera } = useThree();
  const cameraMode = useEngineStore((s) => s.shaderGraph.camera);
  const simTime = useEngineStore((s) => s.simTime);
  const paused = useEngineStore((s) => s.paused);

  // Configure the camera once
  useEffect(() => {
    if (camera instanceof THREE.PerspectiveCamera) {
      camera.fov = CAMERA_FOV;
      camera.near = CAMERA_NEAR;
      camera.far = CAMERA_FAR;
      camera.updateProjectionMatrix();
    }
  }, [camera]);

  // Apply camera state when mode or simTime changes
  useEffect(() => {
    const state = cameraStateFor(cameraMode, simTime);
    camera.position.copy(state.position);
    camera.lookAt(state.target);
  }, [cameraMode, simTime, camera]);

  // Keep updating every frame even when paused (for visual continuity)
  // so that if we ever expose a "scrub" timeline, it Just Works.
  const lastSimRef = useRef(simTime);
  useFrame(() => {
    if (paused) return;
    if (simTime === lastSimRef.current) return;
    lastSimRef.current = simTime;
    const state = cameraStateFor(cameraMode, simTime);
    camera.position.copy(state.position);
    camera.lookAt(state.target);
  });

  return null;
}