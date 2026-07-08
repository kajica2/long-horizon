/**
 * /api/artworks/[id]/polaroid — upload a captured frame for an artwork.
 *
 * Action 19 of the Long Horizon roadmap: the polaroid is stamped with
 * artwork identity metadata so a downloaded PNG carries proof of which
 * genome produced it.
 *
 * Two surfaces:
 *   - POST: receives a base64 data URL from the client, the artwork's
 *     metadata from the engine store, writes the PNG with embedded
 *     metadata + a sidecar JSON.
 *   - GET: lists all polaroids for an artwork, with their metadata.
 *
 * Sidecar JSON is canonical. PNG metadata is best-effort for viewers
 * that read tEXt chunks.
 */

import { NextResponse } from "next/server";
import { promises as fs } from "node:fs";
import path from "node:path";
import { getArtwork } from "@/lib/artwork-store";
import { artworkHash } from "@/lib/hash";
import {
  savePolaroidWithMetadata,
  readPolaroidMetadata,
  listPolaroids,
  type PolaroidMetadata,
} from "@/lib/engine/polaroid-meta";

const CAPTURE_DIR = path.resolve("./public/captures");

export async function POST(
  req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const { id } = await params;
    const body = (await req.json()) as {
      imageDataUrl: string;
      timestamp?: string;
      camera?: string;
    };

    if (!body.imageDataUrl || !body.imageDataUrl.startsWith("data:image/")) {
      return NextResponse.json({ error: "Invalid image data" }, { status: 400 });
    }

    const artwork = await getArtwork(id);
    if (!artwork) {
      return NextResponse.json({ error: "Artwork not found" }, { status: 404 });
    }

    const base64 = body.imageDataUrl.split(",")[1];
    const buffer = Buffer.from(base64, "base64");

    const capturedAt = body.timestamp ?? new Date().toISOString();
    const camera = body.camera ?? "snapshot";

    const meta: PolaroidMetadata = {
      artworkId: id,
      artworkHash: artworkHash(artwork),
      seed: artwork.seed,
      system: artwork.shaderGraph.system,
      palette: artwork.shaderGraph.palette,
      camera,
      capturedAt,
      polaroid: "",
      schema: "long-horizon-polaroid-v1",
    };

    const result = await savePolaroidWithMetadata(buffer, meta, CAPTURE_DIR);

    return NextResponse.json({
      ...result,
      metadata: { ...meta, polaroid: result.filename },
    });
  } catch (e) {
    console.error("[/api/artworks/[id]/polaroid]", e);
    return NextResponse.json({ error: String(e) }, { status: 500 });
  }
}

export async function GET(
  _req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const { id } = await params;
    const files = await fs.readdir(CAPTURE_DIR).catch(() => [] as string[]);
    const matches = files.filter((f) => f.startsWith(`${id}-`) && f.endsWith(".png"));
    const list: PolaroidMetadata[] = [];
    for (const f of matches) {
      const meta = await readPolaroidMetadata(CAPTURE_DIR, f);
      if (meta) list.push(meta);
    }
    return NextResponse.json({
      captures: list.map((meta) => ({
        filename: meta.polaroid,
        url: `/captures/${meta.polaroid}`,
        capturedAt: meta.capturedAt,
        artworkHash: meta.artworkHash,
        schema: meta.schema,
      })),
    });
  } catch (e) {
    return NextResponse.json({ error: String(e) }, { status: 500 });
  }
}

/** GET ?filename=X — return the metadata for one specific polaroid */
export async function HEAD() {
  return new Response(null, { status: 405 });
}
