import { describe, it, expect, beforeEach } from "vitest";
import {
  addComment,
  listComments,
  deleteComment,
  countComments,
} from "@/lib/comment-store";
import { prisma } from "@/lib/db";
import { saveArtwork } from "@/lib/artwork-store";
import { type Artwork, type Soundtrack, defaultShaderGraph } from "@/lib/types";
import { generateSeed } from "@/lib/seed";

const TEST_ARTWORK = "comments-test-art";
const OTHER_ARTWORK = "comments-other-art";

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
  const a: Artwork = {
    id,
    seed: generateSeed(),
    soundtrack: emptySoundtrack(),
    audioDNA: zeroAudioDNA(),
    shaderGraph: defaultShaderGraph(),
    createdAt: new Date().toISOString(),
    creator: "comment-test",
  };
  await saveArtwork(a);
}

async function cleanup() {
  await prisma.comment.deleteMany({
    where: { artworkId: { in: [TEST_ARTWORK, OTHER_ARTWORK] } },
  });
  await prisma.artwork.deleteMany({
    where: { id: { in: [TEST_ARTWORK, OTHER_ARTWORK] } },
  });
}

describe("comment-store — addComment / listComments / deleteComment", () => {
  beforeEach(async () => {
    await cleanup();
    await makeArtwork(TEST_ARTWORK);
    await makeArtwork(OTHER_ARTWORK);
  });

  it("adds a comment with default anonymous author", async () => {
    const c = await addComment({ artworkId: TEST_ARTWORK, body: "First!" });
    expect(c.body).toBe("First!");
    expect(c.author).toBe("anonymous");
    expect(c.id).toBeTruthy();
    expect(c.createdAt).toMatch(/^\d{4}-\d{2}-\d{2}T/);
  });

  it("trims body and respects max length", async () => {
    const longBody = "x".repeat(5000);
    const c = await addComment({ artworkId: TEST_ARTWORK, body: longBody });
    expect(c.body.length).toBe(2000);
  });

  it("throws on empty body", async () => {
    await expect(
      addComment({ artworkId: TEST_ARTWORK, body: "   " }),
    ).rejects.toThrow();
  });

  it("clamps author to 60 chars and falls back to anonymous", async () => {
    const c = await addComment({
      artworkId: TEST_ARTWORK,
      body: "hi",
      author: "  " + "a".repeat(120) + "  ",
    });
    expect(c.author.length).toBe(60);
    expect(c.author.startsWith("a")).toBe(true);
  });

  it("defaults to anonymous when author omitted or blank", async () => {
    const c = await addComment({ artworkId: TEST_ARTWORK, body: "yo" });
    expect(c.author).toBe("anonymous");
  });

  it("lists comments oldest-first for a single artwork", async () => {
    await addComment({ artworkId: TEST_ARTWORK, body: "first" });
    await new Promise((r) => setTimeout(r, 5));
    await addComment({ artworkId: TEST_ARTWORK, body: "second" });
    await new Promise((r) => setTimeout(r, 5));
    await addComment({ artworkId: TEST_ARTWORK, body: "third" });

    const list = await listComments(TEST_ARTWORK);
    expect(list).toHaveLength(3);
    expect(list[0].body).toBe("first");
    expect(list[2].body).toBe("third");
  });

  it("scopes list to artwork", async () => {
    await addComment({ artworkId: TEST_ARTWORK, body: "A1" });
    await addComment({ artworkId: OTHER_ARTWORK, body: "B1" });
    const a = await listComments(TEST_ARTWORK);
    const b = await listComments(OTHER_ARTWORK);
    expect(a.every((c) => c.artworkId === TEST_ARTWORK)).toBe(true);
    expect(b.every((c) => c.artworkId === OTHER_ARTWORK)).toBe(true);
    expect(a.find((c) => c.body === "B1")).toBe(undefined);
    expect(b.find((c) => c.body === "A1")).toBe(undefined);
  });

  it("deleteComment returns true for existing, false for missing", async () => {
    const c = await addComment({ artworkId: TEST_ARTWORK, body: "delete me" });
    expect(await deleteComment(c.id)).toBe(true);
    expect(await deleteComment(c.id)).toBe(false);
    expect(await deleteComment("nope")).toBe(false);
  });

  it("countComments returns the right number", async () => {
    expect(await countComments(TEST_ARTWORK)).toBe(0);
    await addComment({ artworkId: TEST_ARTWORK, body: "1" });
    await addComment({ artworkId: TEST_ARTWORK, body: "2" });
    expect(await countComments(TEST_ARTWORK)).toBe(2);
  });
});