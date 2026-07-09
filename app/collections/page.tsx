/**
 * /collections — public list of all curated collections.
 *
 * Server-rendered. Each row shows title, curator, description,
 * and item count. Click through to /c/[slug].
 */

import Link from "next/link";
import { listCollections } from "@/lib/collection-store";
import { prisma } from "@/lib/db";

export const dynamic = "force-dynamic";

export default async function CollectionsIndex() {
  const collections = await listCollections().catch(() => []);
  const counts = await prisma.collectionItem
    .groupBy({
      by: ["collectionId"],
      _count: { _all: true },
    })
    .catch(() => [] as Array<{ collectionId: string; _count: { _all: number } }>);
  const countMap = new Map(counts.map((c) => [c.collectionId, c._count._all]));

  return (
    <main className="relative min-h-screen bg-aurora">
      <div className="mx-auto max-w-5xl px-6 py-10">
        <header className="mb-16 flex items-center justify-between">
          <Link
            href="/gallery"
            className="text-xs tracking-[0.3em] uppercase text-foreground-muted transition-base hover:text-foreground"
          >
            ← Gallery
          </Link>
          <span className="text-xs tracking-[0.3em] uppercase text-foreground-subtle">
            Collections
          </span>
        </header>

        <div className="mb-12">
          <p className="mb-4 text-xs tracking-[0.3em] uppercase text-foreground-subtle">
            Curated
          </p>
          <h1 className="mb-3 text-4xl font-light tracking-tight">
            {collections.length} {collections.length === 1 ? "collection" : "collections"}
          </h1>
          <p className="max-w-xl text-sm text-foreground-muted">
            Each collection is an ordered set of artworks, hand-grouped by source,
            system, palette, or curator.
          </p>
        </div>

        {collections.length === 0 ? (
          <div className="rounded-2xl border border-dashed border-border p-12 text-center">
            <p className="text-sm text-foreground-muted">No collections yet.</p>
          </div>
        ) : (
          <ul className="divide-y divide-border">
            {collections.map((c) => {
              const count = countMap.get(c.id) ?? 0;
              return (
                <li key={c.id} className="group">
                  <Link
                    href={`/c/${c.slug}`}
                    className="block py-6 transition-base hover:opacity-90"
                  >
                    <div className="flex items-baseline justify-between gap-4">
                      <h2 className="text-2xl font-light tracking-tight group-hover:text-aurora-cyan">
                        {c.title}
                      </h2>
                      <span className="font-mono text-xs text-foreground-subtle">
                        {count} {count === 1 ? "piece" : "pieces"}
                      </span>
                    </div>
                    <p className="mt-1 text-[10px] tracking-[0.3em] uppercase text-foreground-subtle">
                      Curated by {c.curator}
                    </p>
                    <p className="mt-2 max-w-2xl text-sm text-foreground-muted">
                      {c.description}
                    </p>
                  </Link>
                </li>
              );
            })}
          </ul>
        )}
      </div>
    </main>
  );
}