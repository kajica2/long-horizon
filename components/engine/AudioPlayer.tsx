/**
 * AudioPlayer — overlay UI for live mode playback.
 *
 * Shows:
 *   - Play/pause button
 *   - Time display (current / duration)
 *   - Scrub bar (click to seek)
 *   - Live bass/mid/treble level meters
 *
 * Sits at the bottom of the engine view as a glass panel.
 */

"use client";

import { useEngineStore } from "@/lib/engine/store";
import type { AudioPlaybackHandle } from "@/lib/audio/use-audio-playback";

function formatTime(t: number): string {
  if (!Number.isFinite(t) || t < 0) return "0:00";
  const m = Math.floor(t / 60);
  const s = Math.floor(t % 60);
  return `${m}:${s.toString().padStart(2, "0")}`;
}

export function AudioPlayer({
  playback,
  enabled,
}: {
  playback: AudioPlaybackHandle;
  enabled: boolean;
}) {
  const bass = useEngineStore((s) => s.audioBass);
  const mid = useEngineStore((s) => s.audioMid);
  const treble = useEngineStore((s) => s.audioTreble);
  const onset = useEngineStore((s) => s.audioTreble); // placeholder, just for visual pulse
  const setLiveMode = useEngineStore((s) => s.setLiveMode);

  if (!enabled) return null;

  const handleScrub = (e: React.MouseEvent<HTMLDivElement>) => {
    if (!playback.isReady || playback.duration <= 0) return;
    const rect = e.currentTarget.getBoundingClientRect();
    const x = e.clientX - rect.left;
    const t = (x / rect.width) * playback.duration;
    playback.seek(t);
  };

  return (
    <div className="pointer-events-auto fixed bottom-6 left-1/2 z-40 w-[min(720px,92vw)] -translate-x-1/2">
      <div className="glass flex flex-col gap-3 rounded-2xl p-4">
        {/* Scrub bar */}
        <div
          onClick={handleScrub}
          className="group relative h-1 w-full cursor-pointer overflow-hidden rounded-full bg-foreground/10"
        >
          <div
            className="absolute inset-y-0 left-0 bg-foreground/40 transition-[width] duration-100"
            style={{
              width: `${playback.duration > 0 ? (playback.currentTime / playback.duration) * 100 : 0}%`,
            }}
          />
          <div
            className="absolute inset-y-0 left-0 opacity-0 group-hover:opacity-100"
            style={{
              width: `${playback.duration > 0 ? (playback.currentTime / playback.duration) * 100 : 0}%`,
              background: "linear-gradient(90deg, rgba(124,58,237,0.4), rgba(6,182,212,0.4))",
            }}
          />
        </div>

        {/* Controls row */}
        <div className="flex items-center gap-4">
          {/* Play/pause */}
          <button
            onClick={playback.toggle}
            disabled={!playback.isReady}
            className="flex h-9 w-9 items-center justify-center rounded-full bg-foreground/10 transition-base hover:bg-foreground/20 disabled:opacity-30"
            aria-label={playback.isPlaying ? "Pause" : "Play"}
          >
            {playback.isPlaying ? (
              <svg viewBox="0 0 24 24" className="h-4 w-4" fill="currentColor">
                <rect x="6" y="5" width="4" height="14" />
                <rect x="14" y="5" width="4" height="14" />
              </svg>
            ) : (
              <svg viewBox="0 0 24 24" className="h-4 w-4 translate-x-0.5" fill="currentColor">
                <path d="M7 5v14l12-7z" />
              </svg>
            )}
          </button>

          {/* Time */}
          <div className="font-mono text-xs text-foreground-muted tabular-nums">
            {formatTime(playback.currentTime)} / {formatTime(playback.duration)}
          </div>

          {/* Live mode toggle */}
          <button
            onClick={() => setLiveMode(false)}
            className="ml-auto rounded-full bg-accent/20 px-3 py-1 text-[10px] tracking-[0.2em] uppercase text-accent transition-base hover:bg-accent/30"
          >
            ● Live
          </button>

          {/* Level meters */}
          <div className="flex items-center gap-1.5">
            <Bar value={bass} label="B" color="rgba(124, 58, 237, 0.9)" />
            <Bar value={mid} label="M" color="rgba(6, 182, 212, 0.9)" />
            <Bar value={treble} label="T" color="rgba(236, 72, 153, 0.9)" />
          </div>
        </div>
      </div>
    </div>
  );
}

function Bar({ value, label, color }: { value: number; label: string; color: string }) {
  return (
    <div className="flex items-center gap-1">
      <div className="relative h-1.5 w-12 overflow-hidden rounded-full bg-foreground/10">
        <div
          className="absolute inset-y-0 left-0 transition-[width] duration-75"
          style={{ width: `${Math.max(0, Math.min(1, value)) * 100}%`, background: color }}
        />
      </div>
      <span className="w-3 font-mono text-[9px] text-foreground-subtle">{label}</span>
    </div>
  );
}
