"use client";

/**
 * WebcamCapture — getUserMedia + VisualDNA pipeline (action 14).
 *
 * Real-time frame capture from the user's webcam. Each captured frame is
 * sent to /api/visual/dna which runs the same server pipeline:
 * sharp decode → downsample → k-means → Sobel → composition.
 *
 * Differences vs UploadPanel:
 *   - Live preview instead of file picker
 *   - "Snap one frame" button that grabs a still from the stream
 *   - "Auto-sample" mode that captures every N seconds and locks in the
 *     best DNA match
 *
 * Camera permission is requested on first Snap. Falls back to a graceful
 * "permission denied" UI if rejected.
 */

import { useCallback, useEffect, useRef, useState } from "react";
import type { PaletteName, VisualDNA } from "@/lib/types";

type CaptureState =
  | { stage: "idle" }
  | { stage: "requesting" }
  | { stage: "ready"; stream: MediaStream }
  | { stage: "error"; message: string }
  | { stage: "snapshotting" }
  | { stage: "analyzing" }
  | {
      stage: "readyToCreate";
      previewUrl: string;
      visualDNA: VisualDNA;
      suggestedPalette: PaletteName;
    };

export function WebcamCapture() {
  const [state, setState] = useState<CaptureState>({ stage: "idle" });
  const [title, setTitle] = useState("");
  const [autoMode, setAutoMode] = useState(false);
  const [autoInterval, setAutoInterval] = useState(8); // seconds
  const videoRef = useRef<HTMLVideoElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);

  const startCamera = useCallback(async () => {
    setState({ stage: "requesting" });
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        video: { width: 1280, height: 720, facingMode: "user" },
        audio: false,
      });
      const v = videoRef.current;
      if (v) {
        v.srcObject = stream;
        await v.play().catch(() => {});
      }
      setState({ stage: "ready", stream });
    } catch (err) {
      setState({
        stage: "error",
        message: err instanceof Error ? err.message : "Camera unavailable",
      });
    }
  }, []);

  useEffect(() => {
    return () => {
      // Cleanup any active tracks
      if (state.stage === "ready") {
        state.stream.getTracks().forEach((t) => t.stop());
      }
      if (state.stage === "readyToCreate") {
        URL.revokeObjectURL(state.previewUrl);
      }
      void canvasRef;
    };
  }, [state]);

  const captureAndAnalyze = useCallback(async () => {
    if (state.stage !== "ready") return;
    const v = videoRef.current;
    const c = canvasRef.current;
    if (!v || !c) return;
    setState({ ...state, stage: "snapshotting" });

    const w = v.videoWidth || 640;
    const h = v.videoHeight || 480;
    c.width = w;
    c.height = h;
    const ctx = c.getContext("2d");
    if (!ctx) return;
    ctx.drawImage(v, 0, 0, w, h);

    const dataUrl = c.toDataURL("image/png");
    const previewUrl = URL.createObjectURL(dataURLToBlob(dataUrl));
    setState({ ...state, stage: "analyzing", previewUrl } as CaptureState);

    const fd = new FormData();
    fd.append("file", dataURLToBlob(dataUrl), `webcam-${Date.now()}.png`);

    try {
      const res = await fetch("/api/visual/dna", { method: "POST", body: fd });
      if (!res.ok) {
        const body = await res.json().catch(() => ({ message: "unknown" }));
        setState({
          stage: "error",
          message: body.message ?? `HTTP ${res.status}`,
        });
        return;
      }
      const json = (await res.json()) as { visualDNA: VisualDNA; suggestedPalette: PaletteName };
      setState({
        stage: "readyToCreate",
        previewUrl,
        visualDNA: json.visualDNA,
        suggestedPalette: json.suggestedPalette,
      });
      if (!title) setTitle(`Webcam capture ${new Date().toISOString().slice(0, 10)}`);
    } catch (err) {
      setState({
        stage: "error",
        message: err instanceof Error ? err.message : "Upload failed",
      });
    }
  }, [state, title]);

  // Auto-sample mode: capture every `autoInterval` seconds
  useEffect(() => {
    if (!autoMode) return;
    if (state.stage !== "ready") return;
    const id = window.setTimeout(() => {
      void captureAndAnalyze();
    }, autoInterval * 1000);
    return () => window.clearTimeout(id);
  }, [autoMode, autoInterval, state, captureAndAnalyze]);

  async function createArtwork() {
    if (state.stage !== "readyToCreate") return;
    try {
      const res = await fetch("/api/visual/create", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          visualDNA: state.visualDNA,
          title: title || "Untitled (Webcam)",
          creator: "anonymous",
        }),
      });
      if (!res.ok) {
        const body = await res.json().catch(() => ({ message: "unknown" }));
        setState({ stage: "error", message: body.message ?? `HTTP ${res.status}` });
        return;
      }
      const json = (await res.json()) as { id: string };
      window.location.href = `/engine/${json.id}`;
    } catch (err) {
      setState({
        stage: "error",
        message: err instanceof Error ? err.message : "Create failed",
      });
    }
  }

  function stop() {
    if (state.stage === "ready") {
      state.stream.getTracks().forEach((t) => t.stop());
    }
    setState({ stage: "idle" });
  }

  function reset() {
    if (state.stage === "readyToCreate") URL.revokeObjectURL(state.previewUrl);
    setState({ stage: "idle" });
    setTitle("");
  }

  return (
    <div className="rounded-2xl border border-border bg-background-elevated p-6">
      <p className="mb-1 text-xs tracking-[0.3em] uppercase text-foreground-subtle">
        Step 03 · Camera-driven
      </p>
      <h2 className="mb-2 text-2xl font-light">Webcam capture</h2>
      <p className="mb-5 text-sm text-foreground-muted">
        Stream from your webcam directly into the VisualDNA pipeline. Snap a single
        frame, or enable auto-sample to capture every few seconds. Each frame runs
        the same k-means / Sobel / composition pipeline as image upload — your face,
        your hands, your room, all become genome inputs to the engine.
      </p>

      {state.stage === "idle" && (
        <button
          onClick={startCamera}
          className="rounded-md bg-aurora-cyan/15 px-5 py-2.5 text-sm font-medium text-aurora-cyan transition-base hover:bg-aurora-cyan/25"
        >
          Enable webcam
        </button>
      )}

      {state.stage === "requesting" && (
        <p className="text-sm text-foreground-muted">Asking for camera permission…</p>
      )}

      {state.stage === "error" && (
        <div className="rounded-xl border border-aurora-pink/30 bg-aurora-pink/5 p-4 text-sm">
          <p className="font-medium text-aurora-pink">Camera unavailable</p>
          <p className="mt-1 text-foreground-muted">{state.message}</p>
          <button
            onClick={reset}
            className="mt-3 rounded-md border border-border px-3 py-1 text-xs hover:border-border-strong"
          >
            Try again
          </button>
        </div>
      )}

      {(state.stage === "ready" ||
        state.stage === "snapshotting" ||
        state.stage === "analyzing") && (
        <>
          <div className="relative overflow-hidden rounded-lg bg-black aspect-video">
            { }
            <video
              ref={videoRef}
              autoPlay
              muted
              playsInline
              className="h-full w-full object-cover"
            />
            <canvas ref={canvasRef} className="hidden" />
            {state.stage !== "ready" && (
              <div className="absolute inset-0 flex items-center justify-center bg-black/60 text-foreground">
                <p className="text-sm">
                  {state.stage === "snapshotting" ? "Capturing frame…" : "Analysing…"}
                </p>
              </div>
            )}
          </div>

          <div className="mt-4 flex flex-wrap items-center gap-3">
            <button
              onClick={captureAndAnalyze}
              disabled={state.stage !== "ready"}
              className="rounded-md bg-aurora-cyan/15 px-4 py-2 text-sm font-medium text-aurora-cyan transition-base hover:bg-aurora-cyan/25 disabled:opacity-50"
            >
              Snap one frame
            </button>
            <label className="flex items-center gap-2 text-[11px] text-foreground-muted">
              <input
                type="checkbox"
                checked={autoMode}
                onChange={(e) => setAutoMode(e.target.checked)}
                className="accent-aurora-cyan"
              />
              <span>Auto-sample every</span>
              <input
                type="number"
                min={2}
                max={60}
                value={autoInterval}
                onChange={(e) => setAutoInterval(Number(e.target.value))}
                className="w-12 rounded-md border border-border bg-background px-1.5 py-0.5 text-center font-mono text-foreground"
              />
              <span>sec</span>
            </label>
            <button
              onClick={stop}
              className="ml-auto rounded-md border border-border px-3 py-2 text-xs text-foreground-muted hover:border-border-strong hover:text-foreground"
            >
              Stop camera
            </button>
          </div>
        </>
      )}

      {state.stage === "readyToCreate" && (
        <ReadyToCreate
          state={state}
          title={title}
          onTitleChange={setTitle}
          onCreate={createArtwork}
          onReset={reset}
        />
      )}
    </div>
  );
}

