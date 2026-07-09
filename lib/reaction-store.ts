/**
 * Reaction store — Stage 19 of the Long Horizon roadmap.
 *
 * Lightweight anonymous likes/hearts on shareable /a/[id] pages.
 * Mirrors comment-store.ts in spirit (no auth, anonymous by default), but
 * reactions are idempotent on (artworkId, likerId, kind) — one reaction
 * per visitor per artwork per kind. Toggle by re-posting toggles state.
 *
 * likerId is supplied by the client (an opaque session id stored in a
 * cookie). Server doesn't trust it beyond deduplication — if the client
 * lies, the worst they can do is inflate their own personal count.
 */

import { prisma } from "@/lib/db";

export type ReactionKind = "heart";

const DEFAULT_KIND: ReactionKind = "heart";
const MAX_LIKER_ID = 120;

export interface ReactionSummary {
  artworkId: string;
  kind: ReactionKind;
  total: number;
  hasReacted: boolean; // true if `likerId` already reacted
}

export interface ReactionInput {
  artworkId: string;
  likerId: string;
  kind?: ReactionKind;
}

/**
 * Toggle a reaction. Returns the resulting state:
 *   - `reacted: true` means the row now exists (total incremented)
 *   - `reacted: false` means the row was removed (total decremented)
 *
 * If the row didn't exist, it's created. If it did, it's deleted.
 * This lets a single endpoint back both "like" and "unlike" UIs.
 */
export async function toggleReaction(input: ReactionInput): Promise<{
  reacted: boolean;
  total: number;
  kind: ReactionKind;
}> {
  const likerId = (input.likerId ?? "").trim().slice(0, MAX_LIKER_ID) || "anonymous";
  const kind = input.kind ?? DEFAULT_KIND;

  if (!input.artworkId) throw new Error("artworkId required");

  const existing = await prisma.reaction.findUnique({
    where: {
      artworkId_likerId_kind: {
        artworkId: input.artworkId,
        likerId,
        kind,
      },
    },
  });

  if (existing) {
    await prisma.reaction.delete({ where: { id: existing.id } });
    const total = await prisma.reaction.count({
      where: { artworkId: input.artworkId, kind },
    });
    return { reacted: false, total, kind };
  }

  await prisma.reaction.create({
    data: {
      artworkId: input.artworkId,
      likerId,
      kind,
    },
  });
  const total = await prisma.reaction.count({
    where: { artworkId: input.artworkId, kind },
  });
  return { reacted: true, total, kind };
}

/**
 * Return total + `hasReacted` for the given (artworkId, likerId, kind).
 * Cheap: one count + one unique lookup.
 */
export async function getReactionSummary(
  artworkId: string,
  likerId: string | null,
  kind: ReactionKind = DEFAULT_KIND,
): Promise<ReactionSummary> {
  const safeLiker = (likerId ?? "").trim().slice(0, MAX_LIKER_ID) || null;
  const [total, hasReacted] = await Promise.all([
    prisma.reaction.count({ where: { artworkId, kind } }),
    safeLiker
      ? prisma.reaction
          .findUnique({
            where: {
              artworkId_likerId_kind: {
                artworkId,
                likerId: safeLiker,
                kind,
              },
            },
            select: { id: true },
          })
          .then((r) => r !== null)
      : Promise.resolve(false),
  ]);
  return { artworkId, kind, total, hasReacted };
}

/**
 * Bulk fetch totals for many artworks in one round-trip.
 * Used by /gallery + /a/[id] related list to show heart counts.
 */
export async function countReactionsForArtworks(
  artworkIds: string[],
  kind: ReactionKind = DEFAULT_KIND,
): Promise<Map<string, number>> {
  if (artworkIds.length === 0) return new Map();
  const grouped = await prisma.reaction.groupBy({
    by: ["artworkId"],
    where: { artworkId: { in: artworkIds }, kind },
    _count: { _all: true },
  });
  const map = new Map<string, number>();
  for (const row of grouped) map.set(row.artworkId, row._count._all);
  return map;
}

/**
 * Most-reacted artworks — for /explore or "Top hearts" tile.
 */
export async function topReactedArtworks(
  limit = 12,
  kind: ReactionKind = DEFAULT_KIND,
): Promise<Array<{ artworkId: string; total: number }>> {
  const grouped = await prisma.reaction.groupBy({
    by: ["artworkId"],
    where: { kind },
    _count: { _all: true },
    orderBy: { _count: { artworkId: "desc" } },
    take: limit,
  });
  return grouped.map((row: { artworkId: string; _count: { _all: number } }) => ({
    artworkId: row.artworkId,
    total: row._count._all,
  }));
}