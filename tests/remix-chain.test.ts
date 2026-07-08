import { describe, it, expect, beforeEach } from "vitest";
import {
  saveArtwork,
  getArtwork,
  getRemixChain,
  deleteArtwork,
  countArtworks,
} from "@/lib/artwork-store";
import { artworkHash } from "@/lib/hash";
import {
  type Artwork,
  type Soundtrack,
  defaultShaderGraph,
} from "@/lib/types";
import { generateSeed } from "@/lib/seed";

function emptySoundtrack(): Soundtrack {
  return {
    id: "none",
    hash: "0000000000000000000000000000000000000000000000000000000000000000",
    originalFilename: "",
    duration: 0,
    uploadedAt: new Date().toISOString(),
    url: "",
  };
}

function zeroAudioDNA(): Artwork["audioDNA"] {
  return {
    tempo: 0,
    key: "C",
    mode: "major",
    brightness: 0,
    warmth: 0,
    texture: 0,
    energy: 0,
    aggression: 0,
    complexity: 0,
    motion: 0,
    entropy: 0,
  };
}

async function make(id: string, parentId?: string, title?: string): Promise<Artwork> {
  const a: Artwork = {
    id,
    seed: generateSeed(),
    soundtrack: emptySoundtrack(),
    audioDNA: zeroAudioDNA(),
    shaderGraph: defaultShaderGraph(),
    createdAt: new Date().toISOString(),
    creator: "remix-test",
    title: title ?? id,
    parentId,
  };
  await saveArtwork(a);
  return a;
}

describe("remix chain — getRemixChain", () => {
  beforeEach(async () => {
    const before = await countArtworks();
    void before;
    // Cleanup — remove any lingering test artworks
    for (const id of ["chain-a", "chain-b", "chain-c", "chain-d", "chain-cycle"]) {
      await deleteArtwork(id).catch(() => {});
    }
  });

  it("returns just the artwork when there is no parent", async () => {
    await make("chain-a");
    const chain = await getRemixChain("chain-a");
    expect(chain).toHaveLength(1);
    expect(chain[0].id).toBe("chain-a");
  });

  it("walks back through the chain", async () => {
    await make("chain-a"); // root
    await make("chain-b", "chain-a");
    await make("chain-c", "chain-b");
    await make("chain-d", "chain-c");

    // From deepest: should be [d, c, b, a]
    const chain = await getRemixChain("chain-d");
    expect(chain.map((a) => a.id)).toEqual(["chain-d", "chain-c", "chain-b", "chain-a"]);
  });

  it("caps at maxDepth", async () => {
    // Build a chain of 8 levels: a → b → c → d → e → f → g → h
    let prev = "chain-a";
    await make(prev);
    for (const id of ["chain-b", "chain-c", "chain-d", "chain-e", "chain-f", "chain-g", "chain-h"]) {
      await make(id, prev);
      prev = id;
    }
    const chain = await getRemixChain("chain-h", 3);
    expect(chain.length).toBeLessThanOrEqual(3);
    expect(chain.map((a) => a.id)).toEqual(["chain-h", "chain-g", "chain-f"]);
  });

  it("handles missing parents gracefully (chain origin breaks)", async () => {
    await make("chain-b", "non-existent-parent");
    const chain = await getRemixChain("chain-b");
    expect(chain).toHaveLength(1);
    expect(chain[0].id).toBe("chain-b");
  });

  it("detects cycles defensively (does not loop forever)", async () => {
    // Manually create a cycle via direct save
    await make("chain-cycle");
    const cycle: Artwork = {
      id: "chain-cycle-2",
      seed: generateSeed(),
      soundtrack: emptySoundtrack(),
      audioDNA: zeroAudioDNA(),
      shaderGraph: defaultShaderGraph(),
      createdAt: new Date().toISOString(),
      creator: "remix-test",
      title: "cycle-2",
      parentId: "chain-cycle",
    };
    await saveArtwork(cycle);
    // Modify chain-cycle to point at chain-cycle-2 (cycle)
    const orig = await getArtwork("chain-cycle");
    if (orig) {
      await saveArtwork({ ...orig, parentId: "chain-cycle-2" });
    }
    const chain = await getRemixChain("chain-cycle");
    // Should terminate (one entry shown twice, capped)
    expect(chain.length).toBeLessThanOrEqual(7);
  });

  it("returns empty array for non-existent id", async () => {
    const chain = await getRemixChain("this-does-not-exist");
    expect(chain).toEqual([]);
  });
});
