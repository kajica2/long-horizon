/**
 * AudioDNA orchestrator — file bytes → AudioDNA.
 *
 * Pipeline:  decode → analyze → normalize → AudioDNA
 *
 * Includes a per-process in-memory cache keyed by soundtrack hash. Any
 * duplicate upload within the same Node process is instant.
 */

import { decodeAudio, hashAudio } from "./decode";
import { analyzeAudio } from "./analyze";
import { normalize } from "./normalize";
import type { AudioDNA, Soundtrack } from "../types";

// In-memory cache: hash → AudioDNA. Lost on process restart;
// for cross-process caching, Artwork records already store AudioDNA.
const cache = new Map<string, AudioDNA>();

export type ExtractDnaResult = {
  soundtrack: Soundtrack;
  audioDNA: AudioDNA;
  cached: boolean;
};

/**
 * Extract AudioDNA from a raw audio file.
 *
 * @param buffer     The file bytes (mp3, wav, etc.)
 * @param filename   Original filename for the Soundtrack record
 */
export async function extractAudioDNA(
  buffer: Buffer,
  filename: string,
): Promise<ExtractDnaResult> {
  const hash = hashAudio(buffer);

  // Cache hit?
  const cached = cache.get(hash);
  if (cached) {
    const decoded = await decodeAudio(buffer);
    const soundtrack: Soundtrack = {
      id: `soundtrack-${hash.slice(0, 12)}`,
      hash,
      originalFilename: filename,
      duration: decoded.durationSeconds,
      uploadedAt: new Date().toISOString(),
      url: "",
    };
    return { soundtrack, audioDNA: cached, cached: true };
  }

  // Fresh extraction
  const { samples, durationSeconds } = await decodeAudio(buffer);
  const raw = analyzeAudio(samples);
  const audioDNA = normalize(raw);

  cache.set(hash, audioDNA);

  const soundtrack: Soundtrack = {
    id: `soundtrack-${hash.slice(0, 12)}`,
    hash,
    originalFilename: filename,
    duration: durationSeconds,
    uploadedAt: new Date().toISOString(),
    url: "",
  };

  return { soundtrack, audioDNA, cached: false };
}

export function clearAudioDnaCache(): void {
  cache.clear();
}

export function getAudioDnaCacheSize(): number {
  return cache.size;
}