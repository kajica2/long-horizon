/**
 * Audio playback — Web Audio API wrapper for live audio analysis.
 *
 * Sets up:
 *   <audio> element → MediaElementAudioSource → AnalyserNode → destination
 *
 * The AnalyserNode exposes:
 *   - getByteFrequencyData(Uint8Array) — FFT magnitudes per bin
 *   - getByteTimeDomainData(Uint8Array) — waveform samples
 *   - fftSize (we use 2048 → 1024 frequency bins)
 *
 * Stage 5a: build the graph. Stage 5b reads the FFT and turns it into
 * bass/mid/treble values.
 *
 * Browser-only. Calling any function on the server is a no-op.
 */

export type AudioPlayback = {
  /** Underlying <audio> element, exposed so the UI can bind to it. */
  audio: HTMLAudioElement;
  /** Analyser node — 2048 FFT, smoothingTimeConstant 0. */
  analyser: AnalyserNode;
  /** Source node — internal but kept alive to avoid GC. */
  source: MediaElementAudioSourceNode;
  /** Audio context — lazily resumed on first play (browser autoplay rules). */
  ctx: AudioContext;
  /** Disconnect everything, release the <audio> element. */
  dispose: () => void;
  /** True if the AudioContext is currently in 'running' state. */
  isPlaying: () => boolean;
};

let _ctx: AudioContext | null = null;

/** Lazily create a single AudioContext (the browser only wants one). */
export function getAudioContext(): AudioContext {
  if (typeof window === "undefined") {
    throw new Error("AudioContext not available in SSR");
  }
  if (!_ctx) {
    const Ctor = (window.AudioContext ??
      (window as unknown as { webkitAudioContext: typeof AudioContext })
        .webkitAudioContext);
    _ctx = new Ctor();
  }
  return _ctx;
}

/**
 * Create an audio playback graph for the given source URL.
 *
 * - Creates an <audio> element with `crossOrigin = "anonymous"` (CORS-safe)
 * - Pipes it through a MediaElementAudioSource → AnalyserNode → destination
 * - Returns the graph + a `dispose()` to tear it all down
 */
export function createAudioPlayback(src: string): AudioPlayback {
  const ctx = getAudioContext();

  const audio = document.createElement("audio");
  audio.crossOrigin = "anonymous";
  audio.preload = "auto";
  audio.src = src;
  audio.loop = true; // live mode is meant to loop, not stop

  const source = ctx.createMediaElementSource(audio);
  const analyser = ctx.createAnalyser();
  analyser.fftSize = 2048;
  analyser.smoothingTimeConstant = 0; // we do our own smoothing in Stage 5b
  analyser.minDecibels = -90;
  analyser.maxDecibels = -10;

  source.connect(analyser);
  analyser.connect(ctx.destination);

  let disposed = false;
  return {
    audio,
    analyser,
    source,
    ctx,
    isPlaying: () => ctx.state === "running" && !audio.paused && !disposed,
    dispose: () => {
      if (disposed) return;
      disposed = true;
      try {
        audio.pause();
        audio.removeAttribute("src");
        audio.load(); // forces release
        source.disconnect();
        analyser.disconnect();
      } catch {
        // ignore — element may already be detached
      }
    },
  };
}

/**
 * Resume the AudioContext (call from a user gesture — required by autoplay rules).
 */
export async function resumeAudio(): Promise<void> {
  const ctx = getAudioContext();
  if (ctx.state === "suspended") {
    await ctx.resume();
  }
}

/**
 * Suspend the AudioContext (frees the audio thread).
 */
export async function suspendAudio(): Promise<void> {
  const ctx = getAudioContext();
  if (ctx.state === "running") {
    await ctx.suspend();
  }
}
