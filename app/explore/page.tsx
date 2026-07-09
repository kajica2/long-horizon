/**
 * /explore — Stage 21 discovery page.
 *
 * Server-rendered. URL params drive everything:
 *   ?q=<text>            full-text across title/creator/id
 *   ?system=<livingSystem>
 *   ?palette=<paletteName>
 *   ?source=audio|visual|planetary|birth|classic
 *   ?sort=newest|oldest|most-reacted|similar&seed=<artworkId>
 *
 * "Similar" mode requires a `seed` artwork id; we rank by DNA distance.
 */

import Link from "next/link";
import { listArtworks } from "@/lib/artwork-store";
import { countReactionsForArtworks } from "@/lib/reaction-store";
import { searchArtworks, similarArtworks, sourceOf } from "@/lib/discovery";
import { ArtworkTile } from "@/components/gallery/ArtworkTile";
import type { Artwork, LivingSystemName } from "@/lib/types";

export const dynamic = "force-dynamic";

const SYSTEM_LABELS: Record<LivingSystemName, string> = {
  flowFieldMeditation: "Flow Field",
  cosmicFilaments: "Filaments",
  sandTraveler: "Sand",
  deJongAttractor: "de Jong",
  birthChart: "Wheel",
  reactionDiffusion: "Reaction",
  lorenzAttractor: "Lorenz",
  physarum: "Slime Mold",
};

const SYSTEM_DESCRIPTIONS: Record<LivingSystemName, string> = {
  flowFieldMeditation: "Curl-noise particles",
  cosmicFilaments: "Planetary line ribbons",
  sandTraveler: "Tarbell 2004",
  deJongAttractor: "Tarbell 2004",
  birthChart: "Placidus + 5 aspects",
  reactionDiffusion: "Gray-Scott Turing patterns",
  lorenzAttractor: "Lorenz 1963 strange attractor",
  physarum: "Agent-based slime mold self-organization",
};

const SOURCE_DESCRIPTIONS: Record<string, string> = {
  audio: "Audio → DNA",
  visual: "Image → DNA",
  planetary: "Moment → DNA",
  birth: "Birth chart",
  classic: "Procedural",
};

const VALID_SORTS = ["newest", "oldest", "most-reacted", "similar"] as const;
type Sort = (typeof VALID_SORTS)[number];
const VALID_SOURCES = ["audio", "visual", "planetary", "birth", "classic"] as const;

function isSort(v: string | undefined): v is Sort {
  return VALID_SORTS.includes(v as Sort);
}
function isSource(v: string | undefined): v is (typeof VALID_SOURCES)[number] {
  return VALID_SOURCES.includes(v as (typeof VALID_SOURCES)[number]);
}
function isSystem(v: string | undefined): v is LivingSystemName {
  return v !== undefined && v in SYSTEM_LABELS;
}

function uniq<T>(xs: T[]): T[] {
  return Array.from(new Set(xs));
}

