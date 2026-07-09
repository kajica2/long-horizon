/**
 * Stages 24-28 — Variant resolver tests.
 *
 * Verifies:
 *   - resolveArtwork returns parent Artwork unchanged for plain ids
 *   - resolveArtwork returns a mood variant for `${parent}--${mood}` ids
 *   - resolveArtwork returns null when parent doesn't exist
 *   - resolveArtwork returns null when id has a bad suffix
 */

import { describe, it, expect, beforeEach } from "vitest";
import { resolveArtwork, isVariantId } from "@/lib/variant-resolver";
import { saveArtwork } from "@/lib/artwork-store";
import { prisma } from "@/lib/db";
import { type Artwork, defaultShaderGraph, type Soundtrack } from "@/lib/types";

const PARENT = "resolver-test-parent";

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

async function makeParent(): Promise<void> {
  await saveArtwork({
    id: PARENT,
    seed: "feed".padEnd(32, "0"),
    soundtrack: emptySoundtrack(),
    audioDNA: zeroAudioDNA(),
    shaderGraph: {
      ...defaultShaderGraph(),
      palette: "aurora",
      camera: "drone",
    },
    createdAt: new Date(2024, 0, 1).toISOString(),
    creator: "resolver-test",
    title: "Parent",
  });
}

describe("variant-resolver — Stage 24-28", () => {
  beforeEach(async () => {
    await prisma.artwork.deleteMany({ where: { id: PARENT } });
    await makeParent();
  });

  it("returns parent unchanged for plain ids", async () => {
    const r = await resolveArtwork(PARENT);
    expect(r).not.toBeNull();
    expect(r!.id).toBe(PARENT);
    expect(r!.title).toBe("Parent");
    expect(r!.shaderGraph.palette).toBe("aurora");
  });

  it("returns a mood variant for ${parent}--${mood} ids", async () => {
    const r = await resolveArtwork(`${PARENT}--night`);
    expect(r).not.toBeNull();
    expect(r!.id).toBe(`${PARENT}--night`);
    expect(r!.title).toBe("Night — Parent");
    expect(r!.shaderGraph.palette).toBe("ink");
  });

  it("returns null for variant id whose parent doesn't exist", async () => {
    const r = await resolveArtwork(`does-not-exist--morning`);
    expect(r).toBeNull();
  });

  it("returns null for an id with an unknown mood suffix", async () => {
    const r = await resolveArtwork(`${PARENT}--dawn`);
    // Parser rejects 'dawn' so the id is treated as a plain id → not found.
    expect(r).toBeNull();
  });

  it("isVariantId recognises the variant shape", () => {
    expect(isVariantId("a--morning")).toBe(true);
    expect(isVariantId("a--rebirth")).toBe(true);
    expect(isVariantId("a")).toBe(false);
    expect(isVariantId("a--dawn")).toBe(false);
  });

  it("returns null for empty id", async () => {
    const r = await resolveArtwork("");
    expect(r).toBeNull();
  });
});