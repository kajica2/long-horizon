import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { saveArtwork } from "@/lib/artwork-store";
import {
  type Artwork,
  type Soundtrack,
  type ShaderGraph,
  type VisualDNA,
  defaultShaderGraph,
} from "@/lib/types";
import {
  paletteNameFromVisualDNA,
} from "@/lib/visual/dna";
import { visualBindingDelta } from "@/lib/visual/bindings";
import { generateSeed } from "@/lib/seed";
import { canonicalJson } from "@/lib/hash";

export const runtime = "nodejs";

/**
 * POST /api/visual/create
 *
 * Body: { visualDNA: VisualDNA, title?: string, creator?: string }
 *
 * Returns: { id: string, hash: string }
 *
 * Creates a new Artwork record from a VisualDNA alone (no audio input).
 * The shaderGraph is built by merging visualDNA-derived param deltas
 * over the default ShaderGraph, and the palette is set from the dominant
 * colour family.
 */
export async function POST(request: Request) {
  let body: { visualDNA?: VisualDNA; title?: string; creator?: string };
  try {
    body = (await request.json()) as typeof body;
  } catch {
    return NextResponse.json(
      { error: "invalid_json", message: "Body must be JSON with a 'visualDNA' field." },
      { status: 400 },
    );
  }

  if (!body.visualDNA || typeof body.visualDNA !== "object") {
    return NextResponse.json(
      { error: "missing_visual_dna", message: "Field 'visualDNA' is required." },
      { status: 400 },
    );
  }

  const dna = body.visualDNA;
  const id = `visual-${generateSeed().slice(0, 12)}`;

  // Build the ShaderGraph
  const shaderGraph = defaultShaderGraph();
  const deltas = visualBindingDelta(dna);
  shaderGraph.params = {
    ...shaderGraph.params,
    ...(deltas as Record<string, number>),
  };
  shaderGraph.palette = paletteNameFromVisualDNA(dna);

  // Build a placeholder Soundtrack (no audio)
  const soundtrack: Soundtrack = {
    id: "none",
    hash: "0000000000000000000000000000000000000000000000000000000000000000",
    originalFilename: "",
    duration: 0,
    uploadedAt: new Date().toISOString(),
    url: "",
  };

  // Zero AudioDNA — VisualDNA replaces it for this artwork
  const audioDNA = {
    tempo: 0,
    key: "C",
    mode: "major" as const,
    brightness: 0,
    warmth: 0,
    texture: 0,
    energy: 0,
    aggression: 0,
    complexity: 0,
    motion: 0,
    entropy: 0,
  };

  const artwork: Artwork = {
    id,
    seed: dna.hash.slice(0, 32), // reproducible seed from the visual hash
    soundtrack,
    audioDNA,
    visualDNA: dna,
    shaderGraph,
    createdAt: new Date().toISOString(),
    creator: body.creator ?? "anonymous",
    title: body.title ?? "Untitled (VisualDNA)",
  };

  try {
    await saveArtwork(artwork);
  } catch (err) {
    return NextResponse.json(
      {
        error: "save_failed",
        message: err instanceof Error ? err.message : "unknown",
      },
      { status: 500 },
    );
  }

  return NextResponse.json(
    { id: artwork.id, hash: dna.hash, title: artwork.title },
    { status: 201 },
  );
}
