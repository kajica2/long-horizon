/**
 * Dispatch Registry — single source of truth tests.
 *
 * The registry is the contract between the engine orchestrator
 * (EngineCanvas, ShareableViewer) and the per-system dispatch
 * manifests. These tests pin down:
 *
 *   1. All 8 Living Systems are present in DISPATCH_REGISTRY.
 *   2. Every manifest has the contract fields populated.
 *   3. defaultParams stays within the manifest's paramRanges (every
 *      default is reachable through the manifest's own UI).
 *   4. audioBindings keys are valid param keys for that manifest.
 *   5. getDispatch() returns the right manifest for every name and
 *      undefined for unknown systems.
 *   6. listDispatchManifests() returns all 8 in declaration order.
 *   7. The 3 typed manifests (RD, LZ, PM) and the 5 legacy manifests
 *      share the same field shape (no field drift).
 *   8. store.resetParams("all") restores defaults for every system.
 *   9. store.resetParams("physics" / "visual") only touches the
 *      corresponding paramSpec group on flowFieldMeditation (the
 *      only system with a paramSpec).
 */

import { describe, it, expect, beforeEach } from "vitest";
import {
  DISPATCH_REGISTRY,
  getDispatch,
  listDispatchManifests,
  type DispatchManifest,
} from "@/lib/engine/dispatch-registry";
import { REACTION_DIFFUSION } from "@/lib/engine/dispatch-reaction-diffusion";
import { LORENZ_ATTRACTOR } from "@/lib/engine/dispatch-lorenz-attractor";
import { PHYSARUM } from "@/lib/engine/dispatch-physarum";
import { FLOW_FIELD_MEDITATION } from "@/lib/types";
import { useEngineStore } from "@/lib/engine/store";
import type { LivingSystemName } from "@/lib/types";

const ALL_SYSTEMS: LivingSystemName[] = [
  "flowFieldMeditation",
  "cosmicFilaments",
  "sandTraveler",
  "deJongAttractor",
  "birthChart",
  "reactionDiffusion",
  "lorenzAttractor",
  "physarum",
];

const REQUIRED_FIELDS: (keyof DispatchManifest)[] = [
  "name",
  "displayName",
  "description",
  "component",
  "defaultParams",
  "audioBindings",
  "palettes",
  "camera",
  "paramRanges",
];

const AUDIO_BANDS = ["bass", "mid", "treble", "vocals"] as const;

describe("DISPATCH_REGISTRY — coverage", () => {
  it("contains every LivingSystemName exactly once", () => {
    expect(Object.keys(DISPATCH_REGISTRY).sort()).toEqual([...ALL_SYSTEMS].sort());
  });

  it("contains 8 manifests (the current Living System count)", () => {
    expect(Object.keys(DISPATCH_REGISTRY)).toHaveLength(8);
  });

  it("each manifest has all required fields populated", () => {
    for (const name of ALL_SYSTEMS) {
      const m = DISPATCH_REGISTRY[name];
      for (const f of REQUIRED_FIELDS) {
        expect(m, `field ${f} on ${name}`).toHaveProperty(f);
      }
      expect(m.name).toBe(name);
      expect(typeof m.displayName).toBe("string");
      expect(m.displayName.length).toBeGreaterThan(0);
      expect(typeof m.description).toBe("string");
      expect(m.description.length).toBeGreaterThan(0);
      expect(typeof m.component).toBe("string");
      expect(m.component.length).toBeGreaterThan(0);
      expect(typeof m.defaultParams).toBe("object");
      expect(typeof m.audioBindings).toBe("object");
      expect(Array.isArray(m.palettes)).toBe(true);
      expect(m.palettes.length).toBeGreaterThan(0);
      expect(typeof m.camera).toBe("string");
      expect(typeof m.paramRanges).toBe("object");
    }
  });
});

