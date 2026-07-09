/**
 * Stages 24-28 — Mood variant tests.
 *
 * Verifies:
 *   - applyMood is pure: same input → byte-identical output
 *   - applyMood overrides palette + camera + postFx; preserves the
     engine system + params + audioBindings + audioDNA + visualDNA
 *   - variantId encodes parent + mood; parseVariantId roundtrips
 *   - isMood accepts only the 6 slug strings
 *   - moodVariants returns exactly 6 variants in canonical order
 *   - variant id format is URL-safe (no spaces, no special chars)
 */

import { describe, it, expect } from "vitest";
import {
  applyMood,
  moodVariants,
  variantId,
  parseVariantId,
  isMood,
  MOODS,
  MOOD_LABELS,
} from "@/lib/moods";
import { defaultShaderGraph, type Artwork } from "@/lib/types";

function makeArtwork(overrides: Partial<Artwork> & Pick<Artwork, "id">): Artwork {
  const { id, shaderGraph: sg, ...rest } = overrides;
  return {
    id,
    seed: "feed".padEnd(32, "0"),
    soundtrack: {
      id: "none",
      hash: "0".repeat(64),
      originalFilename: "",
      duration: 0,
      uploadedAt: new Date(0).toISOString(),
      url: "",
    },
    audioDNA: {
      tempo: 120, key: "C", mode: "major",
      brightness: 0.5, warmth: 0.5, texture: 0.5,
      energy: 0.5, aggression: 0.5, complexity: 0.5,
      motion: 0.5, entropy: 0.5,
    },
    shaderGraph: { ...defaultShaderGraph(), ...(sg ?? {}) },
    createdAt: new Date(2024, 0, 1).toISOString(),
    creator: "mood-test",
    title: id,
    ...rest,
  };
}

describe("moods — Stage 24-28", () => {
  it("MOODS contains exactly the six canonical slugs in order", () => {
    expect(MOODS).toEqual([
      "morning",
      "afternoon",
      "night",
      "winter",
      "decay",
      "rebirth",
    ]);
    expect(MOOD_LABELS.morning).toBe("Morning");
    expect(MOOD_LABELS.rebirth).toBe("Rebirth");
  });

  it("isMood recognises the six slug strings only", () => {
    for (const m of MOODS) expect(isMood(m)).toBe(true);
    expect(isMood("dawn")).toBe(false);
    expect(isMood("")).toBe(false);
    expect(isMood("MORNING")).toBe(false);
  });

  it("applyMood is deterministic (same input → same output)", () => {
    const a = makeArtwork({ id: "demo-driftwav" });
    const v1 = applyMood(a, "morning");
    const v2 = applyMood(a, "morning");
    expect(v1).toEqual(v2);
  });

  it("applyMood preserves engine system + params + audioBindings", () => {
    const a = makeArtwork({
      id: "lorenz-butterfly",
      shaderGraph: {
        ...defaultShaderGraph(),
        system: "lorenzAttractor",
        params: { sigma: 10, rho: 28, beta: 2.667 },
      },
    });
    const v = applyMood(a, "night");
    expect(v.shaderGraph.system).toBe("lorenzAttractor");
    expect(v.shaderGraph.params.sigma).toBe(10);
    expect(v.shaderGraph.params.rho).toBe(28);
    expect(v.shaderGraph.audioBindings).toEqual(a.shaderGraph.audioBindings);
  });

  it("applyMood overrides palette + camera + postFx", () => {
    const a = makeArtwork({
      id: "x",
      shaderGraph: { ...defaultShaderGraph(), palette: "aurora", camera: "drone" },
    });
    const v = applyMood(a, "night");
    expect(v.shaderGraph.palette).toBe("ink");
    expect(v.shaderGraph.camera).toBe("meditationDrift");
    expect(v.shaderGraph.postFx.bloom).not.toBe(a.shaderGraph.postFx.bloom);
  });

  it("moodVariants returns 6 variants in canonical order", () => {
    const a = makeArtwork({ id: "demo-driftwav" });
    const variants = moodVariants(a);
    expect(variants.length).toBe(6);
    expect(variants.map((v) => v.id)).toEqual([
      "demo-driftwav--morning",
      "demo-driftwav--afternoon",
      "demo-driftwav--night",
      "demo-driftwav--winter",
      "demo-driftwav--decay",
      "demo-driftwav--rebirth",
    ]);
  });

  it("variant id is URL-safe", () => {
    for (const m of MOODS) {
      const id = variantId("alpha-beta-gamma", m);
      expect(id).toMatch(/^[a-z0-9-]+$/);
    }
  });

  it("parseVariantId roundtrips variantId", () => {
    for (const m of MOODS) {
      const id = variantId("demo-pulsewav", m);
      const parsed = parseVariantId(id);
      expect(parsed).toEqual({ parentId: "demo-pulsewav", mood: m });
    }
  });

  it("parseVariantId returns null for non-variant ids", () => {
    expect(parseVariantId("demo-driftwav")).toBeNull();
    expect(parseVariantId("demo-driftwav--unknown")).toBeNull();
    expect(parseVariantId("--morning")).toBeNull();
    expect(parseVariantId("")).toBeNull();
  });

  it("applyMood produces a variant id equal to variantId(parent, mood)", () => {
    const a = makeArtwork({ id: "demo-shimmerwav" });
    for (const m of MOODS) {
      const v = applyMood(a, m);
      expect(v.id).toBe(variantId("demo-shimmerwav", m));
    }
  });

  it("applyMood prefixes the title with the mood label", () => {
    const a = makeArtwork({ id: "demo-driftwav", title: "Drift" });
    expect(applyMood(a, "morning").title).toBe("Morning — Drift");
    expect(applyMood(a, "night").title).toBe("Night — Drift");
  });

  it("variants preserve audioDNA + visualDNA + creator + createdAt", () => {
    const a = makeArtwork({
      id: "visual-warm-sunset",
      visualDNA: {
        palette: ["#000000", "#111111", "#222222", "#333333", "#444444"],
        brightness: 0.5, contrast: 0.5, saturation: 0.5, warmth: 0.5,
        edgeDensity: 0.3, textureComplexity: 0.3, aspectRatio: 1.5,
        compositionalCenter: { x: 0.5, y: 0.5 },
        focalDistance: 0.5, hash: "h",
      },
    });
    const v = applyMood(a, "decay");
    expect(v.audioDNA).toEqual(a.audioDNA);
    expect(v.visualDNA).toEqual(a.visualDNA);
    expect(v.creator).toBe(a.creator);
    expect(v.createdAt).toBe(a.createdAt);
  });
});