/**
 * Variant resolver — bridges variant ids (e.g. `demo-driftwav--morning`)
 * to full Artwork objects.
 *
 * /engine/[id] and /a/[id] call resolveArtwork(id). If id matches the
 * variant pattern, we fetch the parent Artwork and apply the mood.
 * Otherwise we just fetch by id.
 *
 * Cache: parent Artwork fetched via getArtwork() (which uses the same
 * Prisma store). Variant object is a pure function of parent + mood, so
 * no caching needed — applyMood is cheap and deterministic.
 */

import { getArtwork } from "@/lib/artwork-store";
import { applyMood, parseVariantId } from "@/lib/moods";
import type { Artwork } from "@/lib/types";

export async function resolveArtwork(id: string): Promise<Artwork | null> {
  const variant = parseVariantId(id);
  if (variant) {
    const parent = await getArtwork(variant.parentId);
    if (!parent) return null;
    return applyMood(parent, variant.mood);
  }
  return getArtwork(id);
}

/**
 * True if the id has the variant suffix `--mood` form. Cheap string check.
 */
export function isVariantId(id: string): boolean {
  return parseVariantId(id) !== null;
}