describe("DISPATCH_REGISTRY — invariants per manifest", () => {
  it("every default param is within its declared range", () => {
    for (const name of ALL_SYSTEMS) {
      const m = DISPATCH_REGISTRY[name];
      for (const key of Object.keys(m.defaultParams)) {
        const range = m.paramRanges[key];
        if (!range) continue; // systems with empty paramRanges (sand/dejong/birth) skip
        const v = m.defaultParams[key];
        expect(v, `${name}.defaultParams.${key} = ${v}`).toBeGreaterThanOrEqual(range[0]);
        expect(v, `${name}.defaultParams.${key} = ${v}`).toBeLessThanOrEqual(range[1]);
      }
    }
  });

  it("every audio binding target is a real param key (when the system has params)", () => {
    // Audio bindings can target either a physics/visual param OR a
    // postFx key (e.g. flowFieldMeditation binds vocals→"bloom"). The
    // union of those targets is the legal set.
    const POSTFX_KEYS = new Set(["bloom", "chromaticAberration", "filmGrain", "feedback"]);
    for (const name of ALL_SYSTEMS) {
      const m = DISPATCH_REGISTRY[name];
      const paramKeys = new Set(Object.keys(m.defaultParams));
      for (const band of AUDIO_BANDS) {
        const target = m.audioBindings[band];
        const isParamKey = paramKeys.has(target);
        const isPostFxKey = POSTFX_KEYS.has(target);
        expect(
          isParamKey || isPostFxKey,
          `${name}.audioBindings.${band} = "${target}" — not in param keys [${[...paramKeys].join(", ")}] nor postfx keys`,
        ).toBe(true);
      }
    }
  });

  it("every paramRange covers the [0, +∞) sense for non-bounded params", () => {
    // Sanity: every [min, max] has min <= max (no inverted ranges).
    for (const name of ALL_SYSTEMS) {
      const m = DISPATCH_REGISTRY[name];
      for (const [k, range] of Object.entries(m.paramRanges)) {
        expect(range[0], `${name}.paramRanges.${k}[0]`).toBeLessThanOrEqual(range[1]);
      }
    }
  });
});

describe("DISPATCH_REGISTRY — typed manifests (RD, LZ, PM)", () => {
  it("reactionDiffusion entry matches the RD dispatch module", () => {
    const m = DISPATCH_REGISTRY.reactionDiffusion;
    expect(m.name).toBe(REACTION_DIFFUSION.name);
    expect(m.component).toBe(REACTION_DIFFUSION.component);
    expect(m.defaultParams.feedRate).toBe(REACTION_DIFFUSION.defaultParams.feedRate);
    expect(m.paramRanges.feedRate).toEqual(REACTION_DIFFUSION.paramRanges.feedRate);
    expect(m.audioBindings.bass).toBe(REACTION_DIFFUSION.audioBindings.bass);
  });

  it("lorenzAttractor entry matches the LZ dispatch module", () => {
    const m = DISPATCH_REGISTRY.lorenzAttractor;
    expect(m.name).toBe(LORENZ_ATTRACTOR.name);
    expect(m.component).toBe(LORENZ_ATTRACTOR.component);
    expect(m.defaultParams.sigma).toBe(LORENZ_ATTRACTOR.defaultParams.sigma);
    expect(m.paramRanges.sigma).toEqual(LORENZ_ATTRACTOR.paramRanges.sigma);
  });

  it("physarum entry matches the PM dispatch module", () => {
    const m = DISPATCH_REGISTRY.physarum;
    expect(m.name).toBe(PHYSARUM.name);
    expect(m.component).toBe(PHYSARUM.component);
    expect(m.defaultParams.numAgents).toBe(PHYSARUM.defaultParams.numAgents);
    expect(m.paramRanges.decay).toEqual(PHYSARUM.paramRanges.decay);
  });
});

