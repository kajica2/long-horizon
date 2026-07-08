/**
 * Palette name mapping — browser-safe.
 *
 * Splits the paletteNameFromVisualDNA logic out of lib/visual/dna.ts so
 * that client components can use it without pulling in `sharp` (which
 * uses Node-only modules like `child_process` and `fs`).
 */

import type { PaletteName, VisualDNA } from "@/lib/types";

/**
 * Map a VisualDNA's dominant palette index to a known engine palette name.
 *
 * Pure JS, no native modules — safe to import from client components.
 */
export function paletteNameFromVisualDNA(dna: VisualDNA): PaletteName {
  const hex = dna.palette[0];
  const r = parseInt(hex.slice(1, 3), 16);
  const g = parseInt(hex.slice(3, 5), 16);
  const b = parseInt(hex.slice(5, 7), 16);
  const max = Math.max(r, g, b);
  const min = Math.min(r, g, b);
  const lum = (r + g + b) / 765;
  const warmth = (r - b) / 255;

  if (max === r && r > g && r > b) {
    return warmth > 0.2 ? "ember" : "tide";
  }
  if (max === g) {
    return "aurora";
  }
  if (max === b) {
    return lum < 0.4 ? "ink" : "aurora";
  }
  if (lum < 0.2) return "ink";
  if (lum > 0.85) return "bone";
  return warmth > 0 ? "ember" : "tide";
}
