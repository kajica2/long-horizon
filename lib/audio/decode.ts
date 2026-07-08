/**
 * Audio decode — any input format (mp3, wav, ogg, flac, m4a) → mono PCM at 22050 Hz.
 *
 * Uses the bundled ffmpeg static binary from @ffmpeg-installer/ffmpeg.
 * Output is raw 16-bit signed little-endian PCM, ready for essentia.js.
 */

import { spawn } from "node:child_process";
import ffmpegInstaller from "@ffmpeg-installer/ffmpeg";

const ffmpegPath = ffmpegInstaller.path;

const TARGET_SAMPLE_RATE = 22050;

export type DecodedAudio = {
  sampleRate: number;
  samples: Float32Array;
  durationSeconds: number;
};

/**
 * Decode an audio file (Buffer) to mono Float32 PCM at 22050 Hz.
 *
 * The ffmpeg process streams raw PCM to stdout; we read it incrementally
 * to avoid buffering the entire file in memory. Duration is computed
 * from the decoded sample count, avoiding a separate ffprobe dependency.
 */
export async function decodeAudio(buffer: Buffer): Promise<DecodedAudio> {
  return new Promise((resolve, reject) => {
    const chunks: Buffer[] = [];
    const proc = spawn(
      ffmpegPath,
      [
        "-i", "pipe:0",            // input from stdin
        "-f", "s16le",             // output format: raw 16-bit LE PCM
        "-acodec", "pcm_s16le",
        "-ac", "1",                // mono
        "-ar", String(TARGET_SAMPLE_RATE),
        "-loglevel", "error",
        "pipe:1",                  // output to stdout
      ],
      { stdio: ["pipe", "pipe", "pipe"] },
    );

    proc.stdout.on("data", (chunk: Buffer) => chunks.push(chunk));
    proc.stderr.on("data", (chunk: Buffer) => {
      // Surface ffmpeg errors to the parent
      process.stderr.write(`[ffmpeg] ${chunk.toString()}`);
    });

    proc.on("error", reject);

    proc.on("close", (code) => {
      if (code !== 0) {
        reject(new Error(`ffmpeg exited with code ${code}`));
        return;
      }
      const raw = Buffer.concat(chunks);
      const samples = new Float32Array(raw.length / 2);
      for (let i = 0; i < samples.length; i++) {
        samples[i] = raw.readInt16LE(i * 2) / 32768;
      }
      const durationSeconds = samples.length / TARGET_SAMPLE_RATE;
      resolve({ sampleRate: TARGET_SAMPLE_RATE, samples, durationSeconds });
    });

    proc.stdin.on("error", (err: NodeJS.ErrnoException) => {
      if (err.code !== "EPIPE") reject(err);
    });
    proc.stdin.end(buffer);
  });
}

/**
 * Compute the SHA-256 hash of an audio file's bytes.
 * Used as the canonical Soundtrack identifier.
 */
export function hashAudio(buffer: Buffer): string {
  const { createHash } = require("node:crypto") as typeof import("node:crypto");
  return createHash("sha256").update(buffer).digest("hex");
}