import { NextResponse } from "next/server";
import { getArtwork, deleteArtwork } from "@/lib/artwork-store";

/**
 * GET    /api/artworks/[id]  — load Artwork record from DB.
 * DELETE /api/artworks/[id]  — remove (Stage 9+ for gallery admin).
 */

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
  const artwork = await getArtwork(id);
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