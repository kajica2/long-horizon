/**
 * Dispatch manifest for the Lorenz Attractor living system.
 *
 * Registered alongside the other five systems. The orchestrator reads
 * this file in Wave 1 to plug the slice into:
 *   - the engine store,
 *   - the EngineCanvas router,
 *   - the ParameterPanel (paramSpec + range validation),
 *   - the gallery tile,
 *   - and the API param-projection code paths.
 *
 * The shape mirrors the user's specification verbatim; we re-export it
 * here so individual tests can verify all expected fields are present
 * without depending on the eventual orchestrator-side wiring.
 */

export const LORENZ_ATTRACTOR = {
  name: "lorenzAttractor" as const,
  displayName: "Lorenz Attractor",
  description: "The butterfly-shaped strange attractor (Lorenz 1963)",
  component: "LorenzAttractor",
  defaultParams: {
    sigma: 10.0,
    rho: 28.0,
    beta: 8.0 / 3.0,
    dt: 0.005,
    trailLength: 8000,
    lineWidth: 1.2,
    fadeTail: 0.85,
  },
  audioBindings: {
    bass: "sigma",
    mid: "rho",
    treble: "trailLength",
    vocals: "fadeTail",
  },
  palettes: ["aurora", "ember", "tide", "ink", "bone", "moss"] as const,
  camera: "drone" as const,
  paramRanges: {
    sigma: [5, 30],
    rho: [10, 50],
    beta: [1, 5],
    dt: [0.001, 0.02],
    trailLength: [1000, 16000],
    lineWidth: [0.5, 3.0],
    fadeTail: [0.5, 1.0],
  },
} as const;

export type LorenzAttractorManifest = typeof LORENZ_ATTRACTOR;
export type LorenzPaletteName = (typeof LORENZ_ATTRACTOR.palettes)[number];
export type LorenzParamKey = keyof typeof LORENZ_ATTRACTOR.defaultParams;
