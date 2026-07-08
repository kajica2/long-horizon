import { NextResponse } from "next/server";
import { getPlanetaryDNA } from "@/lib/planetary/cache";

export const runtime = "nodejs"; // astronomy-engine uses Node-only crypto at init
export const maxDuration = 10;

/**
 * POST /api/planetary/dna
 *
 * Accepts: JSON { timestamp?: string } (optional, defaults to "now")
 * Returns: { dna: PlanetaryDNA, cached: boolean }
 *
 * Stage 3a — planetary genome endpoint. Cheap deterministic compute,
 * cached per-timestamp within the process.
 */
export async function POST(request: Request) {
  let timestamp: string | undefined;

  try {
    const ct = request.headers.get("content-type") ?? "";
    if (ct.includes("application/json")) {
      const body = await request.json().catch(() => ({}));
      timestamp = body.timestamp;
    }
  } catch {
    // ignore parse errors, treat as no timestamp → use "now"
  }

  try {
    const result = getPlanetaryDNA(timestamp);
    return NextResponse.json(result, { status: 200 });
  } catch (err) {
    console.error("[/api/planetary/dna]", err);
    return NextResponse.json(
      {
        error: "compute_failed",
        message: err instanceof Error ? err.message : "unknown error",
      },
      { status: 500 },
    );
  }
}

/**
 * GET — endpoint metadata.
 */
export async function GET() {
  return NextResponse.json({
    endpoint: "POST /api/planetary/dna",
    accepts: "application/json { timestamp?: string }",
    returns: "{ dna: PlanetaryDNA, cached: boolean }",
    backend: "astronomy-engine",
  });
}