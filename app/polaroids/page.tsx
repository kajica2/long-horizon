/**
 * /polaroids — Stage 22 polaroid wall.
 *
 * Public masonry grid of every captured polaroid across the gallery.
 * Each tile shows the polaroid PNG (lazy-loaded), title, system, and
 * the timestamp + hash. Clicking links to the artwork's shareable page.
 *
 * Reads from public/captures/ — same source as the polaroid API route.
 * Renders an empty-state card if no polaroids have been captured yet.
 */

import Link from "next/link";
import path from "node:path";
import { listAllPolaroids } from "@/lib/engine/polaroid-meta";

export const dynamic = "force-dynamic";

const CAPTURE_DIR = path.resolve("./public/captures");

export default async function PolaroidsWall() {
  const polaroids = await listAllPolaroids(CAPTURE_DIR);

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
            Polaroids
          </span>
        </header>

        <div className="mb-12">
          <p className="mb-4 text-xs tracking-[0.3em] uppercase text-foreground-subtle">
            Captured moments
          </p>
          <h1 className="mb-3 text-4xl font-light tracking-tight">
            {polaroids.length} {polaroids.length === 1 ? "polaroid" : "polaroids"}
          </h1>
          <p className="max-w-xl text-sm text-foreground-muted">
            Each polaroid is a single frame captured from a living system,
            stamped with the artwork&apos;s hash, seed, system, and palette.
            Capture one by opening any artwork and pressing the camera button.
          </p>
        </div>

        {polaroids.length === 0 ? (
          <div className="rounded-2xl border border-dashed border-border p-12 text-center">
            <p className="mb-4 text-sm text-foreground-muted">
              No polaroids captured yet.
            </p>
            <Link
              href="/gallery"
              className="inline-block rounded-md border border-border px-4 py-2 text-xs tracking-[0.2em] uppercase text-foreground transition-base hover:border-border-strong"
            >
              Browse artworks →
            </Link>
          </div>
        ) : (
          <div className="columns-1 gap-4 sm:columns-2 lg:columns-3 xl:columns-4">
            {polaroids.map((p) => (
              <Link
                key={p.polaroid}
                href={`/a/${p.artworkId}`}
                className="group mb-4 block break-inside-avoid overflow-hidden rounded-xl border border-border bg-background-elevated transition-base hover:border-border-strong"
              >
                <div className="bg-black/20">
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img
                    src={`/captures/${p.polaroid}`}
                    alt={`Polaroid of ${p.artworkId}`}
                    loading="lazy"
                    className="h-auto w-full"
                  />
                </div>
                <div className="p-3">
                  <p className="text-[10px] tracking-[0.2em] uppercase text-foreground-subtle">
                    {p.system} · {p.palette}
                  </p>
                  <p className="mt-1 text-sm text-foreground group-hover:text-aurora-cyan">
                    {p.artworkId}
                  </p>
                  <p className="mt-1 font-mono text-[10px] text-foreground-subtle">
                    {new Date(p.capturedAt).toLocaleString()} · {p.artworkHash.slice(0, 8)}
                  </p>
                </div>
              </Link>
            ))}
          </div>
        )}
      </div>
    </main>
  );
}