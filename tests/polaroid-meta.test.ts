import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { promises as fs } from "node:fs";
import path from "node:path";
import sharp from "sharp";
import {
  savePolaroidWithMetadata,
  readPolaroidMetadata,
  listPolaroids,
  polaroidMetaFromArtwork,
} from "@/lib/engine/polaroid-meta";

const TMP_DIR = path.resolve("./tmp/test-polaroids");

async function makeTestPNG(): Promise<Buffer> {
  return sharp({
    create: {
      width: 256,
      height: 256,
      channels: 4,
      background: { r: 200, g: 100, b: 50, alpha: 1 },
    },
  })
    .png()
    .toBuffer();
}

describe("polaroid-meta — savePolaroidWithMetadata", () => {
  beforeAll(async () => {
    await fs.mkdir(TMP_DIR, { recursive: true });
  });
  afterAll(async () => {
    await fs.rm(TMP_DIR, { recursive: true, force: true }).catch(() => {});
  });

  it("writes a PNG file + a sidecar JSON", async () => {
    const buf = await makeTestPNG();
    const meta = polaroidMetaFromArtwork(
      "test-a",
      "deadbeef1234567890",
      "abcd1234abcd1234",
      "flowFieldMeditation",
      "ember",
      "snapshot",
      "2026-07-09T10:00:00.000Z",
    );

    const r = await savePolaroidWithMetadata(buf, meta, TMP_DIR);
    expect(r.filename).toMatch(/^test-a-.*\.png$/);
    expect(r.url).toBe(`/captures/${r.filename}`);
    expect(r.size).toBeGreaterThan(0);

    // File exists
    const stat = await fs.stat(path.join(TMP_DIR, r.filename));
    expect(stat.size).toBe(r.size);

    // Sidecar JSON exists and is parseable
    const sidecar = JSON.parse(
      await fs.readFile(path.join(TMP_DIR, `${r.filename}.json`), "utf-8"),
    );
    expect(sidecar.artworkId).toBe("test-a");
    expect(sidecar.artworkHash).toBe("deadbeef1234567890");
    expect(sidecar.polaroid).toBe(r.filename);
    expect(sidecar.schema).toBe("long-horizon-polaroid-v1");
  });

  it("stamps EXIF-like metadata in the PNG bytes", async () => {
    const buf = await makeTestPNG();
    const meta = polaroidMetaFromArtwork(
      "test-b",
      "cafebabedeadbeef",
      "000000000000abcd",
      "cosmicFilaments",
      "aurora",
      "snapshot",
      "2026-07-09T11:30:00.000Z",
    );
    const r = await savePolaroidWithMetadata(buf, meta, TMP_DIR);
    const png = await fs.readFile(path.join(TMP_DIR, r.filename));
    const str = png.toString("binary");
    expect(str.includes("Long_Horizon")).toBe(true);
    // The PNGSoftware text chunk should carry our artist string (artworkId is short).
    // Sharp writes this via an EXIF UserComment tEXt-like chunk.
    expect(str.includes("test-b")).toBe(true);
  });

  it("schema field is constant", async () => {
    const buf = await makeTestPNG();
    const meta = polaroidMetaFromArtwork("c", "h", "s", "flowFieldMeditation", "ink", "k", "2026-01-01T00:00:00.000Z");
    const r = await savePolaroidWithMetadata(buf, meta, TMP_DIR);
    const sidecar = JSON.parse(
      await fs.readFile(path.join(TMP_DIR, `${r.filename}.json`), "utf-8"),
    );
    expect(sidecar.schema).toBe("long-horizon-polaroid-v1");
  });
});

describe("polaroid-meta — readPolaroidMetadata", () => {
  it("returns null for missing file", async () => {
    const r = await readPolaroidMetadata(TMP_DIR, "nope-not-here.png");
    expect(r).toBe(null);
  });

  it("returns parsed metadata when sidecar exists", async () => {
    const buf = await makeTestPNG();
    const meta = polaroidMetaFromArtwork("test-c", "h2", "s2", "sandTraveler", "bone", "snap", "2026-02-02T00:00:00.000Z");
    const r = await savePolaroidWithMetadata(buf, meta, TMP_DIR);
    const got = await readPolaroidMetadata(TMP_DIR, r.filename);
    expect(got).not.toBe(null);
    expect(got?.artworkId).toBe("test-c");
    expect(got?.palette).toBe("bone");
    expect(got?.system).toBe("sandTraveler");
  });
});

describe("polaroid-meta — listPolaroids", () => {
  it("returns most-recent-first", async () => {
    const buf = await makeTestPNG();
    await savePolaroidWithMetadata(
      buf,
      polaroidMetaFromArtwork("test-list", "h1", "s1", "flowFieldMeditation", "aurora", "k", "2026-01-01T00:00:00.000Z"),
      TMP_DIR,
    );
    await new Promise((r) => setTimeout(r, 10));
    await savePolaroidWithMetadata(
      buf,
      polaroidMetaFromArtwork("test-list", "h2", "s2", "flowFieldMeditation", "aurora", "k", "2026-06-01T00:00:00.000Z"),
      TMP_DIR,
    );
    await new Promise((r) => setTimeout(r, 10));
    await savePolaroidWithMetadata(
      buf,
      polaroidMetaFromArtwork("test-list", "h3", "s3", "flowFieldMeditation", "aurora", "k", "2026-12-01T00:00:00.000Z"),
      TMP_DIR,
    );

    const list = await listPolaroids(TMP_DIR, "test-list");
    expect(list.length).toBeGreaterThanOrEqual(3);
    // Newest first
    expect(new Date(list[0].capturedAt).getTime()).toBeGreaterThanOrEqual(
      new Date(list[1].capturedAt).getTime(),
    );
  });
});
