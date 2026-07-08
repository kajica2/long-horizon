/**
 * Hashing utilities for the Artwork reproducibility contract.
 *
 * Source of truth: engine scoping doc Section 2 (Hashing for on-chain).
 *
 * Note: this is server-side (Node) only — uses node:crypto.
 * For browser hashing, import from lib/hash-web.ts (added in Stage 5).
 */

import { createHash } from "node:crypto";
import type { Artwork, AudioDNA, PlanetaryDNA, ShaderGraph } from "./types";

/**
 * Canonical JSON serialization with sorted keys.
 * Required so the same logical object always produces the same hash.
 */
export function canonicalJson(value: unknown): string {
  if (value === null || typeof value !== "object") return JSON.stringify(value);
  if (Array.isArray(value)) {
    return "[" + value.map(canonicalJson).join(",") + "]";
  }
  const keys = Object.keys(value as Record<string, unknown>).sort();
  const parts = keys.map((k) => {
    const v = (value as Record<string, unknown>)[k];
    return JSON.stringify(k) + ":" + canonicalJson(v);
  });
  return "{" + parts.join(",") + "}";
}

export function sha256Hex(input: string): string {
  return createHash("sha256").update(input).digest("hex");
}

export function audioDNAHash(dna: AudioDNA): string {
  return sha256Hex(canonicalJson(dna));
}

export function planetaryDNAHash(dna: PlanetaryDNA): string {
  return sha256Hex(canonicalJson(dna));
}

export function shaderGraphHash(graph: ShaderGraph): string {
  return sha256Hex(canonicalJson(graph));
}

/**
 * artworkHash = sha256(seed + soundtrackHash + audioDNAHash + planetaryDNAHash? + shaderGraphHash)
 * This is the provenance anchor for the artwork. planetaryDNA is included
 * when present (planetary-genome artworks) and omitted from the hash input
 * when absent (audio-genome artworks with a placeholder AudioDNA).
 */
export function artworkHash(artwork: Artwork): string {
  const planetaryPart = artwork.planetaryDNA
    ? planetaryDNAHash(artwork.planetaryDNA)
    : "";
  const input =
    artwork.seed +
    artwork.soundtrack.hash +
    audioDNAHash(artwork.audioDNA) +
    planetaryPart +
    shaderGraphHash(artwork.shaderGraph);
  return sha256Hex(input);
}