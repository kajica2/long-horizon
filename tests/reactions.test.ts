/**
 * Stage 19 — Reaction store tests.
 *
 * Verifies:
 *   - toggle creates row on first call, deletes on second
 *   - total reflects current row count
 *   - two different likers both increment total independently
 *   - same liker toggling twice returns to zero
 *   - getReactionSummary reports hasReacted correctly
 *   - countReactionsForArtworks aggregates by artworkId
 */

import { describe, it, expect, beforeEach } from "vitest";
import {
  toggleReaction,
  getReactionSummary,
  countReactionsForArtworks,
  topReactedArtworks,
} from "@/lib/reaction-store";
import { prisma } from "@/lib/db";
import { saveArtwork } from "@/lib/artwork-store";
import { type Artwork, type Soundtrack, defaultShaderGraph } from "@/lib/types";
import { generateSeed } from "@/lib/seed";

const ART = "reactions-test-art";
const ART2 = "reactions-test-art-2";

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
    creator: "reaction-test",
    title: id,
  };
  await saveArtwork(a);
}

describe("reaction store — Stage 19", () => {
  beforeEach(async () => {
    await prisma.reaction.deleteMany({
      where: { artworkId: { in: [ART, ART2] } },
    });
    await prisma.artwork.deleteMany({
      where: { id: { in: [ART, ART2] } },
    });
    await makeArtwork(ART);
    await makeArtwork(ART2);
  });

  it("toggle creates a reaction row on first call", async () => {
    const r = await toggleReaction({ artworkId: ART, likerId: "anon-1" });
    expect(r.reacted).toBe(true);
    expect(r.total).toBe(1);
    expect(r.kind).toBe("heart");
  });

  it("toggle deletes the reaction row on second call", async () => {
    await toggleReaction({ artworkId: ART, likerId: "anon-1" });
    const r = await toggleReaction({ artworkId: ART, likerId: "anon-1" });
    expect(r.reacted).toBe(false);
    expect(r.total).toBe(0);
  });

  it("two different likers both increment total independently", async () => {
    await toggleReaction({ artworkId: ART, likerId: "anon-1" });
    const r = await toggleReaction({ artworkId: ART, likerId: "anon-2" });
    expect(r.reacted).toBe(true);
    expect(r.total).toBe(2);
  });

  it("same liker on a different artwork is independent", async () => {
    await toggleReaction({ artworkId: ART, likerId: "anon-1" });
    const r = await toggleReaction({ artworkId: ART2, likerId: "anon-1" });
    expect(r.total).toBe(1);
  });

  it("getReactionSummary reports hasReacted correctly", async () => {
    await toggleReaction({ artworkId: ART, likerId: "anon-1" });
    const s1 = await getReactionSummary(ART, "anon-1");
    expect(s1.total).toBe(1);
    expect(s1.hasReacted).toBe(true);

    const s2 = await getReactionSummary(ART, "anon-2");
    expect(s2.total).toBe(1);
    expect(s2.hasReacted).toBe(false);
  });

  it("getReactionSummary with null liker reports hasReacted=false", async () => {
    await toggleReaction({ artworkId: ART, likerId: "anon-1" });
    const s = await getReactionSummary(ART, null);
    expect(s.total).toBe(1);
    expect(s.hasReacted).toBe(false);
  });

  it("countReactionsForArtworks returns map keyed by artworkId", async () => {
    await toggleReaction({ artworkId: ART, likerId: "a" });
    await toggleReaction({ artworkId: ART, likerId: "b" });
    await toggleReaction({ artworkId: ART2, likerId: "a" });
    const m = await countReactionsForArtworks([ART, ART2, "missing-art"]);
    expect(m.get(ART)).toBe(2);
    expect(m.get(ART2)).toBe(1);
    expect(m.get("missing-art")).toBeUndefined();
  });

  it("topReactedArtworks returns most-reacted first", async () => {
    await toggleReaction({ artworkId: ART, likerId: "a" });
    await toggleReaction({ artworkId: ART, likerId: "b" });
    await toggleReaction({ artworkId: ART, likerId: "c" });
    await toggleReaction({ artworkId: ART2, likerId: "a" });
    const top = await topReactedArtworks(10);
    expect(top[0]).toEqual({ artworkId: ART, total: 3 });
    expect(top[1]).toEqual({ artworkId: ART2, total: 1 });
  });
});