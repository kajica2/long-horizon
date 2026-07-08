/**
 * ParameterPanel — Stage 7.
 *
 * Right-rail accordion that lets the user tune every engine parameter
 * in real time. The panel reads its config from the engine store and
 * the current `system`'s `paramSpec` (declared in lib/types.ts).
 *
 * Per-system:
 *   - flowFieldMeditation: full panel (physics, visual, audio bindings)
 *   - cosmicFilaments: full panel
 *   - sandTraveler: lighter (palette + camera; sim is fixed)
 *   - deJongAttractor: lighter
 *   - birthChart: minimal (camera + show-aspect-lines toggle)
 *
 * Audio bindings are a 2x2 dropdown grid: bass / mid / treble / vocals
 * each bound to a target engine parameter. The 4 default bindings are
 * always available; the dropdown shows all numeric params.
 *
 * Each accordion has a Reset button that returns just that group to defaults.
 * There's a global Reset All at the bottom.
 *
 * The panel is always rendered on the engine view. It collapses to a
 * small "tune" button on mobile (≤768px), tapping expands it as a sheet.
 */

"use client";

import { useState, useMemo } from "react";
import { useEngineStore } from "@/lib/engine/store";
import {
  FLOW_FIELD_MEDITATION,
  type ParamSpec,
  type AudioBand,
  type LivingSystemName,
  type ShaderGraph,
} from "@/lib/types";

type ParamGroup = "physics" | "visual" | "audio" | "camera" | "system";

function getSystemDef(system: LivingSystemName) {
  // v1 only Flow Field Meditation has a full paramSpec.
  // Other systems have ad-hoc params stored in shaderGraph.params.
  if (system === "flowFieldMeditation") return FLOW_FIELD_MEDITATION;
  return null;
}

function defaultParamsFor(system: LivingSystemName): Record<string, number> {
  if (system === "flowFieldMeditation") return { ...FLOW_FIELD_MEDITATION.defaultParams };
  if (system === "cosmicFilaments") {
    return { particleCount: 30000, noiseScale: 0.5, fieldStrength: 1.4, drag: 0.05, spawnRadius: 7, pointSize: 1.2 };
  }
  return {};
}

