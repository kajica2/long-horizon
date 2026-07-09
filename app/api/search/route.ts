/**
 * /api/search — Stage 21 discovery API.
 *
 * GET /api/search?q=<text>&system=<s>&palette=<p>&source=<s>&sort=<s>&limit=<n>
 *   → { results: Array<{ id, title, creator, system, palette, source, createdAt }> }
 *
 * Designed for incremental search-as-you-type from a future client.
 * Returns lightweight metadata only (no full Artwork JSON) — caller fetches
 * the full Artwork by id when they want the shareable page.
 */

import { NextRequest, NextResponse } from "next/server";
import { listArtworks } from "@/lib/artwork-store";
import { searchArtworks, sourceOf, type SearchSource } from "@/lib/discovery";
import { countReactionsForArtworks } from "@/lib/reaction-store";
import type { LivingSystemName } from "@/lib/types";

export const dynamic = "force-dynamic";

const VALID_SOURCES: ReadonlyArray<SearchSource> = [
  "audio", "visual", "planetary", "birth", "classic",
];
const VALID_SORTS = ["newest", "oldest", "most-reacted"] as const;

export async function GET(req: NextRequest) {
  const sp = req.nextUrl.searchParams;
  const q = sp.get("q") ?? "";
  const system = sp.get("system");
  const palette = sp.get("palette");
  const source = sp.get("source");
  const sort = sp.get("sort") ?? "newest";
  const limitRaw = parseInt(sp.get("limit") ?? "20", 10);
  const limit = Math.max(1, Math.min(100, isNaN(limitRaw) ? 20 : limitRaw));

  if (!VALID_SORTS.includes(sort as (typeof VALID_SORTS)[number])) {
    return NextResponse.json({ error: "invalid sort" }, { status: 400 });
  }
  const sourceFilter =
    source && (VALID_SOURCES as ReadonlyArray<string>).includes(source)
      ? (source as SearchSource)
      : undefined;
  const systemFilter =
    system && (system in SYSTEM_LABELS) ? (system as LivingSystemName) : undefined;

  const all = await listArtworks({ limit: 200 }).catch(() => []);
  const totals = await countReactionsForArtworks(all.map((a) => a.id));
  const results = searchArtworks(
    all,
    {
      q,
      system: systemFilter,
      palette: palette ?? undefined,
      source: sourceFilter,
      sort: sort as (typeof VALID_SORTS)[number],
    },
    totals,
  );

  const trimmed = results.slice(0, limit).map((r) => ({
    id: r.artwork.id,
    title: r.artwork.title ?? r.artwork.id,
    creator: r.artwork.creator,
    system: r.artwork.shaderGraph.system,
    palette: r.artwork.shaderGraph.palette,
    source: sourceOf(r.artwork),
    createdAt: r.artwork.createdAt,
    score: r.score,
  }));

  return NextResponse.json({ results: trimmed });
}

const SYSTEM_LABELS: Record<LivingSystemName, string> = {
  flowFieldMeditation: "flowFieldMeditation",
  cosmicFilaments: "cosmicFilaments",
  sandTraveler: "sandTraveler",
  deJongAttractor: "deJongAttractor",
  birthChart: "birthChart",
  reactionDiffusion: "reactionDiffusion",
  lorenzAttractor: "lorenzAttractor",
  physarum: "physarum",
};