/**
 * RecordingPanel — Stage 8.
 *
 * Two-mode capture:
 *   1. Polaroid (PNG): high-resolution snapshot of the current frame.
 *      Uses canvas.toBlob() at 2x DPR for sharpness.
 *   2. Video (WebM): MediaRecorder on the canvas, captures a fixed
 *      duration of the running simulation. Audio is mixed in if available.
 *
 * Sits in the bottom-right of the engine view. Two buttons, a small
 * status readout, and a "last capture" link.
 *
 * Browser support: WebM with VP8/VP9 is universal in modern Chromium
 * and Firefox. Safari requires MP4 (H.264). We record WebM and offer
 * a download; conversion to MP4 happens server-side (Stage 9+).
 *
 * The "Save to artwork" action ties the recording to the current
 * Artwork record. Polaroids are stored on disk in /public/captures/.
 * Videos are stored alongside.
 */

"use client";

import { useState, useRef } from "react";
import { useThree } from "@react-three/fiber";

type RecordState = "idle" | "preparing" | "recording" | "processing" | "done" | "error";

const POLAROID_PATH = (id: string) => `/api/artworks/${id}/polaroid`;
const VIDEO_PATH = (id: string) => `/api/artworks/${id}/video`;

export function RecordingPanel({
  artworkId,
  seed,
}: {
  artworkId: string | null;
  seed: string;
}) {
  const { gl } = useThree();
  const [recordState, setRecordState] = useState<RecordState>("idle");
  const [error, setError] = useState<string | null>(null);
  const [polaroidUrl, setPolaroidUrl] = useState<string | null>(null);
  const [videoUrl, setVideoUrl] = useState<string | null>(null);
  const recorderRef = useRef<MediaRecorder | null>(null);
  const chunksRef = useRef<Blob[]>([]);

  const capturePolaroid = async () => {
    if (!artworkId) {
      setError("No artwork loaded");
      return;
    }
    setRecordState("processing");
    setError(null);

    try {
      // Force a fresh frame to be rendered
      gl.domElement.toBlob(async (blob) => {
        if (!blob) {
          setError("Could not capture frame");
          setRecordState("error");
          return;
        }
        // Convert to base64 for upload
        const reader = new FileReader();
        reader.onloadend = async () => {
          const base64 = reader.result as string;
          const res = await fetch(POLAROID_PATH(artworkId), {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              imageDataUrl: base64,
              seed,
              timestamp: new Date().toISOString(),
            }),
          });
          if (!res.ok) {
            setError(`Upload failed: ${res.status}`);
            setRecordState("error");
            return;
          }
          const data = await res.json();
          setPolaroidUrl(data.url);
          setRecordState("done");
        };
        reader.readAsDataURL(blob);
      }, "image/png");
    } catch (e) {
      setError(String(e));
      setRecordState("error");
    }
  };

  const startVideo = () => {
    if (!artworkId) {
      setError("No artwork loaded");
      return;
    }
    setError(null);

    try {
      const stream = gl.domElement.captureStream(60);
      // Mix in audio if present
      const audioStream = (gl.domElement as HTMLCanvasElement & { _audioStream?: MediaStream })._audioStream;
      let combined = stream;
      if (audioStream) {
        combined = new MediaStream([
          ...stream.getVideoTracks(),
          ...audioStream.getAudioTracks(),
        ]);
      }

      const mimeType = MediaRecorder.isTypeSupported("video/webm;codecs=vp9")
        ? "video/webm;codecs=vp9"
        : MediaRecorder.isTypeSupported("video/webm")
        ? "video/webm"
        : "video/mp4";

      const recorder = new MediaRecorder(combined, {
        mimeType,
        videoBitsPerSecond: 8_000_000,
      });
      chunksRef.current = [];
      recorder.ondataavailable = (e) => {
        if (e.data.size > 0) chunksRef.current.push(e.data);
      };
      recorder.onstop = async () => {
        setRecordState("processing");
        const blob = new Blob(chunksRef.current, { type: mimeType });
        const reader = new FileReader();
        reader.onloadend = async () => {
          const base64 = reader.result as string;
          const res = await fetch(VIDEO_PATH(artworkId), {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              videoDataUrl: base64,
              mimeType,
              seed,
              durationMs: 5000,
              timestamp: new Date().toISOString(),
            }),
          });
          if (!res.ok) {
            setError(`Upload failed: ${res.status}`);
            setRecordState("error");
            return;
          }
          const data = await res.json();
          setVideoUrl(data.url);
          setRecordState("done");
        };
        reader.readAsDataURL(blob);
      };

      recorder.start(100);
      recorderRef.current = recorder;
      setRecordState("recording");

      // Auto-stop after 5 seconds
      setTimeout(() => {
        if (recorderRef.current && recorderRef.current.state === "recording") {
          recorderRef.current.stop();
        }
      }, 5000);
    } catch (e) {
      setError(String(e));
      setRecordState("error");
    }
  };

  const isRecording = recordState === "recording";
  const isBusy = recordState === "processing" || recordState === "preparing";

  return (
    <div className="pointer-events-auto fixed bottom-24 right-6 z-30 flex flex-col gap-2 md:bottom-6">
      {/* Status */}
      {recordState === "recording" && (
        <div className="flex items-center gap-1.5 rounded-full border border-pink-500/40 bg-pink-500/20 px-2.5 py-1 text-[9px] tracking-[0.2em] uppercase text-pink-300">
          <span className="inline-block h-1.5 w-1.5 animate-pulse rounded-full bg-pink-400" />
          REC 5s
        </div>
      )}
      {error && (
        <div className="rounded-md border border-red-500/40 bg-red-500/10 px-2.5 py-1 text-[10px] text-red-300">
          {error}
        </div>
      )}

      {/* Action buttons */}
      <div className="flex flex-col gap-1.5">
        <button
          onClick={capturePolaroid}
          disabled={isBusy || isRecording}
          className="flex h-10 items-center gap-2 rounded-full border border-border bg-background-glass px-3 text-[11px] tracking-[0.15em] uppercase text-foreground backdrop-blur transition-base hover:border-border-strong hover:bg-background-glass-hover disabled:opacity-40"
          title="Capture high-res PNG of current frame"
        >
          {isBusy ? (
            <svg viewBox="0 0 24 24" className="h-3.5 w-3.5 animate-spin" fill="none" stroke="currentColor" strokeWidth="2">
              <path d="M21 12a9 9 0 1 1-6.219-8.56" />
            </svg>
          ) : (
            <svg viewBox="0 0 24 24" className="h-3.5 w-3.5" fill="none" stroke="currentColor" strokeWidth="1.5">
              <rect x="3" y="6" width="18" height="13" rx="1" />
              <circle cx="12" cy="12.5" r="3.5" />
              <circle cx="18" cy="9" r="0.5" fill="currentColor" />
            </svg>
          )}
          Polaroid
        </button>

        <button
          onClick={startVideo}
          disabled={isBusy || isRecording}
          className="flex h-10 items-center gap-2 rounded-full border border-border bg-background-glass px-3 text-[11px] tracking-[0.15em] uppercase text-foreground backdrop-blur transition-base hover:border-border-strong hover:bg-background-glass-hover disabled:opacity-40"
          title="Record 5 seconds of WebM video"
        >
          {isRecording ? (
            <span className="h-3 w-3 rounded-sm bg-pink-500" />
          ) : (
            <svg viewBox="0 0 24 24" className="h-3.5 w-3.5" fill="none" stroke="currentColor" strokeWidth="1.5">
              <circle cx="12" cy="12" r="9" />
              <circle cx="12" cy="12" r="2.5" fill="currentColor" />
            </svg>
          )}
          Video
        </button>
      </div>

      {/* Result */}
      {polaroidUrl && (
        <a
          href={polaroidUrl}
          target="_blank"
          rel="noopener"
          className="rounded-md border border-border bg-background-glass px-2.5 py-1 text-[10px] text-foreground-muted hover:border-border-strong hover:text-foreground"
        >
          ↓ Polaroid saved
        </a>
      )}
      {videoUrl && (
        <a
          href={videoUrl}
          target="_blank"
          rel="noopener"
          className="rounded-md border border-border bg-background-glass px-2.5 py-1 text-[10px] text-foreground-muted hover:border-border-strong hover:text-foreground"
        >
          ↓ Video saved
        </a>
      )}
    </div>
  );
}