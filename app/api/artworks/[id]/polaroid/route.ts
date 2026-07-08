/**
 * /api/artworks/[id]/polaroid — upload a captured frame for an artwork.
 *
 * Stores under /public/captures/{id}-{ts}.png and returns the public URL.
 * The image is a data URL (base64) sent from the client.
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
    const { imageDataUrl, timestamp } = body as {
      imageDataUrl: string;
      timestamp: string;
    };

    if (!imageDataUrl || !imageDataUrl.startsWith("data:image/")) {
      return NextResponse.json({ error: "Invalid image data" }, { status: 400 });
    }

    await fs.mkdir(CAPTURE_DIR, { recursive: true });

    const base64 = imageDataUrl.split(",")[1];
    const buffer = Buffer.from(base64, "base64");
    const ts = (timestamp ?? new Date().toISOString())
      .replace(/[:.]/g, "-");
    const filename = `${id}-${ts}.png`;
    await fs.writeFile(path.join(CAPTURE_DIR, filename), buffer);

    return NextResponse.json({
      url: `/captures/${filename}`,
      filename,
      size: buffer.length,
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
    const files = await fs.readdir(CAPTURE_DIR);
    const matches = files.filter((f) => f.startsWith(`${id}-`) && f.endsWith(".png"));
    return NextResponse.json({
      captures: matches.map((f) => ({
        filename: f,
        url: `/captures/${f}`,
      })),
    });
  } catch (e) {
    return NextResponse.json({ error: String(e) }, { status: 500 });
  }
}