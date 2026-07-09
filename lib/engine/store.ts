/**
 * Engine state store (Zustand).
 *
 * UI controls + simulation state shared between R3F components and overlay UI.
 */

import { create } from "zustand";
import type { ShaderGraph, VisualDNA } from "../types";

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

  // Visual DNA (action 13 — image-driven genome)
  visualDNA: VisualDNA | null;
  visualInfluence: number; // [0, 1] master slider; scales the visual-DNA-driven deltas
  visualBaselineParams: Record<string, number> | null; // params before DNA was applied
  visualDeltaMagnitudes: Record<string, number> | null; // |param_after - baseline| per DNA-bound key

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
  setVisualDNA: (deltas: Partial<ShaderGraph["params"]>, palette: ShaderGraph["palette"], dna?: VisualDNA | null) => void;
  setVisualInfluence: (v: number) => void;
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
  visualDNA: null,
  visualInfluence: 0.7,
  visualBaselineParams: null,
  visualDeltaMagnitudes: null,
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
  setVisualDNA: (deltas, palette, dna) =>
    set((s) => {
      const appliedDeltas = deltas as Record<string, number>;
      // Snapshot the current param values BEFORE we override with the DNA.
      // These are the "baseline" — the influence slider scales the deltas
      // off this baseline rather than re-deriving each time.
      const baseline: Record<string, number> = {};
      const magnitudes: Record<string, number> = {};
      for (const k of Object.keys(appliedDeltas)) {
        const cur = s.shaderGraph.params[k];
        const next = appliedDeltas[k];
        if (typeof cur === "number") baseline[k] = cur;
        if (typeof next === "number") magnitudes[k] = next - (typeof cur === "number" ? cur : next);
      }
      return {
        shaderGraph: {
          ...s.shaderGraph,
          params: { ...s.shaderGraph.params, ...appliedDeltas },
          palette,
        },
        visualDNA: dna ?? s.visualDNA,
        visualBaselineParams: baseline,
        visualDeltaMagnitudes: magnitudes,
      };
    }),
  setVisualInfluence: (v) =>
    set((s) => {
      const baseline = s.visualBaselineParams;
      const mags = s.visualDeltaMagnitudes;
      if (!baseline || !mags) return { visualInfluence: v };
      // Blend: param_at_influence = baseline + delta * influence
      const blended: Record<string, number> = {};
      for (const k of Object.keys(baseline)) {
        blended[k] = baseline[k] + (mags[k] ?? 0) * v;
      }
      return {
        visualInfluence: v,
        shaderGraph: {
          ...s.shaderGraph,
          params: { ...s.shaderGraph.params, ...blended },
        },
      };
    }),
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
    } else if (system === "reactionDiffusion") {
      const defs = {
        feedRate: 0.0367, killRate: 0.0649, du: 1.0, dv: 0.5,
        dt: 1.0, stepsPerFrame: 5,
      };
      set((s) => ({
        shaderGraph: { ...s.shaderGraph, params: { ...s.shaderGraph.params, ...defs } },
      }));
    } else if (system === "lorenzAttractor") {
      const defs = {
        sigma: 10.0, rho: 28.0, beta: 8.0 / 3.0, dt: 0.005,
        trailLength: 8000, lineWidth: 1.2, fadeTail: 0.85,
      };
      set((s) => ({
        shaderGraph: { ...s.shaderGraph, params: { ...s.shaderGraph.params, ...defs } },
      }));
    } else if (system === "physarum") {
      const defs = {
        numAgents: 65536, sensorAngle: 22.5, sensorDistance: 9.0,
        stepSize: 1.0, turnRate: 45.0, decay: 0.92, diffuse: 0.5,
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