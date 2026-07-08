import { NextResponse } from "next/server";
import { extractAudioDNA } from "@/lib/audio/extract-dna";

export const runtime = "nodejs"; // ffmpeg + essentia WASM are Node-only
export const maxDuration = 30;    // seconds; matches our v1 latency target

/**
 * POST /api/audio/dna
 *
 * Accepts: multipart/form-data with a "file" field (mp3, wav, ogg, flac, m4a).
 * Returns: { soundtrack: Soundtrack, audioDNA: AudioDNA, cached: boolean }
 *
 * Stage 2 — implemented with essentia.js + ffmpeg decode.
 */
export async function POST(request: Request) {
  let formData: FormData;
  try {
    formData = await request.formData();
  } catch {
    return NextResponse.json(
      { error: "invalid_form_data", message: "Expected multipart/form-data with a 'file' field." },
      { status: 400 },
    );
  }

  const file = formData.get("file");
  if (!(file instanceof File)) {
    return NextResponse.json(
      { error: "missing_file", message: "Field 'file' is required." },
      { status: 400 },
    );
  }

  if (file.size === 0) {
    return NextResponse.json(
      { error: "empty_file", message: "Uploaded file is empty." },
      { status: 400 },
    );
  }

  // 50 MB upload cap for v1 (Stage 11 will revisit based on real usage)
  const MAX_BYTES = 50 * 1024 * 1024;
  if (file.size > MAX_BYTES) {
    return NextResponse.json(
      {
        error: "file_too_large",
        message: `Maximum upload size is ${MAX_BYTES / 1024 / 1024} MB.`,
      },
      { status: 413 },
    );
  }

  try {
    const buffer = Buffer.from(await file.arrayBuffer());
    const result = await extractAudioDNA(buffer, file.name);
    return NextResponse.json(result, { status: 200 });
  } catch (err) {
    console.error("[/api/audio/dna] extraction failed:", err);
    return NextResponse.json(
      {
        error: "extraction_failed",
        message: err instanceof Error ? err.message : "unknown error",
      },
      { status: 500 },
    );
  }
}

/**
 * GET — endpoint metadata (handy for browser debugging).
 */
export async function GET() {
  return NextResponse.json({
    endpoint: "POST /api/audio/dna",
    accepts: "multipart/form-data { file: audio/* }",
    returns: "{ soundtrack, audioDNA, cached }",
    maxUploadBytes: 50 * 1024 * 1024,
    backend: "essentia.js + ffmpeg",
  });
}