export function ParameterPanel() {
  const shaderGraph = useEngineStore((s) => s.shaderGraph);
  const updateParam = useEngineStore((s) => s.updateParam);
  const setShaderGraph = useEngineStore((s) => s.setShaderGraph);
  const setAudioBinding = useEngineStore((s) => s.setAudioBinding);
  const resetParams = useEngineStore((s) => s.resetParams);
  const setPalette = useEngineStore((s) => s.setPalette);
  const setCameraMode = useEngineStore((s) => s.setCameraMode);

  const [openGroups, setOpenGroups] = useState<Record<ParamGroup, boolean>>({
    physics: true,
    visual: false,
    audio: true,
    camera: false,
    system: false,
  });
  const [collapsed, setCollapsed] = useState(false);

  const toggle = (g: ParamGroup) =>
    setOpenGroups((o) => ({ ...o, [g]: !o[g] }));

  // Resolve param specs
  const systemDef = getSystemDef(shaderGraph.system);
  const specByKey: Record<string, ParamSpec> = useMemo(() => {
    if (!systemDef) return {};
    const out: Record<string, ParamSpec> = {};
    for (const p of systemDef.paramSpec) out[p.key] = p;
    return out;
  }, [systemDef]);

  const physicsParams = systemDef?.paramSpec.filter((p) => p.group === "physics") ?? [];
  const visualParams = systemDef?.paramSpec.filter((p) => p.group === "visual") ?? [];
  const audioBindings = shaderGraph.audioBindings;
  const allParamKeys = Object.keys(shaderGraph.params);

  // For sandTraveler / deJong / birthChart, show minimal panel
  const isMinimal = ["sandTraveler", "deJongAttractor", "birthChart"].includes(shaderGraph.system);

  if (collapsed) {
    return (
      <button
        onClick={() => setCollapsed(false)}
        className="pointer-events-auto fixed right-6 top-1/2 -translate-y-1/2 z-30 flex h-10 w-10 items-center justify-center rounded-full border border-border bg-background-glass text-foreground-muted backdrop-blur transition-base hover:border-border-strong hover:text-foreground"
        aria-label="Open parameter panel"
      >
        <svg viewBox="0 0 24 24" className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth="1.5">
          <line x1="4" y1="6" x2="20" y2="6" />
          <line x1="4" y1="12" x2="20" y2="12" />
          <line x1="4" y1="18" x2="14" y2="18" />
          <circle cx="8" cy="6" r="1.5" fill="currentColor" />
          <circle cx="16" cy="12" r="1.5" fill="currentColor" />
          <circle cx="10" cy="18" r="1.5" fill="currentColor" />
        </svg>
      </button>
    );
  }

  return (
    <div
      className="pointer-events-auto fixed right-6 top-1/2 z-30 hidden h-[80vh] w-[320px] -translate-y-1/2 flex-col gap-3 overflow-y-auto rounded-2xl border border-border bg-background-glass p-4 backdrop-blur md:flex"
      data-testid="parameter-panel"
    >
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <p className="text-[10px] tracking-[0.25em] uppercase text-foreground-subtle">
            Parameter
          </p>
          <p className="text-sm font-light text-foreground">
            {shaderGraph.system === "flowFieldMeditation" ? "Flow Field" :
             shaderGraph.system === "cosmicFilaments" ? "Cosmic Filaments" :
             shaderGraph.system === "sandTraveler" ? "Sand Traveler" :
             shaderGraph.system === "deJongAttractor" ? "de Jong" :
             "Birth Chart"}
          </p>
        </div>
        <button
          onClick={() => setCollapsed(true)}
          className="flex h-7 w-7 items-center justify-center rounded-full text-foreground-subtle transition-base hover:bg-foreground/5 hover:text-foreground"
          aria-label="Collapse panel"
        >
          <svg viewBox="0 0 24 24" className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth="1.5">
            <path d="M9 6l6 6-6 6" />
          </svg>
        </button>
      </div>

      {/* Physics accordion */}
      {physicsParams.length > 0 && (
        <Accordion
          label="Physics"
          open={openGroups.physics}
          onToggle={() => toggle("physics")}
          onReset={() => resetParams("physics")}
        >
          {physicsParams.map((p) => (
            <Slider
              key={p.key}
              spec={p}
              value={(shaderGraph.params[p.key] as number) ?? p.default}
              onChange={(v) => updateParam(p.key, v)}
            />
          ))}
        </Accordion>
      )}

      {/* Visual accordion */}
      {visualParams.length > 0 && (
        <Accordion
          label="Visual"
          open={openGroups.visual}
          onToggle={() => toggle("visual")}
          onReset={() => resetParams("visual")}
        >
          {visualParams.map((p) => (
            <Slider
              key={p.key}
              spec={p}
              value={(shaderGraph.params[p.key] as number) ?? p.default}
              onChange={(v) => updateParam(p.key, v)}
            />
          ))}
        </Accordion>
      )}

      {/* Audio bindings accordion */}
      {systemDef && (
        <Accordion
          label="Audio Bindings"
          open={openGroups.audio}
          onToggle={() => toggle("audio")}
        >
          <p className="mb-3 text-[11px] leading-relaxed text-foreground-subtle">
            Map each audio band to a parameter. Defaults work for most tracks.
          </p>
          <div className="grid grid-cols-2 gap-2">
            {(["bass", "mid", "treble", "vocals"] as AudioBand[]).map((band) => (
              <BindingSelect
                key={band}
                band={band}
                value={audioBindings[band]}
                options={allParamKeys.concat(["bloom", "pointSize"])}
                onChange={(target) => setAudioBinding(band, target)}
              />
            ))}
          </div>
        </Accordion>
      )}

      {/* Camera accordion */}
      <Accordion
        label="Camera"
        open={openGroups.camera}
        onToggle={() => toggle("camera")}
      >
        <div className="grid grid-cols-2 gap-1.5">
          {(["drone", "orbit", "meditationDrift", "inside"] as const).map((mode) => (
            <button
              key={mode}
              onClick={() => setCameraMode(mode)}
              className={`rounded-md border px-2 py-1.5 text-[10px] transition-base ${
                shaderGraph.camera === mode
                  ? "border-border-strong bg-foreground/10 text-foreground"
                  : "border-border text-foreground-muted hover:border-border-strong"
              }`}
            >
              {mode === "meditationDrift" ? "Drift" : mode === "drone" ? "Drone" : mode === "orbit" ? "Orbit" : "Inside"}
            </button>
          ))}
        </div>
      </Accordion>

      {/* System accordion — palette, postfx level */}
      <Accordion
        label="System"
        open={openGroups.system}
        onToggle={() => toggle("system")}
        onReset={isMinimal ? undefined : () => resetParams("all")}
      >
        <div className="space-y-1.5">
          <p className="text-[10px] tracking-[0.15em] uppercase text-foreground-subtle">Palette</p>
          <div className="flex flex-wrap gap-1">
            {(["aurora", "ember", "tide", "ink", "bone", "moss"] as const).map((p) => (
              <button
                key={p}
                onClick={() => setPalette(p)}
                className={`rounded-full border px-2 py-0.5 text-[10px] capitalize transition-base ${
                  shaderGraph.palette === p
                    ? "border-border-strong bg-foreground/10 text-foreground"
                    : "border-border text-foreground-muted hover:border-border-strong"
                }`}
              >
                {p}
              </button>
            ))}
          </div>
        </div>
        <div className="mt-3 space-y-1.5">
          <p className="text-[10px] tracking-[0.15em] uppercase text-foreground-subtle">Post-FX</p>
          <Slider
            spec={{ key: "bloom", label: "Bloom", min: 0, max: 2, step: 0.05, default: 0.8, group: "visual" }}
            value={shaderGraph.postFx.bloom}
            onChange={(v) => setShaderGraph({
              ...shaderGraph,
              postFx: { ...shaderGraph.postFx, bloom: v },
            })}
          />
          <Slider
            spec={{ key: "filmGrain", label: "Grain", min: 0, max: 0.2, step: 0.005, default: 0.05, group: "visual" }}
            value={shaderGraph.postFx.filmGrain}
            onChange={(v) => setShaderGraph({
              ...shaderGraph,
              postFx: { ...shaderGraph.postFx, filmGrain: v },
            })}
          />
        </div>
      </Accordion>

      {/* Reset all */}
      {!isMinimal && (
        <button
          onClick={() => resetParams("all")}
          className="mt-2 w-full rounded-md border border-border bg-background-glass px-3 py-1.5 text-[10px] tracking-[0.2em] uppercase text-foreground-muted transition-base hover:border-border-strong hover:text-foreground"
        >
          Reset all to defaults
        </button>
      )}
    </div>
  );
}

