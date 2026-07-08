/**
 * /a/[id] — public shareable page for an artwork.
 *
 * Layout (top-to-bottom):
 *   1. Top bar — site brand, share URL copy, hash, fullscreen toggle
 *   2. The artwork — full-bleed engine canvas (via ShareableViewer)
 *   3. Bottom metadata strip — title, system, source, deep metadata
 *   4. Below — genome reveal (expanded features of the input that made this piece)
 *   5. Related artworks — 3 tiles from the same system
 *
 * Source: server-rendered Artwork fetch.
 */

import Link from "next/link";
import { headers } from "next/headers";
import { getArtwork, listArtworks, getRemixChain } from "@/lib/artwork-store";
import { CommentThread } from "@/components/share/CommentThread";
import { artworkHash } from "@/lib/hash";
import { ShareableViewer } from "@/components/engine/ShareableViewer";
import type { Artwork } from "@/lib/types";

export const dynamic = "force-dynamic";

export default async function ShareableArtworkPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const artwork = await getArtwork(id);

  if (!artwork) return <NotFound />;

  const allArtworks = await listArtworks({ limit: 50 }).catch(() => [] as Artwork[]);
  const related = pickRelated(artwork, allArtworks);
  const remixChain = await getRemixChain(artwork.id).catch(() => [] as Artwork[]);

  const hash = artworkHash(artwork);
  const isAudio = !!artwork.soundtrack?.url && artwork.soundtrack.url !== "";
  const isBirthChart = !!artwork.birthChart;
  const isPlanetary = !!artwork.planetaryDNA;
  const isVisual = !!artwork.visualDNA;

  const inputType = isBirthChart
    ? "Birth chart"
    : isPlanetary
      ? "Planetary moment"
      : isVisual
        ? "Image"
        : isAudio
          ? "Audio"
          : "Seed";

  const sourceDescription = sourceDescriptionFor(artwork);

  const h = await headers();
  const host = h.get("host") ?? "beatrender.local";
  const proto = h.get("x-forwarded-proto") ?? "https";

  return (
    <main className="relative min-h-screen overflow-x-hidden bg-background text-foreground">
      {/* 1. Top bar */}
      <header className="pointer-events-none absolute top-0 left-0 right-0 z-20 flex items-center justify-between p-5 md:p-6">
        <Link
          href="/"
          className="pointer-events-auto text-[10px] tracking-[0.3em] uppercase text-foreground-subtle transition-base hover:text-foreground"
        >
          ← Long_Horizon
        </Link>
        <div className="pointer-events-auto flex items-center gap-3">
          <p className="hidden font-mono text-[10px] text-foreground-subtle md:block">
            {hash.slice(0, 8)}…
          </p>
          <a
            href={`/api/artworks/${artwork.id}/polaroid`}
            download={`${artwork.id}-polaroid.png`}
            className="text-[10px] tracking-[0.2em] uppercase text-foreground-subtle transition-base hover:text-foreground"
          >
            ↓ Polaroid
          </a>
          <a
            href={`/api/artworks/${artwork.id}/video`}
            download={`${artwork.id}-recording.webm`}
            className="text-[10px] tracking-[0.2em] uppercase text-foreground-subtle transition-base hover:text-foreground"
          >
            ↓ Video
          </a>
        </div>
      </header>

      {/* 2. The artwork — full-bleed canvas */}
      <section className="relative h-[100svh] min-h-[640px] w-full">
        <ShareableViewer
          artworkId={artwork.id}
          seed={artwork.seed}
          shaderGraph={artwork.shaderGraph}
          birthChart={artwork.birthChart}
        />
      </section>

      {/* 3. Bottom metadata strip */}
      <section className="relative bg-background px-5 py-12 md:px-12 md:py-20">
        <div className="mx-auto max-w-5xl">
          <div className="grid gap-12 md:grid-cols-[1.5fr_1fr]">
            {/* Title + genome summary */}
            <div>
              <p className="mb-3 text-[11px] tracking-[0.3em] uppercase text-foreground-subtle">
                {inputType}  ·  {artwork.shaderGraph.system}
              </p>
              <h1 className="text-4xl font-light leading-tight tracking-tight md:text-5xl">
                {artwork.title ?? artwork.id}
              </h1>
              <p className="mt-4 max-w-xl text-base text-foreground-muted">
                {sourceDescription}
              </p>

              {/* Genome reveal */}
              <div className="mt-8 grid grid-cols-2 gap-3 text-[10px] md:grid-cols-4">
                <Stat label="seed"     value={artwork.seed.slice(0, 12) + "…"} mono />
                <Stat label="palette"  value={artwork.shaderGraph.palette} capitalize />
                <Stat label="camera"   value={artwork.shaderGraph.camera} />
                <Stat label="hash"     value={hash.slice(0, 12) + "…"} mono />
              </div>

              {/* CTAs */}
              <div className="mt-10 flex flex-wrap gap-3">
                <Link
                  href={`/engine/${artwork.id}`}
                  className="rounded-full border border-foreground/30 bg-foreground/5 px-5 py-2.5 text-xs tracking-[0.2em] uppercase text-foreground transition-base hover:border-foreground hover:bg-foreground/10"
                >
                  Open in engine →
                </Link>
                <Link
                  href={`/create?remix=${artwork.id}`}
                  className="rounded-full border border-violet-500/40 bg-violet-500/10 px-5 py-2.5 text-xs tracking-[0.2em] uppercase text-violet-300 transition-base hover:border-violet-500 hover:bg-violet-500/20"
                >
                  Remix this artwork
                </Link>
                <a
                  href={`/gallery`}
                  className="rounded-full border border-border px-5 py-2.5 text-xs tracking-[0.2em] uppercase text-foreground-muted transition-base hover:border-border-strong hover:text-foreground"
                >
                  Browse gallery
                </a>
              </div>
            </div>

            {/* Genome features */}
            <div className="rounded-2xl border border-border bg-background-elevated/40 p-5 backdrop-blur">
              <p className="mb-3 text-[10px] tracking-[0.25em] uppercase text-aurora-cyan">
                Genome
              </p>
              {isVisual && artwork.visualDNA && <VisualDNAFeatures dna={artwork.visualDNA} />}
              {isAudio && !isVisual && <AudioDNAFeatures dna={artwork.audioDNA} />}
              {isPlanetary && !isVisual && !isAudio && artwork.planetaryDNA && (
                <PlanetaryDNAFeatures dna={artwork.planetaryDNA} />
              )}
              {isBirthChart && artwork.birthChart && <BirthChartFeatures chart={artwork.birthChart} />}
              {artwork.birthLocation && (
                <div className="mt-4 border-t border-border pt-3 text-[10px] text-foreground-subtle">
                  📍 {artwork.birthLocation.label}
                </div>
              )}
            </div>
          </div>
        </div>
      </section>

      {/* 4b. Remix chain (action 20) — lineage breadcrumb */}
      {remixChain.length > 1 && (
        <section className="bg-background px-5 py-10 md:px-12">
          <div className="mx-auto max-w-5xl">
            <p className="mb-4 text-[11px] tracking-[0.3em] uppercase text-foreground-subtle">
              Remix lineage
            </p>
            <div className="flex flex-wrap items-center gap-x-2 gap-y-2 text-sm">
              {remixChain.map((a, i) => (
                <span key={a.id} className="flex items-center gap-2">
                  {i > 0 && (
                    <span className="text-foreground-subtle">←</span>
                  )}
                  <Link
                    href={`/a/${a.id}`}
                    className={
                      "rounded-md border px-2.5 py-1 transition-base " +
                      (i === 0
                        ? "border-aurora-cyan/40 bg-aurora-cyan/10 text-aurora-cyan"
                        : "border-border bg-background-elevated/60 text-foreground-muted hover:border-border-strong hover:text-foreground")
                    }
                  >
                    <span className="font-mono text-[10px]">
                      {a.id.slice(0, 18)}…
                    </span>
                    {i > 0 && a.title && (
                      <span className="ml-2 text-[11px]">{a.title}</span>
                    )}
                  </Link>
                </span>
              ))}
              <span className="ml-2 font-mono text-[10px] text-foreground-subtle">
                depth {remixChain.length - 1}
              </span>
            </div>
          </div>
        </section>
      )}

      {/* 4. Related artworks */}
      {related.length > 0 && (
        <section className="bg-background-secondary px-5 py-12 md:px-12 md:py-20">
          <div className="mx-auto max-w-5xl">
            <p className="mb-6 text-[11px] tracking-[0.3em] uppercase text-foreground-subtle">
              Other artworks using {artwork.shaderGraph.system}
            </p>
            <div className="grid gap-4 md:grid-cols-3">
              {related.map((r) => (
                <Link
                  key={r.id}
                  href={`/a/${r.id}`}
                  className="group block overflow-hidden rounded-xl border border-border bg-background-elevated p-4 transition-base hover:border-border-strong"
                >
                  {r.visualDNA && (
                    <div className="mb-3 flex h-2 gap-px">
                      {r.visualDNA.palette.slice(0, 5).map((hex, i) => (
                        <div key={i} className="flex-1" style={{ background: hex }} />
                      ))}
                    </div>
                  )}
                  <p className="text-[10px] tracking-[0.2em] uppercase text-foreground-subtle">
                    {r.shaderGraph.system}
                  </p>
                  <p className="mt-1 text-sm text-foreground">{r.title ?? r.id}</p>
                  <p className="mt-1 text-xs text-foreground-subtle group-hover:text-foreground-muted">
                    {inputTypeOf(r)} →
                  </p>
                </Link>
              ))}
            </div>
          </div>
        </section>
      )}

      {/* 5. Comments (action 21) */}
      <section className="bg-background px-5 py-12 md:px-12 md:py-16">
        <div className="mx-auto max-w-3xl">
          <p className="mb-1 text-[11px] tracking-[0.3em] uppercase text-foreground-subtle">
            Field notes
          </p>
          <h2 className="mb-6 text-2xl font-light">Comments</h2>
          <CommentThread artworkId={artwork.id} />
        </div>
      </section>

      {/* 6. Footer */}
      <footer className="border-t border-border bg-background px-5 py-8 md:px-12">
        <div className="mx-auto flex max-w-5xl items-center justify-between text-[10px] tracking-[0.2em] uppercase text-foreground-subtle">
          <Link href="/" className="transition-base hover:text-foreground">
            Long_Horizon
          </Link>
          <span>v0.6 · shareable art engine</span>
          <Link href="/gallery" className="transition-base hover:text-foreground">
            Gallery
          </Link>
        </div>
      </footer>
    </main>
  );
}

