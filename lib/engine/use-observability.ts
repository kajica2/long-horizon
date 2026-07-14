"use client";

/**
 * useObservability — engine HUD data feed.
 *
 * Samples requestAnimationFrame deltas, computes a 1-second rolling FPS,
 * and pushes the result to the engine store. The HUD reads from the
 * store, not from this hook, so updates are cheap.
 *
 * Why rolling 1s: instantaneous FPS is jittery; 1s average is what the
 * eye-brain interprets as "smooth". Update rate caps at 4Hz so we don't
 * thrash the store.
 */

import { useEffect, useRef } from "react";
import { useEngineStore } from "@/lib/engine/store";

const SAMPLE_WINDOW_MS = 1000; // 1-second rolling window
const MAX_PUSH_HZ = 4; // throttle setState

export function useObservability(opts?: { enabled?: boolean }): void {
  const setObservability = useEngineStore((s) => s.setObservability);
  const rafRef = useRef<number | null>(null);
  const samplesRef = useRef<number[]>([]);
  const lastPushRef = useRef(0);

  useEffect(() => {
    if (opts?.enabled === false) return;

    const tick = (now: number) => {
      const samples = samplesRef.current;
      samples.push(now);
      const cutoff = now - SAMPLE_WINDOW_MS;
      while (samples.length && samples[0] < cutoff) samples.shift();

      if (now - lastPushRef.current >= 1000 / MAX_PUSH_HZ) {
        lastPushRef.current = now;
        const fps = samples.length;
        const lastDelta = samples.length > 1
          ? samples[samples.length - 1] - samples[samples.length - 2]
          : 0;
        setObservability({
          fps,
          frameTimeMs: lastDelta,
        });
      }

      rafRef.current = requestAnimationFrame(tick);
    };
    rafRef.current = requestAnimationFrame(tick);
    return () => {
      if (rafRef.current != null) cancelAnimationFrame(rafRef.current);
    };
  }, [setObservability, opts?.enabled]);
}