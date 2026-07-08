/**
 * Engine state store (Zustand).
 *
 * UI controls + simulation state shared between R3F components and overlay UI.
 */

import { create } from "zustand";
import type { ShaderGraph } from "../types";

export type EngineState = {
  paused: boolean;
  simTime: number;
  shaderGraph: ShaderGraph;

  // Audio modulation (Stage 5 wires real values; Stage 3 leaves at 0)
  audioBass: number;
  audioMid: number;
  audioTreble: number;

  // Planetary modulation (Stage 3a — passed to engines)
  planetaryChartIntensity: number;
  planetaryMoonPhase: number;

  // Live mode (Stage 5 — audio reactivity)
  liveMode: boolean;
  // Onset pulse (Stage 5b — fed from analyser, used for bloom flash)
  audioOnset: number;

  // Actions
  setPaused: (paused: boolean) => void;
  togglePaused: () => void;
  setSimTime: (t: number) => void;
  setShaderGraph: (g: ShaderGraph) => void;
  updateParam: (key: string, value: number) => void;
  setPalette: (palette: ShaderGraph["palette"]) => void;
  setCameraMode: (mode: ShaderGraph["camera"]) => void;
  setAudioModulation: (bass: number, mid: number, treble: number) => void;
  setAudioBands: (bass: number, mid: number, treble: number, onset: number) => void;
  setAudioBinding: (band: "bass" | "mid" | "treble" | "vocals", target: string) => void;
  setVisualDNA: (deltas: Partial<ShaderGraph["params"]>, palette: ShaderGraph["palette"]) => void;
  resetParams: (group: "physics" | "visual" | "audio" | "all") => void;
  setPlanetaryModulation: (intensity: number, moonPhase: number) => void;
  setLiveMode: (on: boolean) => void;
};

export const useEngineStore = create<EngineState>((set) => ({
  paused: false,
  simTime: 0,
  shaderGraph: {
    version: 1,
    system: "cosmicFilaments",
    params: {
      particleCount: 3500,
      noiseScale: 0.5,
      fieldStrength: 1.4,
      drag: 0.05,
      spawnRadius: 7.0,
      maxAge: 12.0,
      pointSize: 1.2,
    },
    audioBindings: {
      bass: "fieldStrength",
      mid: "drag",
      treble: "noiseScale",
      vocals: "bloom",
    },
    palette: "ink",
    camera: "meditationDrift",
    postFx: {
      bloom: 0.8,
      chromaticAberration: 0.002,
      filmGrain: 0.05,
      feedback: 0.05,
    },
  },
  audioBass: 0,
  audioMid: 0,
  audioTreble: 0,
  audioOnset: 0,
  planetaryChartIntensity: 0.5,
  planetaryMoonPhase: 0.5,
  liveMode: false,

  setPaused: (paused) => set({ paused }),
  togglePaused: () => set((s) => ({ paused: !s.paused })),
  setSimTime: (simTime) => set({ simTime }),
  setShaderGraph: (g) => set({ shaderGraph: g }),
  updateParam: (key, value) =>
    set((s) => ({
      shaderGraph: {
        ...s.shaderGraph,
        params: { ...s.shaderGraph.params, [key]: value },
      },
    })),
  setPalette: (palette) =>
    set((s) => ({ shaderGraph: { ...s.shaderGraph, palette } })),
  setCameraMode: (mode) =>
    set((s) => ({ shaderGraph: { ...s.shaderGraph, camera: mode } })),
  setAudioModulation: (bass, mid, treble) =>
    set({ audioBass: bass, audioMid: mid, audioTreble: treble }),
  setVisualDNA: (deltas, palette) =>
    set((s) => ({
      shaderGraph: {
        ...s.shaderGraph,
        params: { ...s.shaderGraph.params, ...(deltas as Record<string, number | string | boolean>) },
        palette,
      },
    })),
  setAudioBands: (bass, mid, treble, onset) =>
    set({ audioBass: bass, audioMid: mid, audioTreble: treble, audioOnset: onset }),
  setAudioBinding: (band, target) =>
    set((s) => ({
      shaderGraph: {
        ...s.shaderGraph,
        audioBindings: { ...s.shaderGraph.audioBindings, [band]: target },
      },
    })),
  resetParams: (group) => {
    const sg = useEngineStore.getState().shaderGraph;
    const system = sg.system;
    if (system === "flowFieldMeditation") {
      const defs = {
        physics: { particleCount: 250_000, noiseScale: 0.6, fieldStrength: 1.0, drag: 0.08, spawnRadius: 8.0, maxAge: 12.0 },
        visual:  { pointSize: 1.4 },
        all: null,
      } as const;
      const target = group === "all"
        ? { ...defs.physics, ...defs.visual }
        : defs[group as "physics" | "visual"];
      if (!target) return;
      set((s) => ({
        shaderGraph: {
          ...s.shaderGraph,
          params: { ...s.shaderGraph.params, ...target },
        },
      }));
    } else if (system === "cosmicFilaments") {
      const defs = {
        particleCount: 30000, noiseScale: 0.5, fieldStrength: 1.4,
        drag: 0.05, spawnRadius: 7, pointSize: 1.2,
      };
      set((s) => ({
        shaderGraph: { ...s.shaderGraph, params: { ...s.shaderGraph.params, ...defs } },
      }));
    }
  },
  setPlanetaryModulation: (intensity, moonPhase) =>
    set({ planetaryChartIntensity: intensity, planetaryMoonPhase: moonPhase }),
  setLiveMode: (liveMode) => set({ liveMode }),
}));