function NotFound() {
  return (
    <main className="flex min-h-screen items-center justify-center bg-background text-foreground-muted">
      <div className="text-center">
        <p className="text-xs tracking-[0.3em] uppercase text-foreground-subtle mb-2">
          404
        </p>
        <p className="text-sm">This artwork doesn't exist.</p>
        <Link href="/" className="mt-4 inline-block text-xs text-aurora-cyan transition-base hover:opacity-70">
          ← Back to gallery
        </Link>
      </div>
    </main>
  );
}

function pickRelated(target: Artwork, all: Artwork[]): Artwork[] {
  return all
    .filter(
      (a) =>
        a.id !== target.id &&
        a.shaderGraph.system === target.shaderGraph.system &&
        a.shaderGraph.palette === target.shaderGraph.palette,
    )
    .slice(0, 3);
}

function sourceDescriptionFor(a: Artwork): string {
  if (a.birthChart && a.birthLocation) {
    return `Born at ${a.birthLocation.label} — a latitude / longitude we hold as a coordinate, never an identity. The wheel shows the planetary geometry at that moment — bodies in houses, bodies aspecting each other across the sky.`;
  }
  if (a.planetaryDNA) {
    const dna = a.planetaryDNA;
    const moonName = dna.moonPhase < 0.125 ? "New" : dna.moonPhase < 0.375 ? "Waxing crescent" : dna.moonPhase < 0.625 ? "Full" : dna.moonPhase < 0.875 ? "Waning gibbous" : "Waning crescent";
    return `${dna.dominantElement}-dominant sky with ${dna.aspectCount} active aspects — ${moonName} moon. ${dna.mercuryRetrograde ? "Mercury retrograde. " : ""}The strands of this artwork are the planetary longitudes on the day it was captured.`;
  }
  if (a.visualDNA) {
    const dna = a.visualDNA;
    return `Lifted from a static image. Five-colour palette extracted, edges counted, composition measured. The engine takes the visual genome and lets it breathe as a living system.`;
  }
  if (a.soundtrack?.url) {
    return `${a.audioDNA.energy > 0.6 ? "High-energy" : a.audioDNA.energy > 0.3 ? "Mid-energy" : "Low-energy"} audio at ${Math.round(a.audioDNA.tempo)} BPM, ${a.audioDNA.key} ${a.audioDNA.mode}. Particles respond to bass / mid / treble / onset.`;
  }
  return `Built from a procedural seed. No audio, no image, no planetary moment — just the genome of pure geometry.`;
}

