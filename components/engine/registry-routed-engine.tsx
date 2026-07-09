"use client";

/**
 * RegistryRoutedEngine — the single dispatcher that mounts the right
 * Living System visual layer based on the engine store's
 * `shaderGraph.system` value.
 *
 * This is the read-side of the dispatch registry. `EngineCanvas.tsx`
 * and `ShareableViewer.tsx` both render <RegistryRoutedEngine ... />
 * inside their `<Canvas>` instead of a hardcoded ternary chain.
 *
 * Behavioural invariants preserved from the original ternary chains:
 *   - `birthChart` requires a `birthChart` prop; renders null when
 *     the artwork does not carry one (no natal chart is a valid
 *     state — e.g. an artwork with system=birthChart but no chart
 *     data simply shows background + postfx).
 *   - `birthChart` does NOT mount CameraRig (the wheel does its own
 *     framing). This is enforced at the call site (EngineCanvas), not
 *     here, because CameraRig lives outside this component.
 *   - `cosmicFilaments` receives `planetaryChartIntensity` and
 *     `planetaryMoonPhase` when supplied.
 *   - `flowFieldMeditation` and `physarum` receive `deviceTier`.
 *   - Unknown / unregistered systems render null (no crash, just a
 *     blank background layer).
 *
 * To add a new Living System: import its component, add it to
 * `COMPONENT_MAP`, and (optionally) extend `RoutedProps` with the
 * per-system extras (planetary modulation, device tier, …).
 */

import { ParticleSystem } from "./ParticleSystem";
import { CosmicFilaments } from "./CosmicFilaments";
import { SandTraveler } from "./SandTraveler";
import { DeJongAttractor } from "./DeJongAttractor";
import { BirthChartScene } from "./BirthChartScene";
import { ReactionDiffusion } from "./ReactionDiffusion";
import { LorenzAttractor } from "./LorenzAttractor";
import { Physarum } from "./Physarum";

import { DISPATCH_REGISTRY } from "@/lib/engine/dispatch-registry";
import { useEngineStore } from "@/lib/engine/store";
import type { BirthChart } from "@/lib/types";
import type { DeviceTier } from "@/lib/engine/responsive";

/**
 * The component name → actual R3F component. The string side comes
 * from the registry (`manifest.component`); the value side is the
 * import. The union of all component names is the type system
 * keeping this in sync with `DispatchManifest.component`.
 */
const COMPONENT_MAP = {
  ParticleSystem,
  CosmicFilaments,
  SandTraveler,
  DeJongAttractor,
  BirthChartScene,
  ReactionDiffusion,
  LorenzAttractor,
  Physarum,
} as const;

export type RoutedProps = {
  seed: string;
  planetaryChartIntensity?: number;
  planetaryMoonPhase?: number;
  birthChart?: BirthChart;
  deviceTier?: DeviceTier;
};

/**
 * Routes to the right R3F component for the current
 * `shaderGraph.system`. Returns null when the system is unknown or
 * the required per-system data is missing.
 */
export function RegistryRoutedEngine(props: RoutedProps) {
  const system = useEngineStore((s) => s.shaderGraph.system);
  const manifest = DISPATCH_REGISTRY[system];
  if (!manifest) return null;

  const Component =
    COMPONENT_MAP[manifest.component as keyof typeof COMPONENT_MAP];
  if (!Component) return null;

  // birthChart requires its chart data; render null if absent.
  if (manifest.component === "BirthChartScene" && !props.birthChart) {
    return null;
  }

  // Per-component prop forwarding. Each branch passes only the props
  // the component actually consumes — extra props would be ignored by
  // the components but would still bloat the React tree, and worse,
  // would surface as runtime "unknown prop" warnings.
  switch (manifest.component) {
    case "CosmicFilaments":
      return (
        <CosmicFilaments
          seed={props.seed}
          planetaryChartIntensity={props.planetaryChartIntensity}
          planetaryMoonPhase={props.planetaryMoonPhase}
        />
      );
    case "BirthChartScene":
      return <BirthChartScene chart={props.birthChart!} seed={props.seed} />;
    case "Physarum":
      return <Physarum seed={props.seed} deviceTier={props.deviceTier} />;
    case "ParticleSystem":
      return <ParticleSystem seed={props.seed} deviceTier={props.deviceTier} />;
    case "SandTraveler":
      return <SandTraveler seed={props.seed} />;
    case "DeJongAttractor":
      return <DeJongAttractor seed={props.seed} />;
    case "ReactionDiffusion":
      return <ReactionDiffusion seed={props.seed} />;
    case "LorenzAttractor":
      return <LorenzAttractor seed={props.seed} />;
    default:
      return null;
  }
}