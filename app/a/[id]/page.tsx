/**
 * /a/[id] — public shareable page for an artwork.
 *
 * - Reads the Artwork by id
 * - Loads the latest polaroid (if any) and shows it
 * - Shows the engine live if no polaroid exists (so the user can experience it)
 * - Metadata strip: title, system, palette, seed, hash, created
 * - "Remix" action: forks the artwork into a new draft in the viewer's library
 * - "Reflect" action: opens the journal editor
 *
 * No chrome. No nav. The artwork is the page.
 */

import Link from "next/link";
import { headers } from "next/headers";
import { getArtwork } from "@/lib/artwork-store";
import { artworkHash } from "@/lib/hash";
import { ShareableViewer } from "@/components/engine/ShareableViewer";

export const dynamic = "force-dynamic";

export default async function ShareableArtworkPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const artwork = await getArtwork(id);

  if (!artwork) {
    return (
      <main className="flex min-h-screen items-center justify-center bg-background text-foreground-muted">
        <div className="text-center">
          <p className="text-xs tracking-[0.3em] uppercase text-foreground-subtle mb-2">
            404
          </p>
          <p className="text-sm">This artwork doesn't exist.</p>
          <Link href="/" className="mt-4 inline-block text-xs text-accent hover:opacity-70">
            ← Back
          </Link>
        </div>
      </main>
    );
  }

  const hash = artworkHash(artwork);
  const isAudio = !!artwork.soundtrack?.url && artwork.soundtrack.url !== "";
  const isBirthChart = !!artwork.birthChart;
  const isPlanetary = !!artwork.planetaryDNA;

  // Derive the type label
  const inputType = isBirthChart
    ? "Birth chart"
    : isPlanetary
    ? "Planetary moment"
    : isAudio
    ? "Audio"
    : "Seed";

  // Server-side host detection (for OpenGraph)
  const h = await headers();
  const host = h.get("host") ?? "beatrender.local";

  return (
    <main className="relative min-h-screen overflow-hidden bg-background">
      {/* Top bar — minimal */}
      <header className="pointer-events-none absolute top-0 left-0 right-0 z-10 flex items-center justify-between p-6">
        <Link
          href="/"
          className="pointer-events-auto text-[10px] tracking-[0.3em] uppercase text-foreground-subtle transition-base hover:text-foreground"
        >
          ← BeatRender Genesis
        </Link>
        <p className="font-mono text-[10px] text-foreground-subtle">
          {hash.slice(0, 8)}…
        </p>
      </header>

      {/* The artwork itself — full-bleed canvas */}
      <div className="absolute inset-0">
        <ShareableViewer
          artworkId={artwork.id}
          seed={artwork.seed}
          shaderGraph={artwork.shaderGraph}
          birthChart={artwork.birthChart}
        />
      </div>

      {/* Bottom metadata strip */}
      <div className="pointer-events-none absolute bottom-0 left-0 right-0 z-10 flex flex-col gap-2 p-6 md:flex-row md:items-end md:justify-between">
        <div className="pointer-events-auto max-w-md rounded-2xl border border-border bg-background-glass/80 p-4 backdrop-blur">
          <p className="text-[10px] tracking-[0.25em] uppercase text-foreground-subtle">
            {inputType}  ·  {artwork.shaderGraph.system}
          </p>
          <h1 className="mt-1 text-2xl font-light text-foreground">
            {artwork.title ?? artwork.id}
          </h1>
          <div className="mt-3 grid grid-cols-2 gap-x-4 gap-y-1 text-[10px] text-foreground-muted">
            <span className="text-foreground-subtle">seed</span>
            <span className="font-mono">{artwork.seed.slice(0, 16)}…</span>
            <span className="text-foreground-subtle">palette</span>
            <span className="capitalize">{artwork.shaderGraph.palette}</span>
            <span className="text-foreground-subtle">camera</span>
            <span>{artwork.shaderGraph.camera}</span>
            <span className="text-foreground-subtle">hash</span>
            <span className="font-mono">{hash.slice(0, 16)}…</span>
          </div>
          {artwork.birthLocation && (
            <p className="mt-2 text-[10px] text-foreground-subtle">
              📍 {artwork.birthLocation.label}
            </p>
          )}
        </div>

        <div className="pointer-events-auto flex gap-2">
          <Link
            href={`/engine/${artwork.id}`}
            className="rounded-full border border-border bg-background-glass px-4 py-2 text-[11px] tracking-[0.15em] uppercase text-foreground backdrop-blur transition-base hover:border-border-strong hover:bg-background-glass-hover"
          >
            Open in engine
          </Link>
          <Link
            href={`/create?remix=${artwork.id}`}
            className="rounded-full border border-violet-500/40 bg-violet-500/10 px-4 py-2 text-[11px] tracking-[0.15em] uppercase text-violet-300 backdrop-blur transition-base hover:border-violet-500 hover:bg-violet-500/20"
          >
            Remix
          </Link>
        </div>
      </div>
    </main>
  );
}