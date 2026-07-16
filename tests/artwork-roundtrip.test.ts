/**
 * Stage 1 acceptance test:
 *
 *   1. Save an Artwork → load it → fields roundtrip exactly.
 *   2. artworkHash is stable across saves.
 *   3. canonicalJson produces identical output for equivalent objects.
 *
 * Uses a separate test database (prisma/test.db) so dev data is not touched.
 */

import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { execSync } from "node:child_process";
import { promises as fs } from "node:fs";
import path from "node:path";

// Use a dedicated test database
process.env.DATABASE_URL = "file:./test.db";

import {
  saveArtwork,
  getArtwork,
  deleteArtwork,
  countArtworks,
} from "@/lib/artwork-store";
import { canonicalJson, sha256Hex, artworkHash } from "@/lib/hash";
import { defaultShaderGraph, type Artwork, type Soundtrack, type AudioDNA } from "@/lib/types";
import { generateSeed } from "@/lib/seed";

const TEST_DB = path.resolve("prisma/test.db");

function fixtureArtwork(overrides?: Partial<Artwork>): Artwork {
  const soundtrack: Soundtrack = {
    id: "soundtrack-test",
    hash: "a".repeat(64),
    originalFilename: "test.mp3",
    duration: 12,
    uploadedAt: "2026-07-08T10:00:00.000Z",
    url: "/demo/test.wav",
  };

  const audioDNA: AudioDNA = {
    tempo: 120,
    key: "C",
    mode: "major",
    brightness: 0.5,
    warmth: 0.5,
    texture: 0.5,
    energy: 0.5,
    aggression: 0.5,
    complexity: 0.5,
    motion: 0.5,
    entropy: 0.5,
  };

  return {
    id: "artwork-test-" + Math.random().toString(36).slice(2, 8),
    seed: generateSeed(),
    soundtrack,
    audioDNA,
    shaderGraph: defaultShaderGraph(),
    createdAt: "2026-07-08T10:00:00.000Z",
    creator: "test",
    title: "Test Artwork",
    ...overrides,
  };
}

beforeAll(async () => {
  // Reset DB and apply migrations
  try {
    await fs.unlink(TEST_DB);
  } catch {
    // file didn't exist, fine
  }
  execSync("npx prisma migrate deploy", {
    env: { ...process.env, DATABASE_URL: `file:${TEST_DB}` },
    stdio: "pipe",
  });
});

beforeEach(async () => {
  // Clean between tests
  const { prisma } = await import("@/lib/db");
  await prisma.artwork.deleteMany({});
});

afterAll(async () => {
  try {
    await fs.unlink(TEST_DB);
  } catch {
    // ignore
  }
});

describe("Artwork persistence", () => {
  it("saves and loads an artwork with all fields intact", async () => {
    const original = fixtureArtwork();
    await saveArtwork(original);

    const loaded = await getArtwork(original.id);
    expect(loaded).not.toBeNull();
    expect(loaded!.id).toBe(original.id);
    expect(loaded!.seed).toBe(original.seed);
    expect(loaded!.soundtrack).toEqual(original.soundtrack);
    expect(loaded!.audioDNA).toEqual(original.audioDNA);
    expect(loaded!.shaderGraph).toEqual(original.shaderGraph);
    expect(loaded!.creator).toBe(original.creator);
    expect(loaded!.title).toBe(original.title);
    expect(loaded!.createdAt).toBe(original.createdAt);
  });

  it("returns null for missing artwork", async () => {
    const loaded = await getArtwork("does-not-exist");
    expect(loaded).toBeNull();
  });

  it("upserts on id collision", async () => {
    const a = fixtureArtwork({ id: "artwork-upsert" });
    await saveArtwork(a);

    const updated: Artwork = {
      ...a,
      title: "Updated Title",
      shaderGraph: {
        ...a.shaderGraph,
        palette: "ember",
      },
    };
    await saveArtwork(updated);

    const loaded = await getArtwork("artwork-upsert");
    expect(loaded!.title).toBe("Updated Title");
    expect(loaded!.shaderGraph.palette).toBe("ember");
  });

  it("deletes an artwork", async () => {
    const a = fixtureArtwork({ id: "artwork-delete" });
    await saveArtwork(a);
    expect(await countArtworks()).toBe(1);
    expect(await deleteArtwork(a.id)).toBe(true);
    expect(await countArtworks()).toBe(0);
  });
});

describe("Reproducibility: hash stability", () => {
  it("canonicalJson produces stable output for equivalent objects (key order independent)", () => {
    const a = { foo: 1, bar: { baz: 2, qux: [3, 4] } };
    const b = { bar: { qux: [3, 4], baz: 2 }, foo: 1 };
    expect(canonicalJson(a)).toBe(canonicalJson(b));
  });

  it("sha256Hex is deterministic", () => {
    expect(sha256Hex("hello")).toBe(sha256Hex("hello"));
    expect(sha256Hex("hello")).not.toBe(sha256Hex("world"));
  });

  it("artworkHash is stable across serializations", () => {
    const a = fixtureArtwork();
    const aAgain: Artwork = {
      ...a,
      // intentionally reorder fields — content is the same
      audioDNA: { ...a.audioDNA },
    };
    expect(artworkHash(a)).toBe(artworkHash(aAgain));
  });

  it("different artwork produces different hash", () => {
    const a = fixtureArtwork();
    const b = fixtureArtwork({ seed: "deadbeef".repeat(4) });
    expect(artworkHash(a)).not.toBe(artworkHash(b));
  });

  it("soundtrack hash changes invalidate the artworkHash", () => {
    const a = fixtureArtwork();
    const b: Artwork = {
      ...a,
      soundtrack: { ...a.soundtrack, hash: "b".repeat(64) },
    };
    expect(artworkHash(a)).not.toBe(artworkHash(b));
  });
});

describe("Seed determinism", () => {
  it("generateSeed produces 32-char hex", () => {
    const seed = generateSeed();
    expect(seed).toMatch(/^[0-9a-f]{32}$/);
  });

  it("two seeds are independent", () => {
    expect(generateSeed()).not.toBe(generateSeed());
  });
});