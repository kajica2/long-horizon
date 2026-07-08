import Link from "next/link";
import { listArtworks } from "@/lib/artwork-store";
import type { Artwork, LivingSystemName } from "@/lib/types";
import { ArtworkTile } from "@/components/gallery/ArtworkTile";

/**
 * /gallery — server-rendered grid of all seed artworks.
 *
 * Filterable by:
 *   ?system=<systemName>     — flowFieldMeditation, cosmicFilaments, sandTraveler, deJongAttractor, birthChart
 *   ?source=<sourceName>     — audio, visual, planetary, birth, classic
 *   ?palette=<paletteName>   — aurora, ember, tide, ink, bone, moss
 *
 * Click a tile to open /engine/[id]. Each tile renders the artwork's
 * source's visual identifier (palette swatch for visual, polaroid-style
 * strip for audio + planetary, system-specific glyph for classics).
 *
 * Designed to be the canonical /gallery for the 30-step roadmap (action 19).
 */

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
};

const SYSTEM_DESCRIPTIONS: Record<LivingSystemName, string> = {
  flowFieldMeditation: "Curl-noise particles",
  cosmicFilaments: "Planetary line ribbons",
  sandTraveler: "Tarbell 2004",
  deJongAttractor: "Tarbell 2004",
  birthChart: "Placidus + 5 aspects",
};

const SOURCE_DESCRIPTIONS: Record<Source, string> = {
  audio: "Audio → DNA",
  visual: "Image → DNA",
  planetary: "Moment → DNA",
  birth: "Birth chart",
  classic: "Procedural",
};

function uniq<T>(xs: T[]): T[] {
  return Array.from(new Set(xs));
}

export default async function GalleryPage({
  searchParams,
}: {
  searchParams: Promise<{
    system?: string;
    source?: string;
    palette?: string;
  }>;
}) {
  const params = await searchParams;
  const system = params.system;
  const source = params.source as Source | undefined;
  const palette = params.palette;

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

  const sources = uniq(artworks.map(sourceOf));
  const palettes = uniq(artworks.map((a) => a.shaderGraph.palette));
  const systems = uniq(artworks.map((a) => a.shaderGraph.system));

  let filtered = artworks;
  if (system) filtered = filtered.filter((a) => a.shaderGraph.system === system);
  if (source) filtered = filtered.filter((a) => sourceOf(a) === source);
  if (palette) filtered = filtered.filter((a) => a.shaderGraph.palette === palette);

  const filterUrl = (overrides: Record<string, string | undefined>): string => {
    const merged = { system, source, palette, ...overrides };
    const sp = new URLSearchParams();
    for (const [k, v] of Object.entries(merged)) {
      if (v) sp.set(k, v);
    }
    const s = sp.toString();
    return s ? `/gallery?${s}` : "/gallery";
  };

  return (
    <main className="relative min-h-screen bg-aurora">
      <div className="mx-auto max-w-7xl px-6 py-10">
        <header className="mb-16 flex items-center justify-between">
          <Link href="/" className="text-xs tracking-[0.3em] uppercase text-foreground-muted transition-base hover:text-foreground">
            ← Back
          </Link>
          <span className="text-xs tracking-[0.3em] uppercase text-foreground-subtle">
            Gallery
          </span>
        </header>

        <div className="mb-12">
          <p className="mb-4 text-xs tracking-[0.3em] uppercase text-foreground-subtle">
            Living systems
          </p>
          <h1 className="mb-3 text-4xl font-light tracking-tight">
            {filtered.length === artworks.length
              ? `${filtered.length} artworks, all of them`
              : `${filtered.length} of ${artworks.length} artworks`}
          </h1>
          <p className="max-w-xl text-sm text-foreground-muted">
            Each piece is a unique living system — grown from audio, image, planetary
            moment, or a personal birth chart. Click any tile to step inside.
          </p>
        </div>

        {/* Filter chips */}
        <div className="mb-4 flex flex-wrap items-center gap-2">
          <p className="mr-2 text-[10px] tracking-[0.2em] uppercase text-foreground-subtle">Source</p>
          <FilterChip
            active={!source}
            href={filterUrl({ source: undefined })}
            label="all"
          />
          {sources.map((s) => (
            <FilterChip
              key={s}
              active={source === s}
              href={filterUrl({ source: source === s ? undefined : s })}
              label={s}
            />
          ))}
        </div>

        <div className="mb-8 flex flex-wrap items-center gap-2">
          <p className="mr-2 text-[10px] tracking-[0.2em] uppercase text-foreground-subtle">System</p>
          <FilterChip
            active={!system}
            href={filterUrl({ system: undefined })}
            label="all"
          />
          {systems.map((sn) => (
            <FilterChip
              key={sn}
              active={system === sn}
              href={filterUrl({ system: system === sn ? undefined : sn })}
              label={SYSTEM_LABELS[sn]}
            />
          ))}
        </div>

        <div className="mb-8 flex flex-wrap items-center gap-2">
          <p className="mr-2 text-[10px] tracking-[0.2em] uppercase text-foreground-subtle">Palette</p>
          <FilterChip
            active={!palette}
            href={filterUrl({ palette: undefined })}
            label="all"
          />
          {palettes.map((p) => (
            <FilterChip
              key={p}
              active={palette === p}
              href={filterUrl({ palette: palette === p ? undefined : p })}
              label={p}
            />
          ))}
        </div>

        {(source || system || palette) && (
          <div className="mb-8">
            <Link href="/gallery" className="text-[10px] tracking-[0.2em] uppercase text-aurora-cyan transition-base hover:underline">
              ✕ Clear filters
            </Link>
          </div>
        )}

        {filtered.length === 0 ? (
          <div className="rounded-2xl border border-dashed border-border p-12 text-center">
            <p className="text-sm text-foreground-muted">No artworks match these filters. <Link href="/gallery" className="text-aurora-cyan hover:underline">Clear filters</Link>.</p>
          </div>
        ) : (
          <div className="grid gap-6 md:grid-cols-2 lg:grid-cols-3">
            {filtered.map((a) => (
              <ArtworkTile
                key={a.id}
                artwork={a}
                source={sourceOf(a)}
                sourceDescription={SOURCE_DESCRIPTIONS[sourceOf(a)]}
                systemLabel={SYSTEM_LABELS[a.shaderGraph.system]}
                systemDescription={SYSTEM_DESCRIPTIONS[a.shaderGraph.system]}
              />
            ))}
          </div>
        )}

        <div className="mt-16 rounded-2xl border border-dashed border-border p-8 text-center">
          <p className="mb-2 text-xs tracking-[0.3em] uppercase text-foreground-subtle">
            Want more?
          </p>
          <p className="mb-3 text-sm text-foreground-muted">
            Upload your own image, capture a planetary moment, or load your birth data.
          </p>
          <Link
            href="/create"
            className="inline-block rounded-md border border-border px-4 py-2 text-xs tracking-[0.2em] uppercase text-foreground transition-base hover:border-border-strong"
          >
            Open Create →
          </Link>
        </div>
      </div>
    </main>
  );
}

function FilterChip({
  active,
  href,
  label,
}: {
  active: boolean;
  href: string;
  label: string;
}) {
  return (
    <Link
      href={href}
      className={
        "rounded-full border px-3 py-1 text-xs capitalize transition-base " +
        (active
          ? "border-border-strong bg-foreground/10 text-foreground"
          : "border-border text-foreground-muted hover:border-border-strong hover:text-foreground")
      }
    >
      {label}
    </Link>
  );
}
