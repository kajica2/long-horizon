/**
 * Stage 22 — Polaroid metadata tests.
 *
 * Verifies:
 *   - listAllPolaroids returns empty array when dir doesn't exist
 *   - returns metadata from sidecar JSON files in captureDir
 *   - skips malformed JSONs without throwing
 *   - returns most-recent-first by capturedAt
 */

import { describe, it, expect, beforeEach } from "vitest";
import { promises as fs } from "node:fs";
import path from "node:path";
import os from "node:os";
import { listAllPolaroids, type PolaroidMetadata } from "@/lib/engine/polaroid-meta";

let tmpDir: string;

async function writeSidecar(filename: string, meta: PolaroidMetadata): Promise<void> {
  await fs.writeFile(path.join(tmpDir, filename), JSON.stringify(meta));
}

beforeEach(async () => {
  tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), "lh-polaroid-test-"));
});

describe("listAllPolaroids — Stage 22", () => {
  it("returns empty array when captureDir doesn't exist", async () => {
    const r = await listAllPolaroids("/nonexistent/path/should/never/exist");
    expect(r).toEqual([]);
  });

  it("returns empty array when captureDir is empty", async () => {
    const r = await listAllPolaroids(tmpDir);
    expect(r).toEqual([]);
  });

  it("returns metadata from sidecar JSONs", async () => {
    await writeSidecar("a-1.png.json", {
      artworkId: "a",
      artworkHash: "h1",
      seed: "s1",
      system: "flowFieldMeditation",
      palette: "aurora",
      camera: "drone",
      capturedAt: "2024-01-01T00:00:00.000Z",
      polaroid: "a-1.png",
      schema: "long-horizon-polaroid-v1",
    });
    const r = await listAllPolaroids(tmpDir);
    expect(r.length).toBe(1);
    expect(r[0].artworkId).toBe("a");
    expect(r[0].polaroid).toBe("a-1.png");
  });

  it("skips malformed JSONs", async () => {
    await fs.writeFile(path.join(tmpDir, "broken.png.json"), "not json");
    await writeSidecar("good.png.json", {
      artworkId: "good",
      artworkHash: "h",
      seed: "s",
      system: "flowFieldMeditation",
      palette: "aurora",
      camera: "drone",
      capturedAt: "2024-01-01T00:00:00.000Z",
      polaroid: "good.png",
      schema: "long-horizon-polaroid-v1",
    });
    const r = await listAllPolaroids(tmpDir);
    expect(r.length).toBe(1);
    expect(r[0].artworkId).toBe("good");
  });

  it("ignores non-sidecar files", async () => {
    await fs.writeFile(path.join(tmpDir, "random.txt"), "hi");
    await fs.writeFile(path.join(tmpDir, "actual-polaroid.png"), "fakepng");
    const r = await listAllPolaroids(tmpDir);
    expect(r).toEqual([]);
  });

  it("sorts by capturedAt descending", async () => {
    await writeSidecar("a-old.png.json", {
      artworkId: "old",
      artworkHash: "h",
      seed: "s",
      system: "flowFieldMeditation",
      palette: "aurora",
      camera: "drone",
      capturedAt: "2023-01-01T00:00:00.000Z",
      polaroid: "a-old.png",
      schema: "long-horizon-polaroid-v1",
    });
    await writeSidecar("a-new.png.json", {
      artworkId: "new",
      artworkHash: "h",
      seed: "s",
      system: "flowFieldMeditation",
      palette: "aurora",
      camera: "drone",
      capturedAt: "2024-06-01T00:00:00.000Z",
      polaroid: "a-new.png",
      schema: "long-horizon-polaroid-v1",
    });
    await writeSidecar("a-mid.png.json", {
      artworkId: "mid",
      artworkHash: "h",
      seed: "s",
      system: "flowFieldMeditation",
      palette: "aurora",
      camera: "drone",
      capturedAt: "2024-01-01T00:00:00.000Z",
      polaroid: "a-mid.png",
      schema: "long-horizon-polaroid-v1",
    });
    const r = await listAllPolaroids(tmpDir);
    expect(r.map((p) => p.artworkId)).toEqual(["new", "mid", "old"]);
  });
});