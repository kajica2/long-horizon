import { NextResponse } from "next/server";
import { extractVisualDNA } from "@/lib/visual/dna";
import { paletteNameFromVisualDNA } from "@/lib/visual/dna";

export const runtime = "nodejs"; // sharp is Node-only
export const maxDuration = 30;    // seconds; matches our v1 latency target

const MAX_BYTES = 25 * 1024 * 1024; // 25 MB

/**
 * POST /api/visual/dna
 *
 * Accepts: multipart/form-data with a "file" field
 *          (png, jpeg, webp, gif, avif, tiff).
 * Returns: { visualDNA: VisualDNA, suggestedPalette: PaletteName }
 *
 * Stage 13 — image-driven genome pipeline.
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

  if (file.size > MAX_BYTES) {
    return NextResponse.json(
      {
        error: "file_too_large",
        message: `File exceeds ${MAX_BYTES / (1024 * 1024)} MB limit.`,
      },
      { status: 413 },
    );
  }

  const buffer = Buffer.from(await file.arrayBuffer());

  let dna;
  try {
    dna = await extractVisualDNA(buffer);
  } catch (err) {
    return NextResponse.json(
      {
        error: "decode_failed",
        message: (err instanceof Error ? err.message : "unknown") +
          " — accepted formats: png, jpeg, webp, gif, avif, tiff.",
      },
      { status: 400 },
    );
  }

  return NextResponse.json({
    visualDNA: dna,
    suggestedPalette: paletteNameFromVisualDNA(dna),
  });
}
