/**
 * /c/[slug] — public collection page.
 *
 * A collection is a curated, ordered set of artworks. URL is the slug.
 * Server-rendered. Renders header (title, description, curator), then
 * the ordered artwork grid (reusing ArtworkTile). Each artwork tile
 * links to /a/[id] like the gallery does.
 */

import Link from "next/link";
import { notFound } from "next/navigation";
import { getCollectionBySlug } from "@/lib/collection-store";
import { listArtworks } from "@/lib/artwork-store";
import { ArtworkTile } from "@/components/gallery/ArtworkTile";
import type { Artwork, LivingSystemName } from "@/lib/types";

export const dynamic = "force-dynamic";

type Source = "audio" | "visual" | "planetary" | "birth" | "classic";

function sourceOf(a: Artwork): Source {
  if (a.birthChart) return "birth";
  if (a.planetaryDNA && !a.visualDNA) return "planetary";
  if (a.visualDNA) return "visual";
  if (a.shaderGraph.system === "sandTraveler" || a.shaderGraph.system === "deJongAttractor") {
    return "classic";
  }
  return "audio";
}

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

const SOURCE_DESCRIPTIONS: Record<Source, string> = {
  audio: "Audio → DNA",
  visual: "Image → DNA",
  planetary: "Moment → DNA",
  birth: "Birth chart",
  classic: "Procedural",
};

export default async function CollectionPage({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const { slug } = await params;
  const collection = await getCollectionBySlug(slug);
  if (!collection) notFound();

  // Resolve artworks in one shot, preserving the collection's order.
  const all = await listArtworks({ limit: 200 }).catch(() => [] as Artwork[]);
  const byId = new Map(all.map((a) => [a.id, a]));
  const orderedArtworks: Artwork[] = collection.items
    .map((it) => byId.get(it.artworkId))
    .filter((a): a is Artwork => Boolean(a));

  return (
    <main className="relative min-h-screen bg-aurora">
      <div className="mx-auto max-w-7xl px-6 py-10">
        <header className="mb-16 flex items-center justify-between">
          <Link
            href="/gallery"
            className="text-xs tracking-[0.3em] uppercase text-foreground-muted transition-base hover:text-foreground"
          >
            ← Gallery
          </Link>
          <span className="text-xs tracking-[0.3em] uppercase text-foreground-subtle">
            Collection
          </span>
        </header>

        <div className="mb-12 max-w-3xl">
          <p className="mb-4 text-xs tracking-[0.3em] uppercase text-foreground-subtle">
            Curated by {collection.curator}
          </p>
          <h1 className="mb-4 text-5xl font-light tracking-tight">
            {collection.title}
          </h1>
          <p className="max-w-2xl text-base leading-relaxed text-foreground-muted">
            {collection.description}
          </p>
          <p className="mt-4 text-xs text-foreground-subtle">
            {orderedArtworks.length} {orderedArtworks.length === 1 ? "piece" : "pieces"}
          </p>
        </div>

        {orderedArtworks.length === 0 ? (
          <div className="rounded-2xl border border-dashed border-border p-12 text-center">
            <p className="text-sm text-foreground-muted">
              This collection&apos;s artworks are not currently available.
            </p>
          </div>
        ) : (
          <div className="grid gap-6 md:grid-cols-2 lg:grid-cols-3">
            {orderedArtworks.map((a, idx) => {
              const src = sourceOf(a);
              return (
                <div key={a.id} className="relative">
                  <span className="absolute -top-3 -left-3 z-10 inline-flex h-7 w-7 items-center justify-center rounded-full border border-border bg-background font-mono text-[11px] text-foreground-subtle">
                    {String(idx + 1).padStart(2, "0")}
                  </span>
                  <ArtworkTile
                    artwork={a}
                    source={src}
                    sourceDescription={SOURCE_DESCRIPTIONS[src]}
                    systemLabel={SYSTEM_LABELS[a.shaderGraph.system]}
                    systemDescription={SYSTEM_DESCRIPTIONS[a.shaderGraph.system]}
                  />
                </div>
              );
            })}
          </div>
        )}
      </div>
    </main>
  );
}