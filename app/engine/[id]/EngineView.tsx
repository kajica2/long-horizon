"use client";

import { useEffect, useState, useMemo } from "react";
import { hashSeed } from "@/lib/seed";
import { EngineCanvas } from "@/components/engine/EngineCanvas";
import { EngineControls } from "@/components/engine/EngineControls";
import { AudioPlayer } from "@/components/engine/AudioPlayer";
import { ParameterPanel } from "@/components/engine/ParameterPanel";
import { RecordingPanel } from "@/components/engine/RecordingPanel";
import { useAudioPlayback } from "@/lib/audio/use-audio-playback";
import { useEngineStore } from "@/lib/engine/store";
import type { Artwork } from "@/lib/types";

/**
 * EngineView — client component that:
 *   1. Fetches the Artwork record by id (or derives a seed if not found)
 *   2. Syncs the engine store with the Artwork's shaderGraph + genome
 *   3. Bootstraps the engine canvas with the seed + planetary DNA + birth chart
 *   4. Wires audio playback when live mode is on
 *   5. Shows minimal controls + audio player
 *
 * Reset rebuilds the engine via React `key` prop.
 */
export function EngineView({ id }: { id: string }) {
  const [seed, setSeed] = useState<string | null>(null);
  const [resetKey, setResetKey] = useState(0);
  const [artwork, setArtwork] = useState<Artwork | null>(null);
  const [planetaryIntensity, setPlanetaryIntensity] = useState(0.5);
  const [planetaryMoonPhase, setPlanetaryMoonPhase] = useState(0.5);

  const setShaderGraph = useEngineStore((s) => s.setShaderGraph);
  const setPlanetaryModulation = useEngineStore(
    (s) => s.setPlanetaryModulation,
  );
  const liveMode = useEngineStore((s) => s.liveMode);
  const setLiveMode = useEngineStore((s) => s.setLiveMode);

  const audioSrc = useMemo(() => {
    if (!artwork?.soundtrack?.url) return null;
    return artwork.soundtrack.url;
  }, [artwork]);

  const playback = useAudioPlayback(audioSrc, liveMode);

  // Only show the player for non-birth-chart systems, and only when live mode is on
  const isBirthChart = artwork?.shaderGraph?.system === "birthChart";
  const showPlayer = liveMode && !!artwork?.soundtrack?.url && !isBirthChart;

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const res = await fetch(`/api/artworks/${id}`);
        if (res.ok) {
          const a = (await res.json()) as Artwork;
          if (!cancelled) {
            setArtwork(a);
            setSeed(a.seed);
            setShaderGraph(a.shaderGraph);
            if (a.planetaryDNA) {
              setPlanetaryModulation(
                a.planetaryDNA.chartIntensity,
                a.planetaryDNA.moonPhase,
              );
              setPlanetaryIntensity(a.planetaryDNA.chartIntensity);
              setPlanetaryMoonPhase(a.planetaryDNA.moonPhase);
            }
            // Auto-enable live mode only for audio-driven systems
            if (a.soundtrack?.url && !isBirthChart) {
              setLiveMode(true);
            }
          }
        } else {
          if (!cancelled) setSeed(seedFromId(id));
        }
      } catch {
        if (!cancelled) setSeed(seedFromId(id));
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [id, setShaderGraph, setPlanetaryModulation, setLiveMode, isBirthChart]);

  if (!seed) {
    return (
      <main className="relative min-h-screen bg-background">
        <div className="absolute inset-0 flex items-center justify-center">
          <p className="text-xs tracking-[0.3em] uppercase text-foreground-subtle">
            Loading…
          </p>
        </div>
      </main>
    );
  }

  return (
    <main className="relative min-h-screen overflow-hidden bg-background">
      <div key={resetKey} className="absolute inset-0">
        <EngineCanvas
          seed={seed}
          planetaryChartIntensity={planetaryIntensity}
          planetaryMoonPhase={planetaryMoonPhase}
          birthChart={artwork?.birthChart}
        />
      </div>
      <ParameterPanel />
      <RecordingPanel artworkId={artwork?.id ?? null} seed={seed} />
      <EngineControls onReset={() => setResetKey((k) => k + 1)} />
      {artwork && (
        <div className="pointer-events-none absolute top-6 left-1/2 -translate-x-1/2 transform">
          <p className="rounded-full border border-border bg-background-glass px-4 py-1 text-xs text-foreground-muted backdrop-blur">
            {artwork.title ?? id}
            {artwork.birthChart && artwork.birthLocation && (
              <span className="ml-2 text-foreground-subtle">
                · {artwork.birthLocation.label}
              </span>
            )}
            {artwork.planetaryDNA && !artwork.birthChart && (
              <span className="ml-2 text-foreground-subtle">
                · {artwork.planetaryDNA.dominantElement} dominant
              </span>
            )}
          </p>
        </div>
      )}
      <AudioPlayer playback={playback} enabled={showPlayer} />
    </main>
  );
}

function seedFromId(id: string): string {
  let h = hashSeed(id);
  const a = h.toString(16).padStart(8, "0");
  const b = (Math.imul(h, 16777619) >>> 0).toString(16).padStart(8, "0");
  const c = (Math.imul(h ^ 0x9e3779b9, 16777619) >>> 0).toString(16).padStart(8, "0");
  const d = (Math.imul(h ^ 0x85ebca6b, 16777619) >>> 0).toString(16).padStart(8, "0");
  return a + b + c + d;
}