function inputTypeOf(a: Artwork): string {
  if (a.birthChart) return "Birth chart";
  if (a.planetaryDNA) return "Planetary moment";
  if (a.visualDNA) return "Image";
  if (a.soundtrack?.url) return "Audio";
  return "Seed";
}

function Stat({ label, value, mono, capitalize }: { label: string; value: string; mono?: boolean; capitalize?: boolean }) {
  return (
    <div>
      <p className="text-[9px] tracking-[0.2em] uppercase text-foreground-subtle">{label}</p>
      <p className={"mt-0.5 text-sm " + (mono ? "font-mono " : "") + (capitalize ? "capitalize " : "") + "text-foreground"}>
        {value}
      </p>
    </div>
  );
}

function VisualDNAFeatures({ dna }: { dna: Artwork["visualDNA"] & {} }) {
  return (
    <>
      <div className="mb-3 flex gap-px h-3">
        {dna.palette.map((hex, i) => (
          <div key={i} className="flex-1 rounded-sm" style={{ background: hex }} />
        ))}
      </div>
      <div className="grid grid-cols-2 gap-x-4 gap-y-1.5 text-[11px]">
        <DnaBar label="brightness" v={dna.brightness} />
        <DnaBar label="contrast" v={dna.contrast} />
        <DnaBar label="saturation" v={dna.saturation} />
        <DnaBar label="warmth" v={dna.warmth} />
        <DnaBar label="edge density" v={dna.edgeDensity} />
        <DnaBar label="texture" v={dna.textureComplexity} />
      </div>
      <p className="mt-3 font-mono text-[10px] text-foreground-subtle">
        {dna.hash.slice(0, 24)}…
      </p>
    </>
  );
}

