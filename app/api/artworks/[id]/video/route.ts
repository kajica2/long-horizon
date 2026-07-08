/**
 * /api/artworks/[id]/video — upload a captured WebM video.
 *
 * Stores under /public/captures/{id}-{ts}.webm and returns the public URL.
 */

import { NextResponse } from "next/server";
import { promises as fs } from "node:fs";
import path from "node:path";

const CAPTURE_DIR = path.resolve("./public/captures");

export async function POST(
  req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const { id } = await params;
    const body = await req.json();
    const { videoDataUrl, mimeType, timestamp } = body as {
      videoDataUrl: string;
      mimeType: string;
      timestamp: string;
    };

    if (!videoDataUrl || !videoDataUrl.startsWith("data:video/")) {
      return NextResponse.json({ error: "Invalid video data" }, { status: 400 });
    }

    await fs.mkdir(CAPTURE_DIR, { recursive: true });

    const base64 = videoDataUrl.split(",")[1];
    const buffer = Buffer.from(base64, "base64");
    const ext = mimeType.includes("mp4") ? "mp4" : "webm";
    const ts = (timestamp ?? new Date().toISOString()).replace(/[:.]/g, "-");
    const filename = `${id}-${ts}.${ext}`;
    await fs.writeFile(path.join(CAPTURE_DIR, filename), buffer);

    return NextResponse.json({
      url: `/captures/${filename}`,
      filename,
      size: buffer.length,
      mimeType,
    });
  } catch (e) {
    console.error("[/api/artworks/[id]/video]", e);
    return NextResponse.json({ error: String(e) }, { status: 500 });
  }
}