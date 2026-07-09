import { NextResponse } from "next/server";
import { getArtwork, deleteArtwork } from "@/lib/artwork-store";
import { resolveArtwork } from "@/lib/variant-resolver";

/**
 * GET    /api/artworks/[id]  — load Artwork record from DB.
 *                            Variant ids (`${parentId}--${mood}`) resolve
 *                            to the parent Artwork with mood applied.
 * DELETE /api/artworks/[id]  — remove (Stage 9+ for gallery admin).
 */

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
  const artwork = await resolveArtwork(id);
  if (!artwork) {
    return NextResponse.json({ error: "not_found", id }, { status: 404 });
  }
  return NextResponse.json(artwork);
}

export async function DELETE(
  _request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
  const removed = await deleteArtwork(id);
  if (!removed) {
    return NextResponse.json({ error: "not_found", id }, { status: 404 });
  }
  return NextResponse.json({ id, deleted: true });
}