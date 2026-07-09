/**
 * Physarum dispatch manifest.
 *
 * The "dispatch" pattern: one module per Living System that registers:
 *   - identity (name, displayName, description, component)
 *   - defaultParams / paramRanges  — what the parameter panel can show
 *   - audioBindings                 — how audio bands map to physics
 *   - palettes                      — which palettes this system supports
 *   - camera                        — default camera mode for this system
 *
 * The dispatch is the contract between the engine orchestrator and the
 * system-specific component. The component file is named in `component`
 * and resolved by the consumer (EngineCanvas / future system router).
 *
 * Note: LivingSystemName in lib/types.ts is intentionally NOT modified —
 * physarum is registered as an opt-in dispatch manifest consumed directly
 * by Physarum.tsx without requiring it to be in the global LivingSystemName
 * union (which is owned by lib/types.ts and listed as do-not-modify).
 */

export const PHYSARUM = {
  name: "physarum" as const,
  displayName: "Slime Mold",
  description: "Agent-based Physarum slime mold self-organization",
  component: "Physarum",
  defaultParams: {
    numAgents: 65536,
    sensorAngle: 22.5,        // degrees
    sensorDistance: 9.0,
    stepSize: 1.0,
    turnRate: 45.0,           // degrees
    decay: 0.92,
    diffuse: 0.5,
  },
  audioBindings: {
    bass: "decay",
    mid: "sensorDistance",
    treble: "stepSize",
    vocals: "diffuse",
  },
  palettes: ["aurora", "ember", "tide", "ink", "bone", "moss"] as const,
  camera: "drone" as const,
  paramRanges: {
    numAgents: [16384, 131072],
    sensorAngle: [10, 60],
    sensorDistance: [2, 25],
    stepSize: [0.3, 3.0],
    turnRate: [10, 90],
    decay: [0.8, 0.99],
    diffuse: [0.0, 1.0],
  },
};

export type PhysarumDispatchName = typeof PHYSARUM.name;
export type PhysarumPalette = (typeof PHYSARUM.palettes)[number];
export type PhysarumCamera = typeof PHYSARUM.camera;

export default PHYSARUM;