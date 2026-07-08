import Link from "next/link";
import type { Artwork } from "@/lib/types";

/**
 * ArtworkTile — single tile in the /gallery grid.
 *
 * Renders a source-specific thumbnail:
 *   - visual   → 5-stripe palette swatch
 *   - audio    → polaroid-style waveform vibe (4 vertical bars + label)
 *   - planetary → 4 small planetary glyphs at the angles of the body's longitude
 *   - birth    → 12-spoke wheel mini
 *   - classic  → solid system label
 *
 * Below: source · system · title · one-line description.
 * Hover: lifts up, border strongens.
 */

type Source = "audio" | "visual" | "planetary" | "birth" | "classic";

const PALETTES: Record<string, string[]> = {
  aurora: ["#06b6d4", "#7c3aed", "#3b82f6", "#a855f7", "#22d3ee"],
  ember:  ["#f59e0b", "#dc2626", "#ea580c", "#fb923c", "#fde047"],
  tide:   ["#0891b2", "#0e7490", "#155e75", "#06b6d4", "#67e8f9"],
  ink:    ["#1e293b", "#334155", "#475569", "#64748b", "#94a3b8"],
  bone:   ["#d4c5a9", "#a89878", "#7d6f52", "#5c503f", "#3c342a"],
  moss:   ["#65a30d", "#4d7c0f", "#365314", "#84cc16", "#bef264"],
};

export function ArtworkTile({
  artwork,
  source,
  sourceDescription,
  systemLabel,
  systemDescription,
}: {
  artwork: Artwork;
  source: Source;
  sourceDescription: string;
  systemLabel: string;
  systemDescription: string;
}) {
  const palette = (artwork.visualDNA?.palette ?? PALETTES[artwork.shaderGraph.palette] ?? PALETTES.aurora).slice(0, 5);

  return (
    <Link
      href={`/engine/${artwork.id}`}
      data-testid={`gallery-tile-${artwork.id}`}
      className="group block overflow-hidden rounded-2xl border border-border bg-background-elevated transition-base hover:border-border-strong hover:bg-background-glass-hover hover:-translate-y-0.5"
    >
      <div className="aspect-[4/3] w-full overflow-hidden">
        {source === "visual" ? (
          <PaletteSwatch colors={palette} />
        ) : source === "audio" ? (
          <AudioGlyph tempo={artwork.audioDNA.tempo} keyName={artwork.audioDNA.key} />
        ) : source === "planetary" && artwork.planetaryDNA ? (
          <PlanetaryGlyph data={artwork.planetaryDNA} />
        ) : source === "birth" && artwork.birthChart ? (
          <WheelGlyph />
        ) : (
          <SystemGlyph
            label={systemLabel}
            description={systemDescription}
            palette={palette}
          />
        )}
      </div>
      <div className="p-4">
        <div className="mb-2 flex items-center justify-between">
          <p className="text-[10px] tracking-[0.25em] uppercase text-foreground-subtle">
            {source}
          </p>
          <p className="font-mono text-[10px] text-foreground-subtle">
            {systemLabel}
          </p>
        </div>
        <p className="mb-1 text-lg text-foreground">{artwork.title ?? artwork.id}</p>
        <p className="text-sm text-foreground-muted">{descriptionFor(artwork, source, sourceDescription)}</p>
        <p className="mt-3 font-mono text-[10px] text-foreground-subtle transition-base group-hover:text-foreground-muted">
          Open artwork →
        </p>
      </div>
    </Link>
  );
}

function descriptionFor(a: Artwork, s: Source, defaultDesc: string): string {
  if (s === "audio") {
    return `${Math.round(a.audioDNA.tempo)} BPM · ${a.audioDNA.key} ${a.audioDNA.mode === "minor" ? "m" : ""} · energy ${(a.audioDNA.energy * 100).toFixed(0)}%`;
  }
  if (s === "visual" && a.visualDNA) {
    const dna = a.visualDNA;
    return `${dna.palette[0]} warm · edges ${(dna.edgeDensity * 100).toFixed(0)}% · texture ${(dna.textureComplexity * 100).toFixed(0)}%`;
  }
  if (s === "planetary" && a.planetaryDNA) {
    return `${a.planetaryDNA.dominantElement} dominant · ${a.planetaryDNA.aspectCount} aspects · intensity ${(a.planetaryDNA.chartIntensity * 100).toFixed(0)}%`;
  }
  if (s === "birth" && a.birthChart && a.birthLocation) {
    return `${a.birthLocation.label} · ${Object.keys(a.birthChart.bodies).length} bodies · ${a.birthChart.aspects.length} aspects`;
  }
  return defaultDesc;
}

