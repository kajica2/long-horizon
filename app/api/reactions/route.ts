/**
 * /api/reactions — Stage 19
 *
 * POST /api/reactions   { artworkId, likerId, kind? }   toggle (returns {reacted, total})
 * GET  /api/reactions?artworkId=...&likerId=...&kind=...  returns {total, hasReacted}
 */

import { NextRequest, NextResponse } from "next/server";
import {
  getReactionSummary,
  toggleReaction,
  type ReactionKind,
} from "@/lib/reaction-store";

export const dynamic = "force-dynamic";

export async function POST(req: NextRequest) {
  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  if (typeof body !== "object" || body === null) {
    return NextResponse.json({ error: "Body must be an object" }, { status: 400 });
  }
  const { artworkId, likerId, kind } = body as {
    artworkId?: unknown;
    likerId?: unknown;
    kind?: unknown;
  };

  if (typeof artworkId !== "string" || !artworkId) {
    return NextResponse.json({ error: "artworkId required" }, { status: 400 });
  }
  if (typeof likerId !== "string" || !likerId) {
    return NextResponse.json({ error: "likerId required" }, { status: 400 });
  }
  if (kind !== undefined && kind !== "heart") {
    return NextResponse.json({ error: "unsupported kind" }, { status: 400 });
  }

  try {
    const result = await toggleReaction({
      artworkId,
      likerId,
      kind: (kind as ReactionKind | undefined) ?? "heart",
    });
    return NextResponse.json(result);
  } catch (err) {
    const message = err instanceof Error ? err.message : "toggle failed";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

export async function GET(req: NextRequest) {
  const sp = req.nextUrl.searchParams;
  const artworkId = sp.get("artworkId");
  const likerId = sp.get("likerId");
  const kindParam = sp.get("kind");
  if (!artworkId) {
    return NextResponse.json({ error: "artworkId required" }, { status: 400 });
  }
  const kind: ReactionKind = kindParam === "heart" || !kindParam ? "heart" : "heart";
  const summary = await getReactionSummary(artworkId, likerId, kind);
  return NextResponse.json(summary);
}