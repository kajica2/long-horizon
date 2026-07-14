import { describe, it, expect } from "vitest";
import {
  PRESETS,
  getPreset,
  applyPreset,
  presetsBySystem,
} from "@/lib/engine/presets";
import { defaultShaderGraph } from "@/lib/types";

describe("presets", () => {
  it("has at least 4 presets", () => {
    expect(PRESETS.length).toBeGreaterThanOrEqual(4);
  });

  it("all presets have unique ids", () => {
    const ids = PRESETS.map((p) => p.id);
    expect(new Set(ids).size).toBe(ids.length);
  });

  it("every preset has a name and description", () => {
    for (const p of PRESETS) {
      expect(p.name.length).toBeGreaterThan(0);
      expect(p.description.length).toBeGreaterThan(0);
    }
  });

  it("getPreset returns the preset by id", () => {
    const p = getPreset("tarbell-2004");
    expect(p).toBeDefined();
    expect(p!.id).toBe("tarbell-2004");
  });

  it("getPreset returns undefined for missing", () => {
    expect(getPreset("nope")).toBe(undefined);
  });

  it("applyPreset replaces params and keeps graph structure", () => {
    const g = defaultShaderGraph();
    const next = applyPreset(g, PRESETS[0]);
    expect(next.system).toBe(PRESETS[0].system);
    expect(next.params).not.toBe(g.params);
  });

  it("presetsBySystem groups correctly", () => {
    const grouped = presetsBySystem();
    expect(grouped.sandTraveler.length).toBeGreaterThanOrEqual(1);
    expect(grouped.cosmicFilaments.length).toBeGreaterThanOrEqual(1);
    expect(grouped.flowFieldMeditation.length).toBeGreaterThanOrEqual(1);
  });
});