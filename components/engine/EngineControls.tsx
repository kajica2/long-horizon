"use client";

import { useEngineStore } from "@/lib/engine/store";
import { CAMERA_MODE_LABELS } from "@/lib/engine/camera-modes";
import type { CameraMode } from "@/lib/types";

/**
 * EngineControls — minimal HUD overlay.
 *
 * Stage 3: pause/resume + camera mode + sim time
 * Stage 5: live mode toggle (audio reactivity)
 */
export function EngineControls({ onReset }: { onReset: () => void }) {
  const paused = useEngineStore((s) => s.paused);
  const togglePaused = useEngineStore((s) => s.togglePaused);
  const simTime = useEngineStore((s) => s.simTime);
  const cameraMode = useEngineStore((s) => s.shaderGraph.camera);
  const setCameraMode = useEngineStore((s) => s.setCameraMode);
  const liveMode = useEngineStore((s) => s.liveMode);
  const setLiveMode = useEngineStore((s) => s.setLiveMode);

  const cameraOptions: CameraMode[] = ["drone", "orbit", "meditationDrift", "inside"];

  return (
    <div className="pointer-events-none absolute inset-0 flex flex-col">
      {/* Top bar */}
      <div className="pointer-events-auto flex items-center justify-between p-6">
        <a
          href="/create"
          className="text-xs tracking-[0.3em] uppercase text-foreground-subtle transition-base hover:text-foreground"
        >
          ← Create
        </a>
        <div className="flex items-center gap-3">
          {/* Live mode toggle */}
          <button
            onClick={() => setLiveMode(!liveMode)}
            className={`rounded-full border px-3 py-1.5 text-[10px] tracking-[0.2em] uppercase transition-base ${
              liveMode
                ? "border-accent/40 bg-accent/20 text-accent"
                : "border-border bg-background-glass text-foreground-muted hover:border-border-strong"
            }`}
          >
            <span
              className={`mr-1.5 inline-block h-1.5 w-1.5 rounded-full align-middle ${
                liveMode ? "bg-accent" : "bg-foreground-subtle"
              }`}
            />
            Live
          </button>
          <div className="rounded-full border border-border bg-background-glass px-4 py-1.5 font-mono text-xs text-foreground-muted">
            {formatTime(simTime)}
          </div>
        </div>
      </div>

      {/* Spacer */}
      <div className="flex-1" />

      {/* Bottom controls */}
      <div className="pointer-events-auto flex items-center justify-between p-6">
        <div className="flex items-center gap-2">
          {cameraOptions.map((mode) => (
            <button
              key={mode}
              onClick={() => setCameraMode(mode)}
              className={`rounded-full border px-3 py-1.5 text-xs transition-base ${
                cameraMode === mode
                  ? "border-border-strong bg-background-glass-hover text-foreground"
                  : "border-border bg-background-glass text-foreground-muted hover:border-border-strong"
              }`}
            >
              {CAMERA_MODE_LABELS[mode]}
            </button>
          ))}
        </div>

        <div className="flex items-center gap-2">
          <button
            onClick={togglePaused}
            className="rounded-full border border-border bg-background-glass px-5 py-2 text-xs uppercase tracking-wider text-foreground transition-base hover:border-border-strong hover:bg-background-glass-hover"
          >
            {paused ? "Resume" : "Pause"}
          </button>
          <button
            onClick={onReset}
            className="rounded-full border border-border bg-background-glass px-5 py-2 text-xs uppercase tracking-wider text-foreground-muted transition-base hover:border-border-strong hover:text-foreground"
          >
            Reset
          </button>
        </div>
      </div>
    </div>
  );
}

function formatTime(seconds: number): string {
  const m = Math.floor(seconds / 60);
  const s = Math.floor(seconds % 60);
  const ms = Math.floor((seconds * 100) % 100);
  return `${m.toString().padStart(2, "0")}:${s.toString().padStart(2, "0")}.${ms.toString().padStart(2, "0")}`;
}