// ============================================================
// Subcomponents
// ============================================================

function Accordion({
  label,
  open,
  onToggle,
  onReset,
  children,
}: {
  label: string;
  open: boolean;
  onToggle: () => void;
  onReset?: () => void;
  children: React.ReactNode;
}) {
  return (
    <div className="rounded-lg border border-border bg-background-elevated/30">
      <div className="flex items-center justify-between px-3 py-2">
        <button
          onClick={onToggle}
          className="flex flex-1 items-center gap-2 text-left"
        >
          <svg
            viewBox="0 0 24 24"
            className={`h-3 w-3 text-foreground-subtle transition-transform ${open ? "rotate-90" : ""}`}
            fill="none" stroke="currentColor" strokeWidth="2"
          >
            <path d="M9 6l6 6-6 6" />
          </svg>
          <span className="text-[10px] tracking-[0.25em] uppercase text-foreground-muted">{label}</span>
        </button>
        {onReset && (
          <button
            onClick={onReset}
            className="text-[9px] tracking-[0.15em] uppercase text-foreground-subtle transition-base hover:text-foreground"
          >
            Reset
          </button>
        )}
      </div>
      {open && <div className="space-y-2.5 px-3 pb-3">{children}</div>}
    </div>
  );
}

function Slider({
  spec,
  value,
  onChange,
}: {
  spec: ParamSpec;
  value: number;
  onChange: (v: number) => void;
}) {
  const stepStr = spec.step >= 1 ? "1" : spec.step.toString();
  return (
    <div>
      <div className="mb-1 flex items-center justify-between">
        <label className="text-[11px] text-foreground-muted">{spec.label}</label>
        <span className="font-mono text-[10px] tabular-nums text-foreground-subtle">
          {formatNumber(value)}
        </span>
      </div>
      <div className="flex items-center gap-2">
        <input
          type="range"
          min={spec.min}
          max={spec.max}
          step={spec.step}
          value={value}
          onChange={(e) => onChange(parseFloat(e.target.value))}
          className="flex-1 accent-violet-500"
        />
        <input
          type="number"
          min={spec.min}
          max={spec.max}
          step={spec.step}
          value={value}
          onChange={(e) => {
            const v = parseFloat(e.target.value);
            if (!Number.isNaN(v)) onChange(clamp(v, spec.min, spec.max));
          }}
          className="w-14 rounded border border-border bg-background-elevated px-1.5 py-0.5 font-mono text-[10px] text-foreground focus:border-border-strong focus:outline-none"
        />
      </div>
    </div>
  );
}

function BindingSelect({
  band,
  value,
  options,
  onChange,
}: {
  band: AudioBand;
  value: string;
  options: string[];
  onChange: (target: string) => void;
}) {
  return (
    <div>
      <label className="block text-[9px] tracking-[0.2em] uppercase text-foreground-subtle">
        {band}
      </label>
      <select
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className="mt-0.5 w-full rounded border border-border bg-background-elevated px-1.5 py-1 text-[10px] text-foreground focus:border-border-strong focus:outline-none"
      >
        {options.map((opt) => (
          <option key={opt} value={opt}>
            {opt}
          </option>
        ))}
      </select>
    </div>
  );
}

// ============================================================
// Utilities
// ============================================================

function clamp(v: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, v));
}

function formatNumber(v: number): string {
  if (Math.abs(v) >= 1000) return v.toFixed(0);
  if (Math.abs(v) >= 100) return v.toFixed(1);
  if (Math.abs(v) >= 1) return v.toFixed(2);
  return v.toFixed(3);
}