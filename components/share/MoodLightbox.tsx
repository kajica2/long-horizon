"use client";

/**
 * Lightbox for mood variants — Stage 26 of the Long Horizon roadmap.
 *
 * Click any ArtworkTile (or polaroid tile) wired to this lightbox, the
 * modal opens with a 6-tile grid: each tile is a different mood
 * (Morning / Afternoon / Night / Winter / Decay / Rebirth) of the
 * parent artwork. Clicking a mood tile navigates to /engine/[variantId].
 *
 * Variant palettes are computed client-side from lib/moods.ts (the same
 * pure function the server uses), so this works without an extra API
 * round-trip — the mood presets are static and small.
 *
 * Polaroid tiles render a tiny static thumbnail using the palette swap
 * only — no engine. A small label under each mood makes the mood name
 * and palette legible. ESC closes the modal.
 */

import { useEffect, useState, useCallback, useMemo, type ReactNode } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { applyMood, MOODS, MOOD_LABELS, MOOD_DESCRIPTIONS, type Mood } from "@/lib/moods";
import type { Artwork, PaletteName } from "@/lib/types";

const PALETTES: Record<PaletteName, string[]> = {
  aurora: ["#06b6d4", "#7c3aed", "#3b82f6", "#a855f7", "#22d3ee"],
  ember:  ["#f59e0b", "#dc2626", "#ea580c", "#fb923c", "#fde047"],
  tide:   ["#0891b2", "#0e7490", "#155e75", "#06b6d4", "#67e8f9"],
  ink:    ["#1e293b", "#334155", "#475569", "#64748b", "#94a8b8"],
  bone:   ["#d4c5a9", "#a89878", "#7d6f52", "#5c503f", "#3c342a"],
  moss:   ["#65a30d", "#4d7c0f", "#365314", "#84cc16", "#bef264"],
};

function paletteOf(artwork: Artwork): string[] {
  return (
    artwork.visualDNA?.palette ??
    PALETTES[artwork.shaderGraph.palette] ??
    PALETTES.aurora
  );
}

interface LightboxProps {
  artwork: Artwork;
  children: ReactNode;
}

export function MoodLightbox({ artwork, children }: LightboxProps) {
  const [open, setOpen] = useState(false);
  const router = useRouter();

  const close = useCallback(() => setOpen(false), []);

  useEffect(() => {
    if (!open) return;
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") close();
    }
    document.addEventListener("keydown", onKey);
    // Lock body scroll while modal open
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.removeEventListener("keydown", onKey);
      document.body.style.overflow = prev;
    };
  }, [open, close]);

  // Pre-compute all 6 variants on every render — they're pure functions.
  const variants = useMemo(() => MOODS.map((m) => applyMood(artwork, m)), [artwork]);

  return (
    <>
      <button
        type="button"
        onClick={(e) => {
          e.preventDefault();
          e.stopPropagation();
          setOpen(true);
        }}
        className="contents"
        aria-label={`Open mood variants for ${artwork.title ?? artwork.id}`}
      >
        {children}
      </button>

      {open && (
        <div
          role="dialog"
          aria-modal="true"
          aria-label={`Mood variants for ${artwork.title ?? artwork.id}`}
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 p-4 backdrop-blur-sm"
          onClick={close}
        >
          <div
            className="relative max-h-[90vh] w-full max-w-5xl overflow-y-auto rounded-2xl border border-border bg-background p-6 md:p-10"
            onClick={(e) => e.stopPropagation()}
          >
            <button
              type="button"
              onClick={close}
              aria-label="Close"
              className="absolute right-4 top-4 inline-flex h-8 w-8 items-center justify-center rounded-full border border-border text-foreground-subtle transition-base hover:border-border-strong hover:text-foreground"
            >
              ✕
            </button>

            <header className="mb-8">
              <p className="mb-2 text-xs tracking-[0.3em] uppercase text-foreground-subtle">
                Six moods
              </p>
              <h2 className="mb-2 text-3xl font-light tracking-tight">
                {artwork.title ?? artwork.id}
              </h2>
              <p className="text-sm text-foreground-muted">
                Same living system, different light. Click any mood to step inside
                the engine with that mood applied.
              </p>
            </header>

            <div className="grid grid-cols-2 gap-4 md:grid-cols-3">
              {variants.map((v, i) => {
                const mood = MOODS[i] as Mood;
                const palette = paletteOf(v);
                return (
                  <Link
                    key={v.id}
                    href={`/engine/${v.id}`}
                    onClick={() => router.push(`/engine/${v.id}`)}
                    className="group block overflow-hidden rounded-xl border border-border bg-background-elevated transition-base hover:border-border-strong"
                  >
                    <div className="flex h-32">
                      {palette.slice(0, 5).map((hex, j) => (
                        <div
                          key={j}
                          className="flex-1 transition-base group-hover:scale-105"
                          style={{ background: hex }}
                        />
                      ))}
                    </div>
                    <div className="p-3">
                      <p className="text-[10px] tracking-[0.2em] uppercase text-foreground-subtle">
                        {v.shaderGraph.palette} · {v.shaderGraph.camera}
                      </p>
                      <p className="mt-1 text-lg font-light text-foreground group-hover:text-aurora-cyan">
                        {MOOD_LABELS[mood]}
                      </p>
                      <p className="mt-1 line-clamp-3 text-xs text-foreground-muted">
                        {MOOD_DESCRIPTIONS[mood]}
                      </p>
                    </div>
                  </Link>
                );
              })}
            </div>

            <footer className="mt-8 flex items-center justify-between border-t border-border pt-4 text-[10px] tracking-[0.2em] uppercase text-foreground-subtle">
              <span>ESC to close</span>
              <Link
                href={`/engine/${artwork.id}`}
                className="text-aurora-cyan transition-base hover:underline"
              >
                Open original →
              </Link>
            </footer>
          </div>
        </div>
      )}
    </>
  );
}