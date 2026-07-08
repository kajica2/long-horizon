import { NextResponse } from "next/server";
import type { Artwork } from "@/lib/types";
import { saveArtwork, countArtworks } from "@/lib/artwork-store";

/**
 * POST /api/artworks  — save an Artwork record (persists to DB).
 * GET  /api/artworks  — count + meta (paginated list ships in Stage 9).
 */

export async function POST(request: Request) {
  try {
    const body = (await request.json()) as Partial<Artwork>;

    if (
      !body.id ||
      !body.seed ||
      !body.soundtrack ||
      !body.audioDNA ||
      !body.shaderGraph
    ) {
      return NextResponse.json(
        {
          error: "invalid_payload",
          required: ["id", "seed", "soundtrack", "audioDNA", "shaderGraph"],
        },
        { status: 400 },
      );
    }

    await saveArtwork(body as Artwork);
    return NextResponse.json(
      { id: body.id, url: `/a/${body.id}` },
      { status: 201 },
    );
  } catch (err) {
    return NextResponse.json(
      {
        error: "save_failed",
        message: err instanceof Error ? err.message : "unknown",
      },
      { status: 500 },
    );
  }
}

export async function GET() {
  const count = await countArtworks();
  return NextResponse.json({
    endpoint: "POST /api/artworks | GET /api/artworks/[id]",
    count,
    status: "Stage 1 — Prisma + SQLite persistence",
  });
}