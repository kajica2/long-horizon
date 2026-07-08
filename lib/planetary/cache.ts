/**
 * PlanetaryDNA cache — keyed by ISO timestamp.
 * Same pattern as the audio cache: in-memory + DB persistence.
 */

import type { PlanetaryDNA } from "../types";
import { computePlanetaryDNA } from "./compute";

const cache = new Map<string, PlanetaryDNA>();

export type ComputeResult = {
  dna: PlanetaryDNA;
  cached: boolean;
};

export function getPlanetaryDNA(timestamp?: string | Date): ComputeResult {
  const dna = computePlanetaryDNA(timestamp);
  const key = dna.timestamp;

  const existing = cache.get(key);
  if (existing) {
    return { dna: existing, cached: true };
  }

  cache.set(key, dna);
  return { dna, cached: false };
}

export function clearPlanetaryCache(): void {
  cache.clear();
}

export function getPlanetaryCacheSize(): number {
  return cache.size;
}