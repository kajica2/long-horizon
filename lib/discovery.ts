/**
 * Discovery helpers — Stage 21 of the Long Horizon roadmap.
 *
 * Two responsibilities:
 *   1. Text search across title / creator / id, with optional facet filters
 *      (system, palette, source).
 *   2. DNA-based "more like this" — given an Artwork's genome, rank all
 *      others by L2 distance over their numeric DNA vector. Used both
 *      on /a/[id] (Similar section) and as a Discover sort mode on /explore.
 *
 * DNA distance is computed only across fields that exist for both
 * candidates — audio-only vs visual-only artworks get an automatic
 * "different medium" boost via the system match, not by faking a distance.
 */

import type { Artwork, AudioDNA, VisualDNA, LivingSystemName } from "@/lib/types";

export interface SearchFacets {
  q?: string;
  system?: LivingSystemName;
  palette?: string;
  source?: SearchSource;
  sort?: SearchSort;
}

export type SearchSource = "audio" | "visual" | "planetary" | "birth" | "classic";
export type SearchSort = "newest" | "oldest" | "most-reacted" | "similar";

export interface SearchResult {
  artwork: Artwork;
  matched: boolean; // true if artwork passed q + facet filters
  score: number; // 0..1, higher = more relevant
  // For similar-sort: lower distance → higher score (already inverted).
  // For text: score = blend of q-match-strength + facet-match-strength.
}

export function searchArtworks(
  artworks: Artwork[],
  facets: SearchFacets,
  reactionTotals?: Map<string, number>,
): SearchResult[] {
  const q = (facets.q ?? "").trim().toLowerCase();
  const tokens = q.length > 0 ? q.split(/\s+/) : [];

  const filtered: SearchResult[] = [];
  for (const a of artworks) {
    const sourceMatch = !facets.source || sourceOf(a) === facets.source;
    const systemMatch = !facets.system || a.shaderGraph.system === facets.system;
    const paletteMatch = !facets.palette || a.shaderGraph.palette === facets.palette;

    let textScore = 0;
    if (tokens.length === 0) {
      textScore = 1;
    } else {
      const hay = `${a.id} ${a.creator} ${a.title ?? ""}`.toLowerCase();
      for (const t of tokens) {
        if (hay.includes(t)) textScore += 1;
      }
      textScore = textScore / tokens.length;
    }

    const matched =
      textScore > 0 && sourceMatch && systemMatch && paletteMatch;
    if (!matched) continue;

    const score = textScore; // facets don't add — they're filters
    filtered.push({ artwork: a, matched: true, score });
  }

  // Sort
  const sort = facets.sort ?? "newest";
  switch (sort) {
    case "newest":
      filtered.sort(
        (x, y) =>
          new Date(y.artwork.createdAt).getTime() -
          new Date(x.artwork.createdAt).getTime(),
      );
      break;
    case "oldest":
      filtered.sort(
        (x, y) =>
          new Date(x.artwork.createdAt).getTime() -
          new Date(y.artwork.createdAt).getTime(),
      );
      break;
    case "most-reacted":
      filtered.sort((x, y) => {
        const rx = reactionTotals?.get(x.artwork.id) ?? 0;
        const ry = reactionTotals?.get(y.artwork.id) ?? 0;
        return ry - rx;
      });
      break;
    case "similar":
      // Caller should use similarArtworks() instead — handled below.
      break;
  }
  return filtered;
}

export function sourceOf(a: Artwork): SearchSource {
  if (a.birthChart) return "birth";
  if (a.planetaryDNA && !a.visualDNA) return "planetary";
  if (a.visualDNA) return "visual";
  if (a.shaderGraph.system === "sandTraveler" || a.shaderGraph.system === "deJongAttractor") {
    return "classic";
  }
  return "audio";
}

// ============================================================
// DNA similarity — L2 distance over AudioDNA or VisualDNA vectors
// ============================================================

const AUDIO_NUMERIC_KEYS: Array<keyof AudioDNA> = [
  "tempo",
  "brightness",
  "warmth",
  "texture",
  "energy",
  "aggression",
  "complexity",
  "motion",
  "entropy",
];

// Tempo (BPM) lives in 0-200; AudioDNA's other features live in [0,1].
// Normalize tempo into [0,1] (assuming 200 BPM ceiling) before adding to
// the squared distance — otherwise a single tempo delta dominates.
const TEMPO_MAX = 200;

// We don't include "key" / "mode" in the distance — they're categorical.
// They're used as a small boost below to break ties between musically
// similar candidates.
const AUDIO_KEY_DISTANCE_BOOST = 0.05;

const VISUAL_NUMERIC_KEYS: Array<keyof VisualDNA> = [
  "brightness",
  "contrast",
  "saturation",
  "warmth",
  "edgeDensity",
  "textureComplexity",
  "focalDistance",
];

function audioDistance(a: AudioDNA, b: AudioDNA): number {
  let s = 0;
  for (const k of AUDIO_NUMERIC_KEYS) {
    const av = k === "tempo" ? a.tempo / TEMPO_MAX : (a[k] as number);
    const bv = k === "tempo" ? b.tempo / TEMPO_MAX : (b[k] as number);
    const d = av - bv;
    s += d * d;
  }
  // Categorical nudge: same key+mode → 0; else 1.
  const catPenalty = a.key === b.key && a.mode === b.mode ? 0 : 1;
  return Math.sqrt(s) + catPenalty * AUDIO_KEY_DISTANCE_BOOST;
}

function visualDistance(a: VisualDNA, b: VisualDNA): number {
  let s = 0;
  for (const k of VISUAL_NUMERIC_KEYS) {
    const d = (a[k] as number) - (b[k] as number);
    s += d * d;
  }
  // Composition center distance — small additive term so two images with
  // identical stats but different focal points still rank apart.
  const dx = a.compositionalCenter.x - b.compositionalCenter.x;
  const dy = a.compositionalCenter.y - b.compositionalCenter.y;
  s += (dx * dx + dy * dy) * 0.5;
  return Math.sqrt(s);
}

/**
 * Rank all candidates by similarity to `target`. Excludes the target itself.
 * Same-medium artworks dominate (audio→audio, visual→visual); cross-medium
 * candidates sort to the bottom but still appear if there's nothing closer.
 */
export function similarArtworks(
  target: Artwork,
  candidates: Artwork[],
  limit = 6,
): Artwork[] {
  const scored: Array<{ artwork: Artwork; distance: number }> = [];
  for (const c of candidates) {
    if (c.id === target.id) continue;
    let d = Number.POSITIVE_INFINITY;
    if (target.visualDNA && c.visualDNA) {
      d = visualDistance(target.visualDNA, c.visualDNA);
    } else if (!target.visualDNA && !c.visualDNA) {
      d = audioDistance(target.audioDNA, c.audioDNA);
    } else {
      // Cross-medium: large constant penalty so they sort last.
      // Use deterministic position-based tiebreak to keep order stable
      // across calls (the reproducibility contract says: same inputs
      // → same outputs, even for tiebreaks).
      d = 10 + candidates.indexOf(c) * 1e-6;
    }
    scored.push({ artwork: c, distance: d });
  }
  scored.sort((x, y) => x.distance - y.distance);
  return scored.slice(0, limit).map((s) => s.artwork);
}