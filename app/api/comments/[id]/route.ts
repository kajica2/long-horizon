/**
 * /api/comments/[id] — DELETE a single comment by id.
 * Used by /a/[id] admin cleanup. No auth yet — anyone with the id can delete.
 */

import { NextResponse } from "next/server";
import { deleteComment } from "@/lib/comment-store";

export async function DELETE(
  _req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const { id } = await params;
    const ok = await deleteComment(id);
    if (!ok) {
      return NextResponse.json(
        { error: "not_found", message: `Comment ${id} not found.` },
        { status: 404 },
      );
    }
    return NextResponse.json({ ok: true });
  } catch (e) {
    return NextResponse.json({ error: String(e) }, { status: 500 });
  }
}