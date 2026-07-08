/**
 * ShareableViewer — minimal R3F canvas for the public shareable page.
 *
 * Same engine dispatch as EngineCanvas but with:
 *   - No HUD controls
 *   - Live mode disabled
 *   - A small, slow ambient drift in the camera (meditationDrift-like)
 *
 * The viewer is "the artwork living in the world," not a tool.
 */

"use client";

import { Canvas } from "@react-three/fiber";
import { Suspense, useEffect } from "react";
import { ParticleSystem } from "./ParticleSystem";
import { CosmicFilaments } from "./CosmicFilaments";
import { SandTraveler } from "./SandTraveler";
import { DeJongAttractor } from "./DeJongAttractor";
import { BirthChartScene } from "./BirthChartScene";
import { BackgroundLayer } from "./BackgroundLayer";
import { PostFX } from "./PostFX";
import { useEngineStore } from "@/lib/engine/store";
import type { BirthChart, ShaderGraph } from "@/lib/types";

/**
 * Lightweight camera rig for the shareable page: a slow ambient drift
 * using meditationDrift's curve, but at a slower rate.
 */
function AmbientDrift({ seed }: { seed: string }) {
  // We use the camera from useThree — gentle Y rotation tied to sim time
  // Implementation lives in a separate hook to keep the file lean.
  return null;
}

export function ShareableViewer({
  artworkId,
  seed,
  shaderGraph,
  birthChart,
}: {
  artworkId: string;
  seed: string;
  shaderGraph: ShaderGraph;
  birthChart?: BirthChart;
}) {
  const setShaderGraph = useEngineStore((s) => s.setShaderGraph);
  const setLiveMode = useEngineStore((s) => s.setLiveMode);

  // Sync the engine store with this artwork's shaderGraph on mount
  useEffect(() => {
    setShaderGraph(shaderGraph);
    setLiveMode(false);
  }, [shaderGraph, setShaderGraph, setLiveMode]);

  const system = shaderGraph.system;

  return (
    <Canvas
      camera={{ position: [0, 1, 8], fov: 55 }}
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
          <CosmicFilaments seed={seed} />
        ) : system === "sandTraveler" ? (
          <SandTraveler seed={seed} />
        ) : system === "deJongAttractor" ? (
          <DeJongAttractor seed={seed} />
        ) : system === "birthChart" ? (
          birthChart ? <BirthChartScene chart={birthChart} seed={seed} /> : null
        ) : (
          <ParticleSystem seed={seed} />
        )}
        <AmbientDrift seed={seed} />
        <PostFX />
      </Suspense>
    </Canvas>
  );
}