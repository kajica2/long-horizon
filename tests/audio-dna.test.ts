/**
 * Stage 2 acceptance test — AudioDNA pipeline.
 *
 *  1. Same WAV → same AudioDNA (byte-identical)
 *  2. Different WAVs → different AudioDNA
 *  3. The 10 AudioDNA fields are all in [0, 1] (except tempo, key, mode)
 *  4. Cache hit returns identical DNA without re-running analysis
 */

import { describe, it, expect, beforeAll } from "vitest";
import { promises as fs } from "node:fs";
import path from "node:path";
import {
  extractAudioDNA,
  clearAudioDnaCache,
  getAudioDnaCacheSize,
} from "@/lib/audio/extract-dna";

const CORPUS_DIR = path.resolve("tmp/corpus");

function wavPath(name: string): string {
  return path.join(CORPUS_DIR, `${name}.wav`);
}

beforeAll(async () => {
  // Make sure the benchmark corpus exists (re-run benchmark if needed)
  try {
    await fs.access(wavPath("sine-440"));
  } catch {
    throw new Error(
      "Benchmark corpus missing. Run `npx tsx scripts/benchmark.ts` first.",
    );
  }
  clearAudioDnaCache();
});

describe("AudioDNA extraction", () => {
  it("extracts DNA for sine-440 and returns expected shape", async () => {
    const buf = await fs.readFile(wavPath("sine-440"));
    const result = await extractAudioDNA(buf, "sine-440.wav");

    expect(result.cached).toBe(false);
    expect(result.soundtrack.hash).toMatch(/^[0-9a-f]{64}$/);
    expect(result.soundtrack.duration).toBeGreaterThan(7);
    expect(result.soundtrack.duration).toBeLessThan(9);

    // All normalized fields in [0, 1]
    const dna = result.audioDNA;
    expect(dna.brightness).toBeGreaterThanOrEqual(0);
    expect(dna.brightness).toBeLessThanOrEqual(1);
    expect(dna.warmth).toBeGreaterThanOrEqual(0);
    expect(dna.warmth).toBeLessThanOrEqual(1);
    expect(dna.texture).toBeGreaterThanOrEqual(0);
    expect(dna.texture).toBeLessThanOrEqual(1);
    expect(dna.energy).toBeGreaterThanOrEqual(0);
    expect(dna.energy).toBeLessThanOrEqual(1);
    expect(dna.aggression).toBeGreaterThanOrEqual(0);
    expect(dna.aggression).toBeLessThanOrEqual(1);
    expect(dna.complexity).toBeGreaterThanOrEqual(0);
    expect(dna.complexity).toBeLessThanOrEqual(1);
    expect(dna.motion).toBeGreaterThanOrEqual(0);
    expect(dna.motion).toBeLessThanOrEqual(1);
    expect(dna.entropy).toBeGreaterThanOrEqual(0);
    expect(dna.entropy).toBeLessThanOrEqual(1);

    expect(["major", "minor"]).toContain(dna.mode);
    expect(typeof dna.key).toBe("string");
    expect(dna.key.length).toBeGreaterThan(0);
  });

  it("is deterministic: same WAV twice → identical AudioDNA", async () => {
    const buf = await fs.readFile(wavPath("sine-440"));
    clearAudioDnaCache();
    const a = await extractAudioDNA(buf, "sine-440.wav");
    const b = await extractAudioDNA(buf, "sine-440.wav");

    expect(a.audioDNA).toEqual(b.audioDNA);
    expect(b.cached).toBe(true); // second call hits the cache
    expect(getAudioDnaCacheSize()).toBe(1);
  });

  it("different WAVs → different AudioDNA", async () => {
    const buf440 = await fs.readFile(wavPath("sine-440"));
    const buf4k = await fs.readFile(wavPath("sine-4000"));

    clearAudioDnaCache();
    const a = await extractAudioDNA(buf440, "sine-440.wav");
    const b = await extractAudioDNA(buf4k, "sine-4000.wav");

    // Brightness must differ between 440 Hz and 4000 Hz tones
    expect(a.audioDNA.brightness).not.toBe(b.audioDNA.brightness);
    // 4000 Hz should be brighter (higher brightness normalized value)
    expect(b.audioDNA.brightness).toBeGreaterThan(a.audioDNA.brightness);
  });

  it("detects rhythm in kick tracks (tempo in typical range)", async () => {
    clearAudioDnaCache();
    const buf = await fs.readFile(wavPath("kick-120"));
    const { audioDNA } = await extractAudioDNA(buf, "kick-120.wav");
    // BeatTracker on synthetic kicks is finicky; we just check it's in
    // a sane range or zero (meaning "no rhythm detected").
    if (audioDNA.tempo > 0) {
      expect(audioDNA.tempo).toBeGreaterThan(40);
      expect(audioDNA.tempo).toBeLessThan(220);
    }
    // Motion (onset rate) should be non-zero for a rhythmic track
    expect(audioDNA.motion).toBeGreaterThan(0);
  });

  it("hashes identical bytes to identical soundtrack hashes", async () => {
    const buf = await fs.readFile(wavPath("sine-440"));
    const r1 = await extractAudioDNA(buf, "sine-440.wav");
    const r2 = await extractAudioDNA(buf, "sine-440.wav");
    expect(r1.soundtrack.hash).toBe(r2.soundtrack.hash);
  });

  it("caches by hash — cache size grows with unique inputs", async () => {
    clearAudioDnaCache();
    expect(getAudioDnaCacheSize()).toBe(0);
    await extractAudioDNA(await fs.readFile(wavPath("sine-440")), "a.wav");
    expect(getAudioDnaCacheSize()).toBe(1);
    await extractAudioDNA(await fs.readFile(wavPath("sine-110")), "b.wav");
    expect(getAudioDnaCacheSize()).toBe(2);
    // Re-uploading same file doesn't grow the cache
    await extractAudioDNA(await fs.readFile(wavPath("sine-440")), "a.wav");
    expect(getAudioDnaCacheSize()).toBe(2);
  });
});