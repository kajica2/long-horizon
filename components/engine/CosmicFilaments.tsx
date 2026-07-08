"use client";

import { useEffect, useMemo, useRef } from "react";
import { useFrame, useThree } from "@react-three/fiber";
import * as THREE from "three";
import { LineSegments2 } from "three/examples/jsm/lines/LineSegments2.js";
import { LineSegmentsGeometry } from "three/examples/jsm/lines/LineSegmentsGeometry.js";
import { LineMaterial } from "three/examples/jsm/lines/LineMaterial.js";
import { generateFilamentSegments, type FilamentConfig } from "@/lib/engine/filaments";
import { useEngineStore } from "@/lib/engine/store";
import type { PaletteName } from "@/lib/types";

/**
 * Cosmic Filaments Living System.
 *
 * CPU traces filament curves once (deterministic from seed + params).
 * Renders all curves as a single LineSegments2 — one draw call,
 * one buffer, the accumulation creates the etched pen-plotter aesthetic.
 *
 * Animation comes from the camera rig, not from per-frame compute.
 * This is the "polaroid" mode — same seed = same artwork.
 */

const PALETTE_COLORS: Record<PaletteName, [number, number, number]> = {
  aurora: [0.61, 0.40, 0.95],  // violet
  ember:  [0.95, 0.50, 0.10],   // warm orange
  tide:   [0.05, 0.60, 0.70],   // cyan
  ink:    [0.78, 0.82, 0.86],   // cool light grey
  bone:   [0.90, 0.88, 0.84],   // warm white
  moss:   [0.20, 0.50, 0.20],   // dark green
};

const FILAMENT_DEFAULTS = {
  count: 3500,
  stepsPerCurve: 80,
  spawnRadius: 7,
  fieldStrength: 1.4,
  noiseScale: 0.5,
  drag: 0.05,
  lineWidth: 1.2,
  lineOpacity: 0.55,
};

export function CosmicFilaments({
  seed,
  planetaryChartIntensity,
  planetaryMoonPhase,
}: {
  seed: string;
  planetaryChartIntensity?: number;
  planetaryMoonPhase?: number;
}) {
  const { size, gl } = useThree();
  const shaderGraph = useEngineStore((s) => s.shaderGraph);

  // Build segments once per seed + parameter combination
  const params = shaderGraph.params;
  const filamentCfg: FilamentConfig = {
    seed,
    count: Number(params.particleCount) || FILAMENT_DEFAULTS.count,
    stepsPerCurve: FILAMENT_DEFAULTS.stepsPerCurve,
    spawnRadius: Number(params.spawnRadius) || FILAMENT_DEFAULTS.spawnRadius,
    fieldStrength: Number(params.fieldStrength) || FILAMENT_DEFAULTS.fieldStrength,
    noiseScale: Number(params.noiseScale) || FILAMENT_DEFAULTS.noiseScale,
    drag: Number(params.drag) || FILAMENT_DEFAULTS.drag,
    chartIntensity: planetaryChartIntensity,
    moonPhase: planetaryMoonPhase,
  };

  const positions = useMemo(() => {
    try {
      return generateFilamentSegments(filamentCfg);
    } catch (err) {
      console.error("[CosmicFilaments] generation failed:", err);
      return new Float32Array(0);
    }
  }, [
    seed,
    filamentCfg.count,
    filamentCfg.stepsPerCurve,
    filamentCfg.spawnRadius,
    filamentCfg.fieldStrength,
    filamentCfg.noiseScale,
    filamentCfg.drag,
    planetaryChartIntensity,
    planetaryMoonPhase,
  ]);

  // Build geometry once
  const geometry = useMemo(() => {
    const geo = new LineSegmentsGeometry();
    if (positions.length > 0) {
      geo.setPositions(positions);
    }
    return geo;
  }, [positions]);

  // Build material — color from palette, additive blending
  const material = useMemo(() => {
    const [r, g, b] = PALETTE_COLORS[shaderGraph.palette] || PALETTE_COLORS.aurora;
    const mat = new LineMaterial({
      color: new THREE.Color(r, g, b),
      linewidth: Number(params.pointSize) || FILAMENT_DEFAULTS.lineWidth,
      transparent: true,
      opacity: FILAMENT_DEFAULTS.lineOpacity,
      blending: THREE.AdditiveBlending,
      depthWrite: false,
      worldUnits: false,
    });
    mat.resolution.set(window.innerWidth, window.innerHeight);
    return mat;
  }, [shaderGraph.palette, params.pointSize]);

  // Build the LineSegments2 mesh
  const lineRef = useRef<LineSegments2 | null>(null);
  if (lineRef.current === null && geometry) {
    const line = new LineSegments2(geometry, material);
    line.frustumCulled = false;
    line.computeLineDistances();
    lineRef.current = line;
  }

  // Update resolution on resize (LineMaterial needs to know pixel size)
  useEffect(() => {
    material.resolution.set(size.width, size.height);
  }, [size.width, size.height, material]);

  // Cleanup
  useEffect(() => {
    return () => {
      geometry.dispose();
      material.dispose();
      lineRef.current = null;
    };
  }, [geometry, material]);

  if (!lineRef.current) return null;

  return <primitive object={lineRef.current} />;
}