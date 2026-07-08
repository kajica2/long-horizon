/**
 * Polaroid EXIF/metadata — action 19 of the Long Horizon roadmap.
 *
 * Embeds artwork identity into the captured PNG so a downloaded polaroid
 *   carries proof: the artwork hash, seed, system, palette, etc.
 *
 * Uses sharp's withMetadata() to add EXIF IFD0 tEXt chunks to the PNG.
 * Reads back the same data via a sidecar JSON (also written alongside)
 * so the URL is the source of truth, not the raw PNG.
 *
 * Why two surfaces:
 *   - PNG metadata is editable in many viewers, but extraction is fiddly.
 *   - The sidecar JSON is canonical: filename, hash, captured-at, etc.
 *     Anyone can re-derive metadata from the JSON without parsing pixels.
 */

import { promises as fs } from "node:fs";
import path from "node:path";
import sharp from "sharp";
import { canonicalJson } from "@/lib/hash";
import type { PaletteName, LivingSystemName } from "@/lib/types";

export interface PolaroidMetadata {
  artworkId: string;
  artworkHash: string;
  seed: string;
  system: LivingSystemName;
  palette: PaletteName;
  camera: string;
  capturedAt: string; // ISO 8601
  polaroid: string; // polaroid filename
  schema: "long-horizon-polaroid-v1";
}

/** Stringify each PNG textual metadata field under the 1024-byte limit. */
function short(value: string, max = 60): string {
  // tEXt tEXt chunks are limited; keep them short to avoid breaking viewers.
  return value.length <= max ? value : value.slice(0, max);
}

/**
 * Stamp PNG metadata + save a sidecar JSON describing the polaroid.
 *
 * @param imageBuffer Raw PNG bytes (from canvas.toBlob() in the browser)
 * @param meta        Polaroid metadata to embed
 * @param captureDir  Where to write the polaroid + JSON (created if missing)
 * @returns           final filename of the polaroid
 */
export async function savePolaroidWithMetadata(
  imageBuffer: Buffer,
  meta: PolaroidMetadata,
  captureDir: string,
): Promise<{ filename: string; url: string; size: number }> {
  await fs.mkdir(captureDir, { recursive: true });

  const ts = meta.capturedAt.replace(/[:.]/g, "-");
  const filename = `${meta.artworkId}-${ts}.png`;

  // Re-encode the PNG through sharp so we can add metadata reliably.
  // Sharp withMetadata adds EXIF IFD0 + tEXt chunks for PNG.
  const stamped = await sharp(imageBuffer)
    .png()
    .withMetadata({
      exif: {
        IFD0: {
          Software: "Long_Horizon",
          Artist: short(meta.artworkId),
          ImageDescription: short(`artwork-hash:${meta.artworkHash}`),
          Copyright: short(`seed:${meta.seed}; system:${meta.system}; palette:${meta.palette}`),
        },
        // XPComment / XPAuthor are not standard tEXt but sharp handles them
        // — fall back to the sidecar JSON for canonical metadata.
      },
    })
    .toBuffer();

  await fs.writeFile(path.join(captureDir, filename), stamped);

  // Sidecar JSON — canonical, machine-readable
  const sidecar: PolaroidMetadata = { ...meta, polaroid: filename };
  const sidecarPath = path.join(captureDir, `${filename}.json`);
  await fs.writeFile(sidecarPath, canonicalJson(sidecar));

  return {
    filename,
    url: `/captures/${filename}`,
    size: stamped.length,
  };
}

/**
 * Read the sidecar JSON metadata for a polaroid filename, if present.
 */
export async function readPolaroidMetadata(
  captureDir: string,
  filename: string,
): Promise<PolaroidMetadata | null> {
  try {
    const path_ = path.join(captureDir, `${filename}.json`);
    const text = await fs.readFile(path_, "utf-8");
    return JSON.parse(text) as PolaroidMetadata;
  } catch {
    return null;
  }
}

/**
 * Read all polaroids' sidecar metadata for a given artworkId.
 * Returns most-recent-first based on capturedAt.
 */
export async function listPolaroids(
  captureDir: string,
  artworkId: string,
): Promise<PolaroidMetadata[]> {
  try {
    const files = await fs.readdir(captureDir);
    const jsonFiles = files.filter((f) => f.startsWith(`${artworkId}-`) && f.endsWith(".png.json"));
    const out: PolaroidMetadata[] = [];
    for (const f of jsonFiles) {
      try {
        const text = await fs.readFile(path.join(captureDir, f), "utf-8");
        out.push(JSON.parse(text) as PolaroidMetadata);
      } catch {
        // skip malformed
      }
    }
    return out.sort((a, b) => (a.capturedAt < b.capturedAt ? 1 : -1));
  } catch {
    return [];
  }
}

/**
 * Build a PolaroidMetadata from an Artwork + a timestamp.
 * Convenience for the API route.
 */
export function polaroidMetaFromArtwork(
  artworkId: string,
  artworkHash: string,
  seed: string,
  system: LivingSystemName,
  palette: PaletteName,
  camera: string,
  capturedAt: string,
): PolaroidMetadata {
  return {
    artworkId,
    artworkHash,
    seed,
    system,
    palette,
    camera,
    capturedAt,
    polaroid: "",
    schema: "long-horizon-polaroid-v1",
  };
}