export default async function ExplorePage({
  searchParams,
}: {
  searchParams: Promise<{
    q?: string;
    system?: string;
    palette?: string;
    source?: string;
    sort?: string;
    seed?: string;
  }>;
}) {
  const params = await searchParams;
  const q = params.q ?? "";
  const sort: Sort = isSort(params.sort) ? params.sort : "newest";
  const source = isSource(params.source) ? params.source : undefined;
  const system = isSystem(params.system) ? params.system : undefined;
  const palette = params.palette;
  const seedId = params.seed;

  let artworks: Artwork[] = [];
  try {
    artworks = await listArtworks({ limit: 200 });
  } catch {
    return (
      <main className="relative min-h-screen bg-aurora">
        <div className="mx-auto max-w-6xl px-6 py-20 text-center">
          <p className="text-sm text-foreground-muted">Database unavailable. Run npm run db:seed.</p>
        </div>
      </main>
    );
  }

  const reactionTotals = await countReactionsForArtworks(artworks.map((a) => a.id));

  // Compute available facets from the full set (so chips don't disappear when filter narrows)
  const sources = uniq(artworks.map(sourceOf));
  const palettes = uniq(artworks.map((a) => a.shaderGraph.palette));
  const systems = uniq(artworks.map((a) => a.shaderGraph.system));

  // Similar-mode short-circuits: rank by DNA distance to the seed artwork.
  let displayArtworks: Artwork[];
  let modeLabel: string;
  if (sort === "similar" && seedId) {
    const seed = artworks.find((a) => a.id === seedId);
    if (seed) {
      const ranked = similarArtworks(seed, artworks, 24);
      // Re-apply text/palette/system filters on top of ranking.
      displayArtworks = applyFacets(ranked, { q, system, palette, source });
      modeLabel = `Similar to ${seed.title ?? seed.id}`;
    } else {
      displayArtworks = [];
      modeLabel = `Seed artwork not found`;
    }
  } else {
    const results = searchArtworks(
      artworks,
      { q, system, palette, source, sort },
      reactionTotals,
    );
    displayArtworks = results.map((r) => r.artwork);
    modeLabel = sortLabel(sort, q);
  }

  const filterUrl = (overrides: Record<string, string | undefined>): string => {
    const merged = { q, system, palette, source, sort, seed: seedId, ...overrides };
    const sp = new URLSearchParams();
    for (const [k, v] of Object.entries(merged)) {
      if (v && v.length > 0) sp.set(k, v);
    }
    const s = sp.toString();
    return s ? `/explore?${s}` : "/explore";
  };

  return (
    <main className="relative min-h-screen bg-aurora">
      <div className="mx-auto max-w-7xl px-6 py-10">
        <header className="mb-12 flex items-center justify-between">
          <Link
            href="/gallery"
            className="text-xs tracking-[0.3em] uppercase text-foreground-muted transition-base hover:text-foreground"
          >
            ← Gallery
          </Link>
          <span className="text-xs tracking-[0.3em] uppercase text-foreground-subtle">
            Explore
          </span>
        </header>

        <div className="mb-12">
          <p className="mb-4 text-xs tracking-[0.3em] uppercase text-foreground-subtle">
            Discovery
          </p>
          <h1 className="mb-3 text-4xl font-light tracking-tight">
            {displayArtworks.length} {displayArtworks.length === 1 ? "piece" : "pieces"} — {modeLabel}
          </h1>
          <p className="max-w-xl text-sm text-foreground-muted">
            Search across the whole gallery, or rank by DNA distance to a seed.
          </p>
        </div>

        {/* Search form */}
        <form action="/explore" method="GET" className="mb-10 flex gap-2">
          <input
            type="text"
            name="q"
            defaultValue={q}
            placeholder="title, creator, id…"
            className="flex-1 rounded-md border border-border bg-background/40 px-4 py-2 text-sm text-foreground placeholder:text-foreground-subtle focus:border-border-strong focus:outline-none"
          />
          {system && <input type="hidden" name="system" value={system} />}
          {palette && <input type="hidden" name="palette" value={palette} />}
          {source && <input type="hidden" name="source" value={source} />}
          <button
            type="submit"
            className="rounded-md border border-border bg-foreground/5 px-4 py-2 text-xs tracking-[0.2em] uppercase text-foreground transition-base hover:border-border-strong"
          >
            Search
          </button>
        </form>

        {/* Sort chips */}
        <div className="mb-4 flex flex-wrap items-center gap-2">
          <p className="mr-2 text-[10px] tracking-[0.2em] uppercase text-foreground-subtle">Sort</p>
          {VALID_SORTS.map((s) => (
            <Link
              key={s}
              href={filterUrl({ sort: s, seed: s === "similar" ? seedId : undefined })}
              className={
                "rounded-full border px-3 py-1 text-xs capitalize transition-base " +
                (sort === s
                  ? "border-border-strong bg-foreground/10 text-foreground"
                  : "border-border text-foreground-muted hover:border-border-strong hover:text-foreground")
              }
            >
              {s.replace("-", " ")}
            </Link>
          ))}
        </div>

        {/* Filter chips: source */}
        <div className="mb-4 flex flex-wrap items-center gap-2">
          <p className="mr-2 text-[10px] tracking-[0.2em] uppercase text-foreground-subtle">Source</p>
          <Link
            href={filterUrl({ source: undefined })}
            className={
              "rounded-full border px-3 py-1 text-xs transition-base " +
              (!source
                ? "border-border-strong bg-foreground/10 text-foreground"
                : "border-border text-foreground-muted hover:border-border-strong hover:text-foreground")
            }
          >
            all
          </Link>
          {sources.map((s) => (
            <Link
              key={s}
              href={filterUrl({ source: source === s ? undefined : s })}
              className={
                "rounded-full border px-3 py-1 text-xs transition-base " +
                (source === s
                  ? "border-border-strong bg-foreground/10 text-foreground"
                  : "border-border text-foreground-muted hover:border-border-strong hover:text-foreground")
              }
            >
              {s}
            </Link>
          ))}
        </div>

        {/* Filter chips: system */}
        <div className="mb-4 flex flex-wrap items-center gap-2">
          <p className="mr-2 text-[10px] tracking-[0.2em] uppercase text-foreground-subtle">System</p>
          <Link
            href={filterUrl({ system: undefined })}
            className={
              "rounded-full border px-3 py-1 text-xs transition-base " +
              (!system
                ? "border-border-strong bg-foreground/10 text-foreground"
                : "border-border text-foreground-muted hover:border-border-strong hover:text-foreground")
            }
          >
            all
          </Link>
          {systems.map((sn) => (
            <Link
              key={sn}
              href={filterUrl({ system: system === sn ? undefined : sn })}
              className={
                "rounded-full border px-3 py-1 text-xs transition-base " +
                (system === sn
                  ? "border-border-strong bg-foreground/10 text-foreground"
                  : "border-border text-foreground-muted hover:border-border-strong hover:text-foreground")
              }
            >
              {SYSTEM_LABELS[sn]}
            </Link>
          ))}
        </div>

        {/* Filter chips: palette */}
        <div className="mb-10 flex flex-wrap items-center gap-2">
          <p className="mr-2 text-[10px] tracking-[0.2em] uppercase text-foreground-subtle">Palette</p>
          <Link
            href={filterUrl({ palette: undefined })}
            className={
              "rounded-full border px-3 py-1 text-xs transition-base " +
              (!palette
                ? "border-border-strong bg-foreground/10 text-foreground"
                : "border-border text-foreground-muted hover:border-border-strong hover:text-foreground")
            }
          >
            all
          </Link>
          {palettes.map((p) => (
            <Link
              key={p}
              href={filterUrl({ palette: palette === p ? undefined : p })}
              className={
                "rounded-full border px-3 py-1 text-xs transition-base " +
                (palette === p
                  ? "border-border-strong bg-foreground/10 text-foreground"
                  : "border-border text-foreground-muted hover:border-border-strong hover:text-foreground")
              }
            >
              {p}
            </Link>
          ))}
        </div>

        {(q || system || palette || source || sort !== "newest") && (
          <div className="mb-8">
            <Link href="/explore" className="text-[10px] tracking-[0.2em] uppercase text-aurora-cyan transition-base hover:underline">
              ✕ Clear all
            </Link>
          </div>
        )}

        {displayArtworks.length === 0 ? (
          <div className="rounded-2xl border border-dashed border-border p-12 text-center">
            <p className="text-sm text-foreground-muted">
              No artworks match these filters. <Link href="/explore" className="text-aurora-cyan hover:underline">Clear filters</Link>.
            </p>
          </div>
        ) : (
          <div className="grid gap-6 md:grid-cols-2 lg:grid-cols-3">
            {displayArtworks.map((a) => {
              const src = sourceOf(a);
              return (
                <ArtworkTile
                  key={a.id}
                  artwork={a}
                  source={src}
                  sourceDescription={SOURCE_DESCRIPTIONS[src] ?? ""}
                  systemLabel={SYSTEM_LABELS[a.shaderGraph.system]}
                  systemDescription={SYSTEM_DESCRIPTIONS[a.shaderGraph.system]}
                />
              );
            })}
          </div>
        )}
      </div>
    </main>
  );
}

function sortLabel(sort: Sort, q: string): string {
  if (q.length > 0) return `matching “${q}”`;
  switch (sort) {
    case "newest": return "newest first";
    case "oldest": return "oldest first";
    case "most-reacted": return "most hearts";
    case "similar": return "similar";
  }
}

function applyFacets(
  artworks: Artwork[],
  facets: { q: string; system?: LivingSystemName; palette?: string; source?: string },
): Artwork[] {
  const q = facets.q.toLowerCase().trim();
  const tokens = q.length > 0 ? q.split(/\s+/) : [];
  return artworks.filter((a) => {
    if (facets.system && a.shaderGraph.system !== facets.system) return false;
    if (facets.palette && a.shaderGraph.palette !== facets.palette) return false;
    if (facets.source && sourceOf(a) !== facets.source) return false;
    if (tokens.length > 0) {
      const hay = `${a.id} ${a.creator} ${a.title ?? ""}`.toLowerCase();
      for (const t of tokens) {
        if (!hay.includes(t)) return false;
      }
    }
    return true;
  });
}