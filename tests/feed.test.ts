/**
 * Stage 23 — Atom feed tests.
 *
 * Verifies:
 *   - response content-type is application/atom+xml
 *   - response body is valid XML with the Atom namespace
 *   - feed contains one <entry> per artwork, sorted newest-first
 *   - <updated> reflects the latest createdAt
 *   - <lh:hash> extension carries the artwork hash
 *   - XML special characters in titles get escaped
 */

import { describe, it, expect, beforeEach } from "vitest";
import { GET } from "@/app/feed.xml/route";
import { saveArtwork } from "@/lib/artwork-store";
import { prisma } from "@/lib/db";
import { artworkHash } from "@/lib/hash";
import { type Artwork, defaultShaderGraph, type Soundtrack } from "@/lib/types";

const A_OLD = "feed-test-old";
const A_MID = "feed-test-mid";
const A_NEW = "feed-test-new";
const A_XML = "feed-test-xml";
const A_HASH = "feed-test-hash-check";

function fakeRequest(): Request {
  return new Request("http://localhost:3000/feed.xml", {
    headers: { host: "localhost:3000", "x-forwarded-proto": "http" },
  });
}

function emptySoundtrack(): Soundtrack {
  return {
    id: "none",
    hash: "0".repeat(64),
    originalFilename: "",
    duration: 0,
    uploadedAt: new Date(0).toISOString(),
    url: "",
  };
}

function zeroAudioDNA(): Artwork["audioDNA"] {
  return {
    tempo: 0, key: "C", mode: "major",
    brightness: 0, warmth: 0, texture: 0, energy: 0,
    aggression: 0, complexity: 0, motion: 0, entropy: 0,
  };
}

async function makeArtwork(id: string, createdAt: string, title?: string): Promise<Artwork> {
  const a: Artwork = {
    id,
    seed: "feed".padEnd(32, "0"),
    soundtrack: emptySoundtrack(),
    audioDNA: zeroAudioDNA(),
    shaderGraph: defaultShaderGraph(),
    createdAt,
    creator: "feed-test",
    title: title ?? id,
  };
  await saveArtwork(a);
  return a;
}

describe("feed.xml — Stage 23", () => {
  beforeEach(async () => {
    // Wipe any previous test rows so assertions can rely on isolated state.
    await prisma.artwork.deleteMany({
      where: { id: { in: [A_OLD, A_MID, A_NEW, A_XML, A_HASH] } },
    });
    await makeArtwork(A_OLD, new Date(2020, 0, 1).toISOString());
    await makeArtwork(A_MID, new Date(2021, 0, 1).toISOString());
    await makeArtwork(A_XML, new Date(2022, 0, 1).toISOString(), 'Drift & "Dreams" <motion>');
    await makeArtwork(A_NEW, new Date(2024, 0, 1).toISOString());
    await makeArtwork(A_HASH, new Date(2025, 0, 1).toISOString());
  });

  it("returns application/atom+xml content type", async () => {
    const res = await GET(fakeRequest());
    expect(res.headers.get("content-type")).toContain("application/atom+xml");
  });

  it("response body is XML with the Atom namespace", async () => {
    const res = await GET(fakeRequest());
    const body = await res.text();
    expect(body.startsWith('<?xml version="1.0"')).toBe(true);
    expect(body).toContain('xmlns="http://www.w3.org/2005/Atom"');
    expect(body).toContain("<feed");
    expect(body).toContain("<title>");
    expect(body).toContain("<entry>");
  });

  it("contains one entry per test artwork", async () => {
    const res = await GET(fakeRequest());
    const body = await res.text();
    for (const id of [A_OLD, A_MID, A_NEW, A_XML]) {
      expect(body).toContain(`/a/${id}`);
    }
  });

  it("orders entries newest-first by createdAt", async () => {
    const res = await GET(fakeRequest());
    const body = await res.text();
    const indices = [A_NEW, A_XML, A_MID, A_OLD].map(
      (id) => body.indexOf(`/a/${id}`),
    );
    for (const idx of indices) expect(idx).toBeGreaterThan(-1);
    // Each later-test (newer) artwork should appear before each earlier one.
    for (let i = 0; i < indices.length - 1; i++) {
      expect(indices[i]).toBeLessThan(indices[i + 1]);
    }
  });

  it("includes the artwork hash in <lh:hash>", async () => {
    const a = await makeArtwork("feed-hash-check-2", new Date(2025, 5, 1).toISOString());
    const res = await GET(fakeRequest());
    const body = await res.text();
    const expectedHash = artworkHash(a);
    expect(body).toContain(`<lh:hash`);
    expect(body).toContain(expectedHash);
  });

  it("escapes XML special characters in titles", async () => {
    const res = await GET(fakeRequest());
    const body = await res.text();
    // The XML artwork has 'Drift & "Dreams" <motion>' in title.
    // It MUST be escaped in the output.
    expect(body).toContain("Drift &amp; &quot;Dreams&quot; &lt;motion&gt;");
    // The raw unescaped form must NOT appear inside title elements.
    const titleMatches = body.match(/<title>[^<]*<\/title>/g) ?? [];
    for (const t of titleMatches) {
      expect(t).not.toMatch(/&(?!(amp|lt|gt|quot|apos);)/);
    }
  });

  it("includes a self link pointing to /feed.xml", async () => {
    const res = await GET(fakeRequest());
    const body = await res.text();
    expect(body).toContain('rel="self"');
    expect(body).toContain("/feed.xml");
  });

  it("feed <updated> reflects the newest entry across the whole feed", async () => {
    const res = await GET(fakeRequest());
    const body = await res.text();
    const updated = body.match(/<updated>([^<]+)<\/updated>/);
    expect(updated).not.toBeNull();
    // The feed's <updated> must be >= the newest test artwork's createdAt
    // (other seed artworks may be even newer — that's fine).
    const updatedMs = new Date(updated![1]).getTime();
    const newestTestMs = new Date("2025-01-01T00:00:00.000Z").getTime();
    expect(updatedMs).toBeGreaterThanOrEqual(newestTestMs);
  });
});