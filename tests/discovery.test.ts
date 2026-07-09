/**
 * Stage 21 — Discovery helpers tests.
 *
 * Verifies:
 *   - searchArtworks text + facet filter combinations
 *   - sort modes: newest, oldest, most-reacted
 *   - similarArtworks ranks by L2 distance over DNA vectors
 *   - cross-medium candidates sort to the bottom (penalty)
 *   - distance functions are deterministic
 */

import { describe, it, expect } from "vitest";
import { searchArtworks, similarArtworks } from "@/lib/discovery";
import { defaultShaderGraph, type Artwork, type VisualDNA } from "@/lib/types";

function makeArtwork(overrides: Partial<Artwork> & Pick<Artwork, "id">): Artwork {
  const { id, shaderGraph: sgOverride, ...rest } = overrides;
  const base: Artwork = {
    id,
    seed: "deadbeef".repeat(4),
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
    shaderGraph: { ...defaultShaderGraph(), ...(sgOverride ?? {}) },
    createdAt: new Date(2024, 0, 1).toISOString(),
    creator: "test",
    title: id,
    ...rest,
  };
  return base;
}

const DUMMY_VISUAL: VisualDNA = {
  palette: ["#000000", "#000000", "#000000", "#000000", "#000000"],
  brightness: 0, contrast: 0, saturation: 0, warmth: 0,
  edgeDensity: 0, textureComplexity: 0, aspectRatio: 1,
  compositionalCenter: { x: 0, y: 0 },
  focalDistance: 0, hash: "",
};

describe("searchArtworks — Stage 21", () => {
  const corpus: Artwork[] = [
    makeArtwork({ id: "alpha", title: "Drift", createdAt: new Date(2024, 0, 1).toISOString() }),
    makeArtwork({ id: "beta", title: "Bloom", createdAt: new Date(2024, 1, 1).toISOString() }),
    makeArtwork({
      id: "gamma",
      title: "Echo",
      creator: "special-creator",
      createdAt: new Date(2024, 2, 1).toISOString(),
      shaderGraph: { ...defaultShaderGraph(), system: "sandTraveler", palette: "bone" },
    }),
    makeArtwork({
      id: "delta",
      title: "Sand & Bone",
      createdAt: new Date(2024, 3, 1).toISOString(),
      shaderGraph: { ...defaultShaderGraph(), system: "sandTraveler", palette: "bone" },
    }),
  ];

  it("returns all artworks when no facets", () => {
    const r = searchArtworks(corpus, {});
    expect(r.length).toBe(4);
  });

  it("filters by text query (case-insensitive, partial match)", () => {
    const r = searchArtworks(corpus, { q: "drift" });
    expect(r.map((x) => x.artwork.id)).toEqual(["alpha"]);
  });

  it("filters by creator", () => {
    const r = searchArtworks(corpus, { q: "special-creator" });
    expect(r.map((x) => x.artwork.id)).toEqual(["gamma"]);
  });

  it("filters by system facet", () => {
    const r = searchArtworks(corpus, { system: "sandTraveler" });
    expect(r.length).toBe(2);
    expect(r.every((x) => x.artwork.shaderGraph.system === "sandTraveler")).toBe(true);
  });

  it("filters by palette facet", () => {
    const r = searchArtworks(corpus, { palette: "bone" });
    expect(r.length).toBe(2);
  });

  it("sort=newest puts latest first", () => {
    const r = searchArtworks(corpus, { sort: "newest" });
    expect(r.map((x) => x.artwork.id)).toEqual(["delta", "gamma", "beta", "alpha"]);
  });

  it("sort=oldest puts earliest first", () => {
    const r = searchArtworks(corpus, { sort: "oldest" });
    expect(r.map((x) => x.artwork.id)).toEqual(["alpha", "beta", "gamma", "delta"]);
  });

  it("sort=most-reacted respects provided totals", () => {
    const totals = new Map([["alpha", 10], ["beta", 5], ["gamma", 20], ["delta", 0]]);
    const r = searchArtworks(corpus, { sort: "most-reacted" }, totals);
    expect(r.map((x) => x.artwork.id)).toEqual(["gamma", "alpha", "beta", "delta"]);
  });

  it("AND-combines text + facets", () => {
    const r = searchArtworks(corpus, { q: "sand", system: "sandTraveler", palette: "bone" });
    expect(r.map((x) => x.artwork.id)).toEqual(["delta"]);
  });
});

describe("similarArtworks — Stage 21", () => {
  it("ranks same-medium closest first", () => {
    const target = makeArtwork({
      id: "t",
      audioDNA: {
        tempo: 100, key: "C", mode: "major",
        brightness: 0.2, warmth: 0.3, texture: 0.4,
        energy: 0.5, aggression: 0.5, complexity: 0.5,
        motion: 0.5, entropy: 0.5,
      },
    });
    const close = makeArtwork({
      id: "close",
      audioDNA: { ...target.audioDNA, brightness: 0.21, warmth: 0.31 },
    });
    const far = makeArtwork({
      id: "far",
      audioDNA: {
        tempo: 140, key: "F#", mode: "minor",
        brightness: 0.9, warmth: 0.9, texture: 0.9,
        energy: 0.9, aggression: 0.9, complexity: 0.9,
        motion: 0.9, entropy: 0.9,
      },
    });
    const r = similarArtworks(target, [far, close]);
    expect(r.map((a) => a.id)).toEqual(["close", "far"]);
  });

  it("excludes the target itself", () => {
    const target = makeArtwork({ id: "t" });
    const other = makeArtwork({ id: "o" });
    const r = similarArtworks(target, [target, other]);
    expect(r.map((a) => a.id)).toEqual(["o"]);
  });

  it("ranks visual candidates by visualDNA distance", () => {
    const target = makeArtwork({
      id: "t",
      visualDNA: {
        ...DUMMY_VISUAL,
        brightness: 0.5, contrast: 0.5, warmth: 0.5,
        compositionalCenter: { x: 0.5, y: 0.5 },
      },
    });
    const close = makeArtwork({
      id: "close",
      visualDNA: {
        ...DUMMY_VISUAL,
        brightness: 0.51, contrast: 0.51, warmth: 0.5,
        compositionalCenter: { x: 0.5, y: 0.5 },
      },
    });
    const far = makeArtwork({
      id: "far",
      visualDNA: {
        ...DUMMY_VISUAL,
        brightness: 0, contrast: 0, warmth: 0,
        compositionalCenter: { x: 0, y: 0 },
      },
    });
    const r = similarArtworks(target, [far, close]);
    expect(r.map((a) => a.id)).toEqual(["close", "far"]);
  });

  it("cross-medium candidates sort to the bottom", () => {
    const target = makeArtwork({ id: "t" }); // audio-only
    const visualCandidate = makeArtwork({
      id: "v",
      visualDNA: {
        ...DUMMY_VISUAL,
        brightness: 0.5, contrast: 0.5, warmth: 0.5,
      },
    });
    const audioFar = makeArtwork({
      id: "audio-far",
      audioDNA: {
        tempo: 200, key: "F", mode: "minor",
        brightness: 1, warmth: 1, texture: 1,
        energy: 1, aggression: 1, complexity: 1,
        motion: 1, entropy: 1,
      },
    });
    const r = similarArtworks(target, [visualCandidate, audioFar]);
    expect(r[0].id).toBe("audio-far");
    expect(r[1].id).toBe("v");
  });
});