function AudioDNAFeatures({ dna }: { dna: Artwork["audioDNA"] }) {
  return (
    <>
      <p className="text-[11px] text-foreground-muted">
        <span className="font-mono text-foreground">{Math.round(dna.tempo)} BPM</span> · {dna.key}{" "}
        {dna.mode === "minor" ? "m" : ""}
      </p>
      <div className="mt-3 grid grid-cols-2 gap-x-4 gap-y-1.5 text-[11px]">
        <DnaBar label="energy" v={dna.energy} />
        <DnaBar label="brightness" v={dna.brightness} />
        <DnaBar label="warmth" v={dna.warmth} />
        <DnaBar label="texture" v={dna.texture} />
        <DnaBar label="complexity" v={dna.complexity} />
        <DnaBar label="motion" v={dna.motion} />
      </div>
    </>
  );
}

function PlanetaryDNAFeatures({ dna }: { dna: Artwork["planetaryDNA"] & {} }) {
  return (
    <>
      <p className="text-[11px] text-foreground-muted">
        <span className="capitalize text-foreground">{dna.dominantElement}</span> dominant · {dna.aspectCount} aspects
      </p>
      <div className="mt-3 grid grid-cols-2 gap-x-4 gap-y-1.5 text-[11px]">
        <DnaBar label="chart intensity" v={dna.chartIntensity} />
        <DnaBar label="moon phase" v={dna.moonPhase} />
      </div>
    </>
  );
}

function BirthChartFeatures({ chart }: { chart: Artwork["birthChart"] & {} }) {
  const bodyCount = Object.keys(chart.bodies).length;
  return (
    <>
      <p className="text-[11px] text-foreground-muted">
        {bodyCount} bodies · {chart.aspects.length} aspects
      </p>
      <div className="mt-3 text-[10px]">
        <p className="mb-1 text-foreground-subtle">Houses</p>
        <p className="font-mono text-foreground-muted">
          {chart.houses.slice(0, 4).map((h: number) => h.toFixed(1)).join("  ")}
        </p>
      </div>
      {chart.aspects.length > 0 && (
        <div className="mt-2 text-[10px]">
          <p className="mb-1 text-foreground-subtle">Aspects</p>
          <p className="font-mono text-foreground-muted">
            {chart.aspects.slice(0, 4).map((a) => `${a.a}-${a.b} ${a.type}`).join("  ·  ")}
          </p>
        </div>
      )}
    </>
  );
}

function DnaBar({ label, v }: { label: string; v: number }) {
  return (
    <div>
      <div className="mb-0.5 flex justify-between text-[10px] text-foreground-subtle">
        <span>{label}</span>
        <span className="font-mono text-foreground-muted">{Math.round(v * 100)}%</span>
      </div>
      <div className="h-1 overflow-hidden rounded-full bg-background">
        <div className="h-full bg-aurora-cyan" style={{ width: `${Math.round(v * 100)}%` }} />
      </div>
    </div>
  );
}
