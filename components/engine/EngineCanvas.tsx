"use client";

import { Canvas } from "@react-three/fiber";
import { Suspense, useEffect } from "react";
import { ParticleSystem } from "./ParticleSystem";
import { CosmicFilaments } from "./CosmicFilaments";
import { SandTraveler } from "./SandTraveler";
import { DeJongAttractor } from "./DeJongAttractor";
import { BirthChartScene } from "./BirthChartScene";
import { BackgroundLayer } from "./BackgroundLayer";
import { CameraRig } from "./CameraRig";
import { PostFX } from "./PostFX";
import { useEngineStore } from "@/lib/engine/store";
import type { BirthChart } from "@/lib/types";
import type { DeviceTier } from "@/lib/engine/responsive";

/**
 * EngineCanvas — the R3F Canvas hosting all engine layers.
 *
 * Dispatches to the right Living System based on `shaderGraph.system`:
 *   - "flowFieldMeditation" → ParticleSystem (250k points)
 *   - "cosmicFilaments"     → CosmicFilaments (curve accumulation)
 *   - "sandTraveler"        → SandTraveler (Tarbell port, 2D canvas)
 *   - "deJongAttractor"     → DeJongAttractor (Tarbell port, 2D canvas)
 *   - "birthChart"          → BirthChartScene (3D natal chart)
 */
export function EngineCanvas({
  seed,
  planetaryChartIntensity,
  planetaryMoonPhase,
  birthChart,
  deviceTier,
  reducedMotion,
}: {
  seed: string;
  planetaryChartIntensity?: number;
  planetaryMoonPhase?: number;
  birthChart?: BirthChart;
  deviceTier?: DeviceTier;
  reducedMotion?: boolean;
}) {
  const system = useEngineStore((s) => s.shaderGraph.system);

  return (
    <Canvas
      camera={{ position: [0, 7, 9], fov: 50 }}
      dpr={[1, 2]}
      gl={{
        antialias: true,
        alpha: false,
        powerPreference: "high-performance",
        preserveDrawingBuffer: false,
      }}
      style={{
        position: "absolute",
        inset: 0,
        background: "#050507",
      }}
    >
      <Suspense fallback={null}>
        <BackgroundLayer />
        {system === "cosmicFilaments" ? (
          <CosmicFilaments
            seed={seed}
            planetaryChartIntensity={planetaryChartIntensity}
            planetaryMoonPhase={planetaryMoonPhase}
          />
        ) : system === "sandTraveler" ? (
          <SandTraveler seed={seed} />
        ) : system === "deJongAttractor" ? (
          <DeJongAttractor seed={seed} />
        ) : system === "birthChart" ? (
          birthChart ? (
            <BirthChartScene chart={birthChart} seed={seed} />
          ) : null
        ) : (
          <ParticleSystem seed={seed} deviceTier={deviceTier} />
        )}
        {system !== "birthChart" && <CameraRig seed={seed} />}
        <PostFX />
      </Suspense>
    </Canvas>
  );
}
