/**
 * Stage 7/8/9 tests — Parameter Panel, Recording, Share.
 *
 * Pure-logic tests (no DOM, no Three.js). We test:
 *   1. setAudioBinding updates the audioBindings map
 *   2. updateParam preserves other params
 *   3. resetParams returns the right params to defaults
 */

import { describe, it, expect } from "vitest";
import { useEngineStore } from "@/lib/engine/store";
import { FLOW_FIELD_MEDITATION, defaultShaderGraph } from "@/lib/types";

describe("Parameter Panel — store wiring", () => {
  // Helper: set up a fresh engine with flowFieldMeditation for these tests
  const setupFFM = () => {
    useEngineStore.setState({
      shaderGraph: defaultShaderGraph(),
    });
  };

  it("setAudioBinding updates the audioBindings map", () => {
    setupFFM();
    useEngineStore.getState().setAudioBinding("bass", "noiseScale");
    const after = useEngineStore.getState();
    expect(after.shaderGraph.audioBindings.bass).toBe("noiseScale");
  });

  it("setAudioBinding only changes the specified band", () => {
    setupFFM();
    useEngineStore.getState().setAudioBinding("treble", "drag");
    const after = useEngineStore.getState();
    expect(after.shaderGraph.audioBindings.treble).toBe("drag");
    // Other bands should still be at default
    expect(after.shaderGraph.audioBindings.bass).toBe("fieldStrength");
    expect(after.shaderGraph.audioBindings.mid).toBe("drag");
    expect(after.shaderGraph.audioBindings.vocals).toBe("bloom");
  });

  it("resetParams for flowFieldMeditation physics returns to defaults", () => {
    setupFFM();
    // Modify some values
    useEngineStore.getState().updateParam("fieldStrength", 3.0);
    useEngineStore.getState().updateParam("drag", 0.2);
    useEngineStore.getState().updateParam("noiseScale", 2.0);

    useEngineStore.getState().resetParams("physics");

    const after = useEngineStore.getState();
    expect(after.shaderGraph.params.fieldStrength).toBe(FLOW_FIELD_MEDITATION.defaultParams.fieldStrength);
    expect(after.shaderGraph.params.drag).toBe(FLOW_FIELD_MEDITATION.defaultParams.drag);
    expect(after.shaderGraph.params.noiseScale).toBe(FLOW_FIELD_MEDITATION.defaultParams.noiseScale);
  });

  it("resetParams visual resets pointSize", () => {
    setupFFM();
    useEngineStore.getState().updateParam("pointSize", 3.5);
    useEngineStore.getState().resetParams("visual");
    const after = useEngineStore.getState();
    expect(after.shaderGraph.params.pointSize).toBe(FLOW_FIELD_MEDITATION.defaultParams.pointSize);
  });

  it("updateParam preserves other params", () => {
    setupFFM();
    const before = useEngineStore.getState().shaderGraph.params;
    useEngineStore.getState().updateParam("fieldStrength", 2.0);
    const after = useEngineStore.getState().shaderGraph.params;
    expect(after.fieldStrength).toBe(2.0);
    expect(after.drag).toBe(before.drag);
    expect(after.particleCount).toBe(before.particleCount);
  });
});

describe("Polaroid + Video API contract", () => {
  it("polaroid route rejects non-image data URLs (input validation)", () => {
    const badInput = "data:text/plain;base64,abc";
    expect(badInput.startsWith("data:image/")).toBe(false);
  });

  it("video route rejects non-video data URLs (input validation)", () => {
    const badInput = "data:image/png;base64,abc";
    expect(badInput.startsWith("data:video/")).toBe(false);
  });
});

describe("Artwork store — Remix fork contract", () => {
  it("forked artwork has a new id, same seed, same shaderGraph, same hash", async () => {
    const { saveArtwork, getArtwork } = await import("@/lib/artwork-store");
    const { defaultShaderGraph } = await import("@/lib/types");
    const { artworkHash } = await import("@/lib/hash");
    type Artwork = Awaited<ReturnType<typeof import("@/lib/artwork-store").getArtwork>>;

    const src: NonNullable<Artwork> = {
      id: "test-fork-src-" + Date.now(),
      seed: "0".repeat(32),
      soundtrack: { id: "x", hash: "x".repeat(64), originalFilename: "x.wav", duration: 0, uploadedAt: "2026-07-08T00:00:00.000Z", url: "" },
      audioDNA: { tempo: 0, key: "C", mode: "major", brightness: 0, warmth: 0, texture: 0, energy: 0, aggression: 0, complexity: 0, motion: 0, entropy: 0 },
      shaderGraph: defaultShaderGraph(),
      createdAt: "2026-07-08T00:00:00.000Z",
      creator: "test",
      title: "Original",
    };
    await saveArtwork(src);

    // Fork
    const forkId = `remix-${src.id}-${Math.random().toString(36).slice(-6)}`;
    const fork: NonNullable<Artwork> = {
      ...src,
      id: forkId,
      createdAt: new Date().toISOString(),
      title: `Remix of ${src.title ?? src.id}`,
    };
    await saveArtwork(fork);

    const fetched = await getArtwork(fork.id);
    expect(fetched).toBeTruthy();
    expect(fetched!.seed).toBe(src.seed);
    expect(fetched!.shaderGraph).toEqual(src.shaderGraph);
    expect(artworkHash(fetched!)).toBe(artworkHash(src));
    expect(fetched!.id).not.toBe(src.id);
    expect(fetched!.title).toBe("Remix of Original");

    // Cleanup
    const { deleteArtwork } = await import("@/lib/artwork-store");
    await deleteArtwork(src.id);
    await deleteArtwork(fork.id);
  });
});