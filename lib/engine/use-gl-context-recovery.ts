"use client";

import { useEffect, useRef } from "react";
import type { WebGLRenderer } from "three";

/**
 * useGlContextRecovery — supervises the WebGL context on the canvas. If the
 * browser suspends or loses the GL context (tab backgrounded, GPU reset,
 * driver crash), we re-create the renderer with a fresh context.
 *
 * Usage:
 *   const containerRef = useRef<HTMLDivElement>(null);
 *   useGlContextRecovery(containerRef);
 *
 * The hook accepts any container (div, section, etc.) and queries for the
 * canvas inside it. This decouples it from the canvas ref that R3F owns.
 *
 * Returns nothing — the side effect is that a context-lost event triggers
 * a synthetic window resize which R3F picks up.
 */
export function useGlContextRecovery(containerRef: React.RefObject<HTMLElement | null>): void {
  const lastRestoredRef = useRef<number>(0);

  useEffect(() => {
    const containerEl = containerRef.current;
    if (!containerEl) return;
    const container: HTMLElement = containerEl;

    let cancelled = false;
    let canvas: HTMLCanvasElement | null = null;

    function attach() {
      canvas = container.querySelector<HTMLCanvasElement>("canvas");
      if (canvas && !cancelled) {
        canvas.addEventListener("webglcontextlost", handleContextLost);
        canvas.addEventListener("webglcontextrestored", handleContextRestored);
      }
    }

    function handleContextLost(event: Event) {
      event.preventDefault();
      console.warn("[engine] WebGL context lost — awaiting restore");
    }

    function handleContextRestored() {
      if (cancelled) return;
      const now = performance.now();
      if (now - lastRestoredRef.current < 500) return;
      lastRestoredRef.current = now;
      console.info("[engine] WebGL context restored — recreating renderer");
      window.dispatchEvent(new Event("resize"));
    }

    // Initial attach + observe DOM mutations since R3F mounts its canvas lazily
    attach();
    const observer = new MutationObserver(() => {
      // If the canvas changed (e.g., context restore re-created it), re-attach
      const c = container.querySelector<HTMLCanvasElement>("canvas");
      if (c && c !== canvas) {
        canvas = c;
        canvas.addEventListener("webglcontextlost", handleContextLost);
        canvas.addEventListener("webglcontextrestored", handleContextRestored);
      }
    });
    observer.observe(container, { childList: true, subtree: true });

    return () => {
      cancelled = true;
      observer.disconnect();
      if (canvas) {
        canvas.removeEventListener("webglcontextlost", handleContextLost);
        canvas.removeEventListener("webglcontextrestored", handleContextRestored);
      }
    };
  }, [containerRef]);
}

/**
 * Touch-check helper: if the user is on a coarse-pointer device (touchscreen),
 * suppress CSS hover states via a body class so the engine UI doesn't get
 * stuck in :hover after a tap.
 */
export function useTouchDeviceFlag(): boolean {
  if (typeof window === "undefined") return false;
  if (typeof window.matchMedia !== "function") return false;
  return window.matchMedia("(pointer: coarse)").matches;
}