function PaletteSwatch({ colors }: { colors: string[] }) {
  return (
    <div className="flex h-full w-full">
      {colors.map((hex, i) => (
        <div key={i} className="h-full flex-1" style={{ background: hex }} />
      ))}
    </div>
  );
}

function AudioGlyph({ tempo, keyName }: { tempo: number; keyName: string }) {
  // 4 vertical "bars" of a waveform vibe, plus tempo readout
  return (
    <div className="flex h-full w-full flex-col items-center justify-center bg-background px-6">
      <p className="mb-2 font-mono text-[9px] tracking-[0.3em] uppercase text-foreground-subtle">
        audio · key {keyName}
      </p>
      <div className="flex h-16 w-full items-end justify-center gap-2">
        {[0.3, 0.85, 0.55, 0.95].map((h, i) => (
          <div
            key={i}
            className="w-3 bg-aurora-cyan"
            style={{ height: `${h * 100}%`, opacity: 0.4 + h * 0.6 }}
          />
        ))}
      </div>
      <p className="mt-2 font-mono text-[10px] text-foreground-muted">{Math.round(tempo)} BPM</p>
    </div>
  );
}

function PlanetaryGlyph({ data }: { data: { sunLongitude: number; moonLongitude: number; moonPhase: number; dominantElement: string } }) {
  // Mini sun + moon on a 360° track
  const sunX = Math.cos((data.sunLongitude * Math.PI) / 180);
  const sunY = Math.sin((data.sunLongitude * Math.PI) / 180);
  const moonX = Math.cos((data.moonLongitude * Math.PI) / 180);
  const moonY = Math.sin((data.moonLongitude * Math.PI) / 180);
  return (
    <div className="relative flex h-full w-full items-center justify-center bg-background">
      <svg viewBox="-50 -50 100 100" className="h-full w-full">
        <circle cx="0" cy="0" r="42" fill="none" stroke="rgba(255,255,255,0.12)" strokeWidth="0.5" />
        <circle cx="0" cy="0" r="6" fill="#f59e0b" />
        <circle cx={sunX * 38} cy={sunY * 38} r="1.5" fill="#f59e0b" />
        <circle cx={moonX * 38} cy={moonY * 38} r="2" fill="#cbd5e1" opacity="0.7" />
      </svg>
      <p className="absolute bottom-2 right-2 font-mono text-[10px] text-foreground-subtle">
        {data.dominantElement}
      </p>
    </div>
  );
}

function WheelGlyph() {
  return (
    <div className="relative flex h-full w-full items-center justify-center bg-background">
      <svg viewBox="-50 -50 100 100" className="h-full w-full">
        {/* 12-spoke wheel */}
        {Array.from({ length: 12 }).map((_, i) => {
          const a = (i / 12) * Math.PI * 2;
          return (
            <line
              key={i}
              x1={Math.cos(a) * 12}
              y1={Math.sin(a) * 12}
              x2={Math.cos(a) * 38}
              y2={Math.sin(a) * 38}
              stroke="rgba(255,255,255,0.18)"
              strokeWidth="0.5"
            />
          );
        })}
        <circle cx="0" cy="0" r="38" fill="none" stroke="rgba(255,255,255,0.12)" strokeWidth="0.5" />
        <circle cx="0" cy="0" r="24" fill="none" stroke="rgba(255,255,255,0.12)" strokeWidth="0.5" />
        <circle cx="0" cy="0" r="6" fill="#7c3aed" />
        <circle cx={Math.cos(Math.PI / 4) * 30} cy={Math.sin(Math.PI / 4) * 30} r="2" fill="#f59e0b" />
        <circle cx={Math.cos(-Math.PI / 3) * 30} cy={Math.sin(-Math.PI / 3) * 30} r="2" fill="#06b6d4" />
      </svg>
    </div>
  );
}

function SystemGlyph({ label, description, palette }: { label: string; description: string; palette: string[] }) {
  return (
    <div className="flex h-full w-full flex-col items-center justify-center bg-background p-4 text-center">
      <p className="mb-1 font-mono text-[9px] tracking-[0.3em] uppercase text-foreground-subtle">
        procedural
      </p>
      <p className="font-light text-foreground text-lg">{label}</p>
      <p className="mt-1 text-[11px] text-foreground-muted">{description}</p>
      <div className="mt-3 flex w-full max-w-[120px] gap-1">
        {palette.map((hex, i) => (
          <div key={i} className="h-1 flex-1 rounded-full" style={{ background: hex }} />
        ))}
      </div>
    </div>
  );
}
