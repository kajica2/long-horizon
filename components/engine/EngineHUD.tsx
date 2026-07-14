"use client";

/**
 * EngineHUD — observability overlay.
 *
 * Top-left strip with live engine state: system, palette, camera, FPS,
 * frame time, sim time. Bottom-left strip with current parameter values.
 *
 * Toggled by pressing H. Persists via localStorage.
 */

import { useEffect, useState } from "react";
import { useEngineStore } from "@/lib/engine/store";

const STORAGE_KEY = "long-horizon-hud-visible";

export function EngineHUD() {
  const [visible, setVisible] = useState(false);
  const fps = useEngineStore((s) => s.fps);
  const frameTimeMs = useEngineStore((s) => s.frameTimeMs);
  const simTime = useEngineStore((s) => s.simTime);
  const shaderGraph = useEngineStore((s) => s.shaderGraph);
  const audioBass = useEngineStore((s) => s.audioBass);
  const audioMid = useEngineStore((s) => s.audioMid);
  const audioTreble = useEngineStore((s) => s.audioTreble);
  const visualInfluence = useEngineStore((s) => s.visualInfluence);
  const liveMode = useEngineStore((s) => s.liveMode);
  const paused = useEngineStore((s) => s.paused);

  useEffect(() => {
    try {
      const saved = localStorage.getItem(STORAGE_KEY);
      if (saved === "1") setVisible(true);
    } catch {
      // localStorage may be disabled
    }
    const onKey = (e: KeyboardEvent) => {
      if (e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement) return;
      if (e.key === "h" || e.key === "H") {
        setVisible((v) => {
          const next = !v;
          try { localStorage.setItem(STORAGE_KEY, next ? "1" : "0"); } catch {}
          return next;
        });
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  if (!visible) return null;

  const fpsColor =
    fps >= 50 ? "text-emerald-400" : fps >= 30 ? "text-amber-300" : "text-rose-400";

  return (
    <>
      <div className="pointer-events-none fixed top-3 left-3 z-40 font-mono text-[10px] leading-relaxed text-foreground-muted">
        <div className="rounded-md border border-border/40 bg-background-elevated/85 px-3 py-2 backdrop-blur-sm">
          <p className="text-[9px] tracking-[0.3em] uppercase text-foreground-subtle">
            engine
          </p>
          <p className="mt-1 text-xs text-foreground">
            {shaderGraph.system} <span className="text-foreground-subtle">·</span> {shaderGraph.palette}
          </p>
          <p className="text-[10px] text-foreground-subtle">
            cam: {shaderGraph.camera}
            {liveMode ? " · live" : ""}
            {paused ? " · paused" : ""}
          </p>
          <p className="mt-1 flex items-center gap-2">
            <span className={fpsColor}>
              {fps.toFixed(0)} fps
            </span>
            <span className="text-foreground-subtle">
              {frameTimeMs.toFixed(1)}ms
            </span>
          </p>
          <p className="text-foreground-subtle">
            sim: {simTime.toFixed(1)}s
          </p>
        </div>
      </div>

      <div className="pointer-events-none fixed bottom-3 left-3 z-40 font-mono text-[10px] leading-relaxed">
        <div className="rounded-md border border-border/40 bg-background-elevated/85 px-3 py-2 backdrop-blur-sm">
          <p className="text-[9px] tracking-[0.3em] uppercase text-foreground-subtle">
            params
          </p>
          <ParamList params={shaderGraph.params} />
          {(audioBass > 0 || audioMid > 0 || audioTreble > 0) && (
            <p className="mt-1.5 border-t border-border/30 pt-1.5 text-foreground-subtle">
              bass {audioBass.toFixed(2)} · mid {audioMid.toFixed(2)} · tre {audioTreble.toFixed(2)}
            </p>
          )}
          {visualInfluence > 0 && (
            <p className="text-foreground-subtle">dna: {Math.round(visualInfluence * 100)}%</p>
          )}
        </div>
      </div>

      <div className="pointer-events-none fixed bottom-3 right-3 z-40 font-mono text-[10px] text-foreground-subtle">
        <span className="rounded border border-border/40 bg-background-elevated/60 px-1.5 py-0.5">
          H to hide
        </span>
      </div>
    </>
  );
}

function ParamList({ params }: { params: Record<string, number | string | boolean> }) {
  const entries = Object.entries(params).filter(
    (entry): entry is [string, number] => typeof entry[1] === "number",
  );
  return (
    <div className="mt-1 space-y-0.5 text-foreground-muted">
      {entries.map(([k, v]) => (
        <p key={k} className="flex justify-between gap-3">
          <span className="text-foreground-subtle">{k}</span>
          <span className="text-foreground">{formatParam(v)}</span>
        </p>
      ))}
    </div>
  );
}

function formatParam(v: number): string {
  if (Math.abs(v) >= 100) return v.toFixed(0);
  if (Math.abs(v) >= 10) return v.toFixed(1);
  if (Math.abs(v) >= 1) return v.toFixed(2);
  return v.toFixed(3);
}