/**
 * useAudioPlayback — React hook that owns the AudioPlayback lifecycle and
 * feeds band levels into the engine store on every animation frame.
 *
 * Lifecycle:
 *   - On mount: create the AudioPlayback graph
 *   - On `playing` flip: resume/suspend the AudioContext + play/pause the <audio>
 *   - On every frame: read bands → store.setAudioBands(bass, mid, treble, onset)
 *   - On unmount: dispose()
 *
 * Returns a stable handle: { audio, isPlaying, play, pause, toggle, seek, currentTime, duration }.
 */

"use client";

import { useEffect, useRef, useState, useCallback } from "react";
import {
  createAudioPlayback,
  resumeAudio,
  suspendAudio,
  type AudioPlayback,
} from "./playback";
import { readBands } from "./analyser";
import { useEngineStore } from "@/lib/engine/store";

export type AudioPlaybackHandle = {
  audio: HTMLAudioElement | null;
  isPlaying: boolean;
  isReady: boolean;
  play: () => Promise<void>;
  pause: () => void;
  toggle: () => void;
  seek: (time: number) => void;
  currentTime: number;
  duration: number;
};

export function useAudioPlayback(
  src: string | null,
  enabled: boolean,
): AudioPlaybackHandle {
  const [isPlaying, setIsPlaying] = useState(false);
  const [isReady, setIsReady] = useState(false);
  const [currentTime, setCurrentTime] = useState(0);
  const [duration, setDuration] = useState(0);
  const playbackRef = useRef<AudioPlayback | null>(null);
  const lastFrameTimeRef = useRef(0);
  const setAudioBands = useEngineStore((s) => s.setAudioBands);

  // Create / dispose the playback graph
  useEffect(() => {
    if (!src || !enabled) {
      // Sync the engine store + local state to "no audio playing" when
      // audio is disabled or unavailable. This is the canonical
      // prop→state pattern; setState inside useEffect is correct here
      // because we want to mirror the external prop change into state.
      // eslint-disable-next-line react-hooks/set-state-in-effect
      setIsReady(false);
      // eslint-disable-next-line react-hooks/set-state-in-effect
      setIsPlaying(false);
      setAudioBands(0, 0, 0, 0);
      return;
    }

    let cancelled = false;
    let raf = 0;
    let disposePlayback: (() => void) | null = null;

    (async () => {
      try {
        const playback = createAudioPlayback(src);
        if (cancelled) {
          playback.dispose();
          return;
        }
        playbackRef.current = playback;
        lastFrameTimeRef.current = performance.now();

        const audio = playback.audio;
        const onLoaded = () => {
          if (cancelled) return;
          setIsReady(true);
          setDuration(audio.duration || 0);
        };
        const onTime = () => {
          if (cancelled) return;
          setCurrentTime(audio.currentTime);
        };
        const onEnded = () => {
          if (cancelled) return;
          audio.currentTime = 0;
          if (!audio.paused) audio.play();
        };
        audio.addEventListener("loadedmetadata", onLoaded);
        audio.addEventListener("timeupdate", onTime);
        audio.addEventListener("ended", onEnded);
        audio.addEventListener("canplay", onLoaded);

        const tick = () => {
          if (cancelled) return;
          const now = performance.now();
          const dt = Math.min(0.1, (now - lastFrameTimeRef.current) / 1000);
          lastFrameTimeRef.current = now;
          try {
            const bands = readBands(playback, dt);
            setAudioBands(bands.bass, bands.mid, bands.treble, bands.onset);
          } catch {
            // analyser not ready yet
          }
          raf = requestAnimationFrame(tick);
        };
        raf = requestAnimationFrame(tick);

        disposePlayback = () => {
          audio.removeEventListener("loadedmetadata", onLoaded);
          audio.removeEventListener("timeupdate", onTime);
          audio.removeEventListener("ended", onEnded);
          audio.removeEventListener("canplay", onLoaded);
          cancelAnimationFrame(raf);
          playback.dispose();
        };
      } catch (e) {
        console.warn("[audio] could not create playback:", e);
      }
    })();

    return () => {
      cancelled = true;
      if (disposePlayback) disposePlayback();
      playbackRef.current = null;
    };
  }, [src, enabled, setAudioBands]);

  const play = useCallback(async () => {
    const playback = playbackRef.current;
    if (!playback) return;
    await resumeAudio();
    try {
      await playback.audio.play();
      setIsPlaying(true);
    } catch (e) {
      console.warn("[audio] play() rejected:", e);
    }
  }, []);

  const pause = useCallback(() => {
    const playback = playbackRef.current;
    if (!playback) return;
    playback.audio.pause();
    void suspendAudio();
    setIsPlaying(false);
  }, []);

  const toggle = useCallback(() => {
    if (isPlaying) pause();
    else void play();
  }, [isPlaying, play, pause]);

  const seek = useCallback((t: number) => {
    const playback = playbackRef.current;
    if (!playback) return;
    const d = playback.audio.duration || t;
    playback.audio.currentTime = Math.max(0, Math.min(t, d));
    setCurrentTime(playback.audio.currentTime);
  }, []);

  return {
    audio: playbackRef.current?.audio ?? null,
    isPlaying,
    isReady,
    play,
    pause,
    toggle,
    seek,
    currentTime,
    duration,
  };
}
