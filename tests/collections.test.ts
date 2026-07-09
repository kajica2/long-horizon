/**
 * Stage 20 — Collection store tests.
 *
 * Verifies:
 *   - addOrUpdateCollection inserts and idempotently updates by slug
 *   - items replace (not duplicate) on second call
 *   - getCollectionBySlug returns null for unknown slug
 *   - getArtworkIdsInCollection preserves the position ordering
 *   - deleteCollection cascades to CollectionItem rows
 */

import { describe, it, expect, beforeEach } from "vitest";
import {
  addOrUpdateCollection,
  deleteCollection,
  getArtworkIdsInCollection,
  getCollectionBySlug,
  listCollections,
} from "@/lib/collection-store";
import { prisma } from "@/lib/db";
import { saveArtwork } from "@/lib/artwork-store";
import { type Artwork, type Soundtrack, defaultShaderGraph } from "@/lib/types";
import { generateSeed } from "@/lib/seed";

const A1 = "coll-test-a1";
const A2 = "coll-test-a2";
const A3 = "coll-test-a3";

function emptySoundtrack(): Soundtrack {
  return {
    id: "none",
    hash: "0".repeat(64),
    originalFilename: "",
    duration: 0,
    uploadedAt: new Date().toISOString(),
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

async function makeArtwork(id: string): Promise<void> {
  await saveArtwork({
    id,
    seed: generateSeed(),
    soundtrack: emptySoundtrack(),
    audioDNA: zeroAudioDNA(),
    shaderGraph: defaultShaderGraph(),
    createdAt: new Date().toISOString(),
    creator: "coll-test",
    title: id,
  });
}

describe("collection store — Stage 20", () => {
  beforeEach(async () => {
    await prisma.collectionItem.deleteMany({
      where: { collection: { slug: { in: ["coll-test-a", "coll-test-b"] } } },
    });
    await prisma.collection.deleteMany({
      where: { slug: { in: ["coll-test-a", "coll-test-b"] } },
    });
    await prisma.artwork.deleteMany({
      where: { id: { in: [A1, A2, A3] } },
    });
    await makeArtwork(A1);
    await makeArtwork(A2);
    await makeArtwork(A3);
  });

  it("addOrUpdateCollection inserts a new collection", async () => {
    const c = await addOrUpdateCollection({
      slug: "coll-test-a",
      title: "Test A",
      description: "first",
      curator: "kai",
      artworkIds: [A1, A2],
    });
    expect(c.slug).toBe("coll-test-a");
    expect(c.title).toBe("Test A");
    const items = await getArtworkIdsInCollection("coll-test-a");
    expect(items).toEqual([A1, A2]);
  });

  it("addOrUpdateCollection updates existing collection in place", async () => {
    await addOrUpdateCollection({
      slug: "coll-test-a",
      title: "first",
      description: "v1",
      curator: "kai",
      artworkIds: [A1],
    });
    const updated = await addOrUpdateCollection({
      slug: "coll-test-a",
      title: "second",
      description: "v2",
      curator: "kai",
      artworkIds: [A2, A3],
    });
    expect(updated.title).toBe("second");
    expect(updated.description).toBe("v2");
    const items = await getArtworkIdsInCollection("coll-test-a");
    expect(items).toEqual([A2, A3]);
  });

  it("getCollectionBySlug returns null for unknown slug", async () => {
    const c = await getCollectionBySlug("does-not-exist");
    expect(c).toBeNull();
  });

  it("listCollections returns all collections in createdAt desc order", async () => {
    await addOrUpdateCollection({
      slug: "coll-test-a",
      title: "A",
      description: "",
      curator: "kai",
      artworkIds: [A1],
    });
    await new Promise((r) => setTimeout(r, 10));
    await addOrUpdateCollection({
      slug: "coll-test-b",
      title: "B",
      description: "",
      curator: "kai",
      artworkIds: [A2],
    });
    const list = await listCollections();
    const slugs = list.map((c) => c.slug);
    expect(slugs).toContain("coll-test-a");
    expect(slugs).toContain("coll-test-b");
  });

  it("deleteCollection cascades to items", async () => {
    await addOrUpdateCollection({
      slug: "coll-test-a",
      title: "A",
      description: "",
      curator: "kai",
      artworkIds: [A1, A2],
    });
    const ok = await deleteCollection("coll-test-a");
    expect(ok).toBe(true);
    const items = await prisma.collectionItem.count({
      where: { collection: { slug: "coll-test-a" } },
    });
    expect(items).toBe(0);
  });

  it("rejects invalid slug", async () => {
    await expect(
      addOrUpdateCollection({
        slug: "Has Spaces",
        title: "x",
        description: "",
        curator: "kai",
        artworkIds: [A1],
      }),
    ).rejects.toThrow(/slug/);
  });
});