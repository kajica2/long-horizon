"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import type { VisualDNA, PaletteName } from "@/lib/types";

type UploadState =
  | { stage: "idle" }
  | { stage: "uploading"; filename: string }
  | { stage: "analysing"; filename: string }
  | { stage: "ready"; filename: string; visualDNA: VisualDNA; suggestedPalette: PaletteName; previewUrl: string }
  | { stage: "creating" }
  | { stage: "error"; message: string };

const MAX_BYTES = 25 * 1024 * 1024;
const ACCEPT = "image/png,image/jpeg,image/webp,image/gif,image/avif,image/tiff";

/**
 * UploadPanel — drops or selects an image, runs it through /api/visual/dna,
 * shows the resulting VisualDNA features + palette, and on "Create" POSTs
 * to /api/visual/create which saves the Artwork and returns its id.
 * Then it navigates to /engine/[id].
 */
export function UploadPanel() {
  const [state, setState] = useState<UploadState>({ stage: "idle" });
  const [title, setTitle] = useState("");
  const [dragOver, setDragOver] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);

  const handleFile = useCallback(async (file: File) => {
    if (file.size > MAX_BYTES) {
      setState({ stage: "error", message: `File exceeds ${MAX_BYTES / (1024 * 1024)} MB.` });
      return;
    }
    setState({ stage: "uploading", filename: file.name });
    const fd = new FormData();
    fd.append("file", file);
    const previewUrl = URL.createObjectURL(file);
    try {
      setState({ stage: "analysing", filename: file.name });
      const res = await fetch("/api/visual/dna", { method: "POST", body: fd });
      if (!res.ok) {
        const body = await res.json().catch(() => ({ message: "unknown" }));
        URL.revokeObjectURL(previewUrl);
        setState({ stage: "error", message: body.message ?? `HTTP ${res.status}` });
        return;
      }
      const json = (await res.json()) as { visualDNA: VisualDNA; suggestedPalette: PaletteName };
      setState({
        stage: "ready",
        filename: file.name,
        visualDNA: json.visualDNA,
        suggestedPalette: json.suggestedPalette,
        previewUrl,
      });
      if (!title) setTitle(file.name.replace(/\.[^.]+$/, ""));
    } catch (err) {
      URL.revokeObjectURL(previewUrl);
      setState({
        stage: "error",
        message: err instanceof Error ? err.message : "Upload failed",
      });
    }
  }, [title]);

  // Cleanup preview URL on unmount or state change
  useEffect(() => {
    return () => {
      if (state.stage === "ready") URL.revokeObjectURL(state.previewUrl);
    };
  }, [state]);

  async function createArtwork() {
    if (state.stage !== "ready") return;
    setState({ ...state, stage: "creating" });
    try {
      const res = await fetch("/api/visual/create", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          visualDNA: state.visualDNA,
          title: title || "Untitled (VisualDNA)",
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

  function pickAnother() {
    if (state.stage === "ready") URL.revokeObjectURL(state.previewUrl);
    setState({ stage: "idle" });
    setTitle("");
    fileRef.current?.click();
  }

  return (
    <div className="rounded-2xl border border-border bg-background-elevated p-6">
      <p className="mb-1 text-xs tracking-[0.3em] uppercase text-foreground-subtle">
        Step 02 · Image-driven
      </p>
      <h2 className="mb-2 text-2xl font-light">Upload any image</h2>
      <p className="mb-5 text-sm text-foreground-muted">
        The image is decoded, downsampled, then run through k-means palette extraction
        + Sobel edge detection + texture complexity + composition analysis. The result
        is a VisualDNA — a 13-feature genome that drives the engine.
      </p>

      {state.stage === "idle" && (
        <DropZone
          onFile={handleFile}
          onDragChange={setDragOver}
          dragOver={dragOver}
          fileRef={fileRef}
        />
      )}

      {(state.stage === "uploading" || state.stage === "analysing") && (
        <StatusBlock filename={state.filename} stage={state.stage} />
      )}

      {state.stage === "ready" && (
        <ReadyBlock
          state={state}
          title={title}
          onTitleChange={setTitle}
          onCreate={createArtwork}
          onCancel={pickAnother}
        />
      )}

      {state.stage === "creating" && (
        <div className="rounded-xl border border-border bg-background-glass p-6 text-center text-sm text-foreground-muted">
          Saving artwork and entering engine…
        </div>
      )}

      {state.stage === "error" && (
        <div className="rounded-xl border border-aurora-pink/30 bg-aurora-pink/5 p-4 text-sm">
          <p className="font-medium text-aurora-pink">{state.message}</p>
          <button
            onClick={() => setState({ stage: "idle" })}
            className="mt-3 rounded-md border border-border px-3 py-1 text-xs hover:border-border-strong"
          >
            Try again
          </button>
        </div>
      )}
    </div>
  );
}

function DropZone({
  onFile,
  onDragChange,
  dragOver,
  fileRef,
}: {
  onFile: (file: File) => void;
  onDragChange: (v: boolean) => void;
  dragOver: boolean;
  fileRef: React.RefObject<HTMLInputElement | null>;
}) {
  return (
    <label
      className={
        "flex flex-col items-center justify-center rounded-xl border-2 border-dashed p-10 text-center transition-base cursor-pointer " +
        (dragOver
          ? "border-aurora-cyan bg-aurora-cyan/5"
          : "border-border hover:border-border-strong hover:bg-background-glass")
      }
      onDragEnter={(e) => {
        e.preventDefault();
        onDragChange(true);
      }}
      onDragOver={(e) => {
        e.preventDefault();
        onDragChange(true);
      }}
      onDragLeave={() => onDragChange(false)}
      onDrop={(e) => {
        e.preventDefault();
        onDragChange(false);
        const f = e.dataTransfer.files[0];
        if (f) onFile(f);
      }}
    >
      <input
        ref={fileRef}
        type="file"
        accept={ACCEPT}
        className="hidden"
        onChange={(e) => {
          const f = e.target.files?.[0];
          if (f) onFile(f);
        }}
      />
      <p className="mb-2 font-mono text-[10px] tracking-[0.2em] uppercase text-foreground-subtle">
        Drop image here or click to choose
      </p>
      <p className="text-sm text-foreground-muted">
        PNG, JPEG, WebP, GIF, AVIF, TIFF · up to 25 MB
      </p>
      <p className="mt-3 font-mono text-[10px] text-foreground-subtle">
        .png  ·  .jpg  ·  .jpeg  ·  .webp  ·  .gif  ·  .avif  ·  .tiff
      </p>
    </label>
  );
}

function StatusBlock({
  filename,
  stage,
}: {
  filename: string;
  stage: "uploading" | "analysing";
}) {
  return (
    <div className="rounded-xl border border-border bg-background-glass p-6">
      <p className="font-mono text-[10px] tracking-[0.2em] uppercase text-foreground-subtle">
        {stage === "uploading" ? "Uploading" : "Analysing"}
      </p>
      <p className="mt-1 text-sm text-foreground-muted">{filename}</p>
      <div className="mt-4 h-1 overflow-hidden rounded-full bg-border">
        <div
          className={
            "h-full bg-aurora-cyan " +
            (stage === "uploading" ? "w-1/3 animate-pulse" : "w-2/3")
          }
        />
      </div>
    </div>
  );
}

function ReadyBlock({
  state,
  title,
  onTitleChange,
  onCreate,
  onCancel,
}: {
  state: { stage: "ready"; filename: string; visualDNA: VisualDNA; suggestedPalette: PaletteName; previewUrl: string };
  title: string;
  onTitleChange: (v: string) => void;
  onCreate: () => void;
  onCancel: () => void;
}) {
  const dna = state.visualDNA;
  return (
    <div className="space-y-5">
      {/* Preview + palette */}
      <div className="grid gap-4 md:grid-cols-[200px_1fr]">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          src={state.previewUrl}
          alt={state.filename}
          className="aspect-square w-full rounded-lg object-cover"
        />
        <div>
          <p className="font-mono text-[10px] tracking-[0.2em] uppercase text-foreground-subtle">
            Palette · {state.suggestedPalette}
          </p>
          <div className="mt-2 flex gap-1">
            {dna.palette.map((hex, i) => (
              <div
                key={i}
                className="h-10 flex-1 rounded"
                style={{ background: hex }}
                title={hex}
              />
            ))}
          </div>
          <div className="mt-3 grid grid-cols-2 gap-2 text-xs">
            <Bar label="Brightness" v={dna.brightness} />
            <Bar label="Contrast" v={dna.contrast} />
            <Bar label="Saturation" v={dna.saturation} />
            <Bar label="Warmth" v={dna.warmth} />
            <Bar label="Edge density" v={dna.edgeDensity} />
            <Bar label="Texture" v={dna.textureComplexity} />
          </div>
        </div>
      </div>

      {/* Title + create */}
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
            onClick={onCancel}
            className="rounded-md border border-border px-5 py-2 text-sm text-foreground-muted transition-base hover:border-border-strong hover:text-foreground"
          >
            Pick another
          </button>
        </div>
        <p className="mt-3 font-mono text-[10px] text-foreground-subtle">
          VisualDNA hash · <span className="text-foreground-muted">{dna.hash.slice(0, 16)}…</span>
        </p>
      </div>
    </div>
  );
}

function Bar({ label, v }: { label: string; v: number }) {
  const pct = Math.round(v * 100);
  return (
    <div>
      <div className="mb-1 flex justify-between text-foreground-subtle">
        <span>{label}</span>
        <span className="font-mono">{pct}%</span>
      </div>
      <div className="h-1 overflow-hidden rounded-full bg-border">
        <div
          className="h-full bg-aurora-cyan"
          style={{ width: `${pct}%` }}
        />
      </div>
    </div>
  );
}