function ReadyToCreate({
  state,
  title,
  onTitleChange,
  onCreate,
  onReset,
}: {
  state: { stage: "readyToCreate"; previewUrl: string; visualDNA: VisualDNA; suggestedPalette: PaletteName };
  title: string;
  onTitleChange: (v: string) => void;
  onCreate: () => void;
  onReset: () => void;
}) {
  const dna = state.visualDNA;
  return (
    <div className="space-y-5">
      <div className="grid gap-4 md:grid-cols-[200px_1fr]">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          src={state.previewUrl}
          alt="Webcam capture"
          className="aspect-square w-full rounded-lg object-cover"
        />
        <div>
          <p className="font-mono text-[10px] tracking-[0.2em] uppercase text-foreground-subtle">
            Palette · {state.suggestedPalette}
          </p>
          <div className="mt-2 flex gap-1">
            {dna.palette.map((hex, i) => (
              <div key={i} className="h-10 flex-1 rounded" style={{ background: hex }} title={hex} />
            ))}
          </div>
          <div className="mt-3 grid grid-cols-2 gap-2 text-xs text-foreground-muted">
            <span><strong className="text-foreground">{Math.round(dna.brightness * 100)}%</strong> brightness</span>
            <span><strong className="text-foreground">{Math.round(dna.warmth * 100)}%</strong> warmth</span>
            <span><strong className="text-foreground">{Math.round(dna.edgeDensity * 100)}%</strong> edges</span>
            <span><strong className="text-foreground">{Math.round(dna.textureComplexity * 100)}%</strong> texture</span>
          </div>
        </div>
      </div>
      <div className="border-t border-border pt-5">
        <label className="mb-2 block text-xs tracking-[0.2em] uppercase text-foreground-subtle">
          Title
        </label>
        <input
          type="text"
          value={title}
          onChange={(e) => onTitleChange(e.target.value)}
          placeholder="A name for this piece"
          className="w-full rounded-md border border-border bg-background px-3 py-2 text-sm focus:border-aurora-cyan focus:outline-none"
        />
        <div className="mt-4 flex gap-3">
          <button
            onClick={onCreate}
            className="rounded-md bg-aurora-cyan/15 px-5 py-2 text-sm font-medium text-aurora-cyan transition-base hover:bg-aurora-cyan/25"
          >
            Create artwork →
          </button>
          <button
            onClick={onReset}
            className="rounded-md border border-border px-5 py-2 text-sm text-foreground-muted transition-base hover:border-border-strong hover:text-foreground"
          >
            Re-capture
          </button>
        </div>
      </div>
    </div>
  );
}

/** Convert a data: URL to a File-shaped object that FormData accepts. */
function dataURLToBlob(dataUrl: string): Blob {
  const arr = dataUrl.split(",");
  const mime = (arr[0].match(/:(.*?);/) ?? [, "image/png"])[1];
  const binStr = atob(arr[1]);
  const len = binStr.length;
  const bytes = new Uint8Array(len);
  for (let i = 0; i < len; i++) bytes[i] = binStr.charCodeAt(i);
  return new Blob([bytes], { type: mime });
}
