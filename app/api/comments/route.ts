/**
 * /api/comments — list + create comments on an artwork.
 *
 * GET ?artworkId=ID — list all comments for the artwork (oldest-first)
 * POST { artworkId, body, author? } — add a new comment
 */

import { NextResponse } from "next/server";
import { listComments, addComment } from "@/lib/comment-store";

export async function GET(req: Request) {
  try {
    const url = new URL(req.url);
    const artworkId = url.searchParams.get("artworkId");
    if (!artworkId) {
      return NextResponse.json(
        { error: "missing_artwork_id", message: "Query param 'artworkId' is required." },
        { status: 400 },
      );
    }
    const comments = await listComments(artworkId);
    return NextResponse.json({ comments });
  } catch (e) {
    return NextResponse.json({ error: String(e) }, { status: 500 });
  }
}

export async function POST(req: Request) {
  try {
    const body = (await req.json()) as {
      artworkId?: string;
      body?: string;
      author?: string;
    };
    if (!body.artworkId || !body.body) {
      return NextResponse.json(
        { error: "missing_fields", message: "artworkId and body are required." },
        { status: 400 },
      );
    }
    const c = await addComment({
      artworkId: body.artworkId,
      body: body.body,
      author: body.author,
    });
    return NextResponse.json({ comment: c }, { status: 201 });
  } catch (e) {
    return NextResponse.json({ error: String(e) }, { status: 500 });
  }
}