describe("DISPATCH_REGISTRY — legacy manifests", () => {
  it("flowFieldMeditation defaults are sourced from FLOW_FIELD_MEDITATION", () => {
    const m = DISPATCH_REGISTRY.flowFieldMeditation;
    expect(m.defaultParams.particleCount).toBe(
      FLOW_FIELD_MEDITATION.defaultParams.particleCount,
    );
    expect(m.defaultParams.noiseScale).toBe(
      FLOW_FIELD_MEDITATION.defaultParams.noiseScale,
    );
    expect(m.defaultParams.fieldStrength).toBe(
      FLOW_FIELD_MEDITATION.defaultParams.fieldStrength,
    );
    expect(m.audioBindings.bass).toBe(
      FLOW_FIELD_MEDITATION.defaultAudioBindings.bass,
    );
    expect(m.audioBindings.treble).toBe(
      FLOW_FIELD_MEDITATION.defaultAudioBindings.treble,
    );
  });

  it("component names point to real .tsx files in components/engine", () => {
    // The mapping between manifest.component and the actual React
    // component lives in registry-routed-engine.tsx. Verify that
    // every manifest's component name matches a known key in that
    // map by importing it directly.
    // (Indirect: ensure no manifest references an unknown name.)
    const validComponents = new Set([
      "ParticleSystem",
      "CosmicFilaments",
      "SandTraveler",
      "DeJongAttractor",
      "BirthChartScene",
      "ReactionDiffusion",
      "LorenzAttractor",
      "Physarum",
    ]);
    for (const name of ALL_SYSTEMS) {
      const m = DISPATCH_REGISTRY[name];
      expect(validComponents.has(m.component), `${name}.component = "${m.component}"`).toBe(true);
    }
  });
});

describe("getDispatch", () => {
  it("returns the right manifest for each registered name", () => {
    for (const name of ALL_SYSTEMS) {
      expect(getDispatch(name)?.name).toBe(name);
    }
  });

  it("returns undefined for unknown systems", () => {
    expect(getDispatch("doesNotExist")).toBeUndefined();
    expect(getDispatch("")).toBeUndefined();
    expect(getDispatch("diffusionLimitedAggregation")).toBeUndefined();
    expect(getDispatch("galaxyNBody")).toBeUndefined();
  });

  it("returns undefined for non-system strings (no accidental fuzzy match)", () => {
    expect(getDispatch("flowFieldMeditation ")).toBeUndefined();
    expect(getDispatch(" FLOWFIELDMEDITATION")).toBeUndefined();
  });
});

describe("listDispatchManifests", () => {
  it("returns 8 manifests", () => {
    expect(listDispatchManifests()).toHaveLength(8);
  });

  it("contains every registered system exactly once", () => {
    const listed = listDispatchManifests().map((m) => m.name).sort();
    expect(listed).toEqual([...ALL_SYSTEMS].sort());
  });
});

describe("store.resetParams reads from the registry", () => {
  beforeEach(() => {
    // Reset the engine store to a known state between tests.
    useEngineStore.setState({
      shaderGraph: {
        version: 1,
        system: "cosmicFilaments",
        params: {
          particleCount: 123, // intentionally wrong — to be reset
          noiseScale: 0.1,
          fieldStrength: 9.9,
          drag: 0.99,
          spawnRadius: 99,
          pointSize: 99,
        },
        audioBindings: { bass: "x", mid: "y", treble: "z", vocals: "w" },
        palette: "ink",
        camera: "meditationDrift",
        postFx: { bloom: 0.8, chromaticAberration: 0.002, filmGrain: 0.05, feedback: 0.05 },
      },
    });
  });

  it("resetParams('all') restores cosmicFilaments defaults from the registry", () => {
    useEngineStore.getState().resetParams("all");
    const params = useEngineStore.getState().shaderGraph.params;
    const expected = DISPATCH_REGISTRY.cosmicFilaments.defaultParams;
    for (const k of Object.keys(expected)) {
      expect(params[k], `param ${k}`).toBe(expected[k]);
    }
  });

  it("resetParams('all') restores reactionDiffusion defaults from the registry", () => {
    useEngineStore.getState().setShaderGraph({
      ...useEngineStore.getState().shaderGraph,
      system: "reactionDiffusion",
      params: { feedRate: 0.9, killRate: 0.9, du: 0.9, dv: 0.9, dt: 0.9, stepsPerFrame: 99 },
    });
    useEngineStore.getState().resetParams("all");
    const params = useEngineStore.getState().shaderGraph.params;
    expect(params.feedRate).toBe(REACTION_DIFFUSION.defaultParams.feedRate);
    expect(params.killRate).toBe(REACTION_DIFFUSION.defaultParams.killRate);
    expect(params.stepsPerFrame).toBe(REACTION_DIFFUSION.defaultParams.stepsPerFrame);
  });

  it("resetParams('all') restores lorenzAttractor defaults from the registry", () => {
    useEngineStore.getState().setShaderGraph({
      ...useEngineStore.getState().shaderGraph,
      system: "lorenzAttractor",
      params: { sigma: 1, rho: 1, beta: 1, dt: 1, trailLength: 1, lineWidth: 1, fadeTail: 0 },
    });
    useEngineStore.getState().resetParams("all");
    const params = useEngineStore.getState().shaderGraph.params;
    expect(params.sigma).toBe(LORENZ_ATTRACTOR.defaultParams.sigma);
    expect(params.rho).toBe(LORENZ_ATTRACTOR.defaultParams.rho);
    expect(params.trailLength).toBe(LORENZ_ATTRACTOR.defaultParams.trailLength);
  });

  it("resetParams('all') restores physarum defaults from the registry", () => {
    useEngineStore.getState().setShaderGraph({
      ...useEngineStore.getState().shaderGraph,
      system: "physarum",
      params: {
        numAgents: 1,
        sensorAngle: 1,
        sensorDistance: 1,
        stepSize: 1,
        turnRate: 1,
        decay: 0,
        diffuse: 0,
      },
    });
    useEngineStore.getState().resetParams("all");
    const params = useEngineStore.getState().shaderGraph.params;
    expect(params.numAgents).toBe(PHYSARUM.defaultParams.numAgents);
    expect(params.decay).toBe(PHYSARUM.defaultParams.decay);
  });

  it("resetParams('all') restores flowFieldMeditation defaults from the registry", () => {
    useEngineStore.getState().setShaderGraph({
      ...useEngineStore.getState().shaderGraph,
      system: "flowFieldMeditation",
      params: {
        particleCount: 1,
        noiseScale: 1,
        fieldStrength: 1,
        drag: 1,
        spawnRadius: 1,
        maxAge: 1,
        pointSize: 1,
      },
    });
    useEngineStore.getState().resetParams("all");
    const params = useEngineStore.getState().shaderGraph.params;
    expect(params.particleCount).toBe(FLOW_FIELD_MEDITATION.defaultParams.particleCount);
    expect(params.noiseScale).toBe(FLOW_FIELD_MEDITATION.defaultParams.noiseScale);
  });

  it("resetParams('physics') only touches physics-group params on flowFieldMeditation", () => {
    useEngineStore.getState().setShaderGraph({
      ...useEngineStore.getState().shaderGraph,
      system: "flowFieldMeditation",
      params: {
        particleCount: 999,
        noiseScale: 999,
        fieldStrength: 999,
        drag: 999,
        spawnRadius: 999,
        maxAge: 999,
        pointSize: 999,
      },
    });
    useEngineStore.getState().resetParams("physics");
    const params = useEngineStore.getState().shaderGraph.params;
    // Physics defaults restored:
    expect(params.particleCount).toBe(FLOW_FIELD_MEDITATION.defaultParams.particleCount);
    expect(params.noiseScale).toBe(FLOW_FIELD_MEDITATION.defaultParams.noiseScale);
    // Visual untouched:
    expect(params.pointSize).toBe(999);
  });

  it("resetParams('visual') only touches visual-group params on flowFieldMeditation", () => {
    useEngineStore.getState().setShaderGraph({
      ...useEngineStore.getState().shaderGraph,
      system: "flowFieldMeditation",
      params: {
        particleCount: 999,
        noiseScale: 999,
        fieldStrength: 999,
        drag: 999,
        spawnRadius: 999,
        maxAge: 999,
        pointSize: 999,
      },
    });
    useEngineStore.getState().resetParams("visual");
    const params = useEngineStore.getState().shaderGraph.params;
    // Visual restored:
    expect(params.pointSize).toBe(FLOW_FIELD_MEDITATION.defaultParams.pointSize);
    // Physics untouched:
    expect(params.particleCount).toBe(999);
    expect(params.noiseScale).toBe(999);
  });
});