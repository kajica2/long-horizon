import { describe, it, expect, beforeAll } from "vitest";
import sharp from "sharp";
import {
  extractVisualDNAFromRGB,
  paletteNameFromVisualDNA,
} from "@/lib/visual/dna";
import type { VisualDNA } from "@/lib/types";

/**
 * Helper: build a deterministic pixel buffer for tests
 * so we don't depend on filesystem fixtures.
 */
function buildTestPixels(
  build: (x: number, y: number) => [number, number, number],
  width = 64,
  height = 64,
): Uint8Array {
  const out = new Uint8Array(width * height * 3);
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const [r, g, b] = build(x, y);
      const i = (y * width + x) * 3;
      out[i] = r;
      out[i + 1] = g;
      out[i + 2] = b;
    }
  }
  return out;
}

describe("VisualDNA — extraction (synchronous RGB path)", () => {
  it("extracts a deterministic palette + features from a gradient", () => {
    const pixels = buildTestPixels((x, _y) => {
      const t = x / 64;
      return [Math.round(255 * t), Math.round(255 * (1 - t)), 128];
    });
    const a = extractVisualDNAFromRGB(pixels, 64, 64);
    const b = extractVisualDNAFromRGB(pixels, 64, 64);
    expect(a.hash).toBe(b.hash);
    expect(a.brightness).toBeGreaterThan(0.3);
    expect(a.brightness).toBeLessThan(0.7);
    expect(a.contrast).toBeGreaterThan(0.1);
    expect(a.saturation).toBeGreaterThan(0.3);
  });

  it("all values are clamped to [0, 1]", () => {
    const pixels = buildTestPixels(() => [
      Math.floor(Math.random() * 256),
      Math.floor(Math.random() * 256),
      Math.floor(Math.random() * 256),
    ]);
    const dna = extractVisualDNAFromRGB(pixels, 64, 64);
    expect(dna.brightness).toBeGreaterThanOrEqual(0);
    expect(dna.brightness).toBeLessThanOrEqual(1);
    expect(dna.contrast).toBeGreaterThanOrEqual(0);
    expect(dna.contrast).toBeLessThanOrEqual(1);
    expect(dna.saturation).toBeGreaterThanOrEqual(0);
    expect(dna.saturation).toBeLessThanOrEqual(1);
    expect(dna.warmth).toBeGreaterThanOrEqual(0);
    expect(dna.warmth).toBeLessThanOrEqual(1);
    expect(dna.edgeDensity).toBeGreaterThanOrEqual(0);
    expect(dna.edgeDensity).toBeLessThanOrEqual(1);
    expect(dna.textureComplexity).toBeGreaterThanOrEqual(0);
    expect(dna.textureComplexity).toBeLessThanOrEqual(1);
    expect(dna.focalDistance).toBeGreaterThanOrEqual(0);
    expect(dna.focalDistance).toBeLessThanOrEqual(1);
    expect(dna.compositionalCenter.x).toBeGreaterThanOrEqual(0);
    expect(dna.compositionalCenter.x).toBeLessThanOrEqual(1);
  });

  it("uniform image has zero contrast, zero edgeDensity", () => {
    const pixels = buildTestPixels(() => [128, 128, 128]);
    const dna = extractVisualDNAFromRGB(pixels, 64, 64);
    expect(dna.contrast).toBeLessThan(0.01);
    expect(dna.edgeDensity).toBe(0);
  });

  it("high-contrast horizontal stripes yield high edgeDensity and texture", () => {
    // Horizontal stripes (alternating rows white/black). Sobel detects the
    // vertical edges between every row.
    const pixels = buildTestPixels((_x, y) => {
      return y % 4 < 2 ? [255, 255, 255] : [0, 0, 0];
    });
    const dna = extractVisualDNAFromRGB(pixels, 64, 64);
    expect(dna.edgeDensity).toBeGreaterThan(0.3);
    expect(dna.textureComplexity).toBeGreaterThan(0.3);
  });

  it("warm image has warmth > 0.5, cool image has warmth < 0.5", () => {
    const warm = buildTestPixels(() => [220, 80, 30]);
    const cool = buildTestPixels(() => [30, 80, 220]);
    const wDna = extractVisualDNAFromRGB(warm, 64, 64);
    const cDna = extractVisualDNAFromRGB(cool, 64, 64);
    expect(wDna.warmth).toBeGreaterThan(0.5);
    expect(cDna.warmth).toBeLessThan(0.5);
  });

  it("palette has exactly 5 hex colours", () => {
    const pixels = buildTestPixels((x, y) => {
      const r = (x * 4) % 256;
      const g = (y * 4) % 256;
      const b = ((x + y) * 2) % 256;
      return [r, g, b];
    });
    const dna = extractVisualDNAFromRGB(pixels, 64, 64);
    expect(dna.palette).toHaveLength(5);
    for (const hex of dna.palette) {
      expect(hex).toMatch(/^#[0-9a-f]{6}$/);
    }
  });

  it("aspect ratio is clamped to [0.5, 2.0]", () => {
    const pixels = buildTestPixels(() => [128, 128, 128]);
    expect(extractVisualDNAFromRGB(pixels, 32, 128).aspectRatio).toBeLessThanOrEqual(0.5);
    expect(extractVisualDNAFromRGB(pixels, 256, 64).aspectRatio).toBeGreaterThanOrEqual(2.0);
    expect(extractVisualDNAFromRGB(pixels, 64, 64).aspectRatio).toBeCloseTo(1.0, 1);
  });
});

describe("VisualDNA — palette name mapping", () => {
  it("red dominant → ember or tide", () => {
    const dna: VisualDNA = {
      palette: ["#ff4040", "#882020", "#440000", "#aa0000", "#220000"],
      brightness: 0.5,
      contrast: 0.6,
      saturation: 0.7,
      warmth: 0.7,
      edgeDensity: 0.3,
      textureComplexity: 0.4,
      aspectRatio: 1,
      compositionalCenter: { x: 0.5, y: 0.5 },
      focalDistance: 0.5,
      hash: "x",
    };
    const name = paletteNameFromVisualDNA(dna);
    expect(["ember", "tide"]).toContain(name);
  });

  it("blue dominant dark → ink", () => {
    const dna: VisualDNA = {
      palette: ["#1a2050", "#0a0f30", "#3040a0", "#080818", "#4060c0"],
      brightness: 0.2,
      contrast: 0.4,
      saturation: 0.5,
      warmth: 0.3,
      edgeDensity: 0.4,
      textureComplexity: 0.5,
      aspectRatio: 1,
      compositionalCenter: { x: 0.5, y: 0.5 },
      focalDistance: 0.4,
      hash: "x",
    };
    expect(paletteNameFromVisualDNA(dna)).toBe("ink");
  });

  it("green dominant → aurora", () => {
    const dna: VisualDNA = {
      palette: ["#40a050", "#206030", "#80c090", "#103020", "#a0d0b0"],
      brightness: 0.5,
      contrast: 0.4,
      saturation: 0.6,
      warmth: 0.5,
      edgeDensity: 0.4,
      textureComplexity: 0.5,
      aspectRatio: 1,
      compositionalCenter: { x: 0.5, y: 0.5 },
      focalDistance: 0.4,
      hash: "x",
    };
    expect(paletteNameFromVisualDNA(dna)).toBe("aurora");
  });

  it("hash is stable for the same input bytes (server-side)", () => {
    // Two pixel buffers with identical content must hash identically
    const a = buildTestPixels((x, y) => [x * 4, y * 4, (x + y) * 2]);
    const b = buildTestPixels((x, y) => [x * 4, y * 4, (x + y) * 2]);
    const da = extractVisualDNAFromRGB(a, 64, 64);
    const db = extractVisualDNAFromRGB(b, 64, 64);
    expect(da.hash).toBe(db.hash);
  });

  it("different input bytes produce different hashes", () => {
    const a = buildTestPixels(() => [255, 0, 0]);
    const b = buildTestPixels(() => [0, 255, 0]);
    const da = extractVisualDNAFromRGB(a, 64, 64);
    const db = extractVisualDNAFromRGB(b, 64, 64);
    expect(da.hash).not.toBe(db.hash);
  });
});

describe("VisualDNA — server buffer path (sharp)", () => {
  let redBuffer: Buffer;
  let mixedBuffer: Buffer;

  beforeAll(async () => {
    redBuffer = await sharp({
      create: {
        width: 100,
        height: 100,
        channels: 3,
        background: { r: 220, g: 30, b: 30 },
      },
    })
      .png()
      .toBuffer();

    // A horizontal gradient
    const pixels = Buffer.alloc(200 * 100 * 3);
    for (let y = 0; y < 100; y++) {
      for (let x = 0; x < 200; x++) {
        const i = (y * 200 + x) * 3;
        pixels[i] = Math.round((x / 200) * 255);
        pixels[i + 1] = Math.round((1 - x / 200) * 255);
        pixels[i + 2] = 128;
      }
    }
    mixedBuffer = await sharp(pixels, { raw: { width: 200, height: 100, channels: 3 } })
      .png()
      .toBuffer();
  });

  it("decodes a PNG and produces a valid VisualDNA", async () => {
    const { extractVisualDNA } = await import("@/lib/visual/dna");
    const dna = await extractVisualDNA(redBuffer);
    expect(dna.hash).toMatch(/^[0-9a-f]{64}$/);
    expect(dna.warmth).toBeGreaterThan(0.5); // pure red is warm
    expect(dna.brightness).toBeGreaterThan(0.2);
  });

  it("decodes a gradient and produces a stable VisualDNA across runs", async () => {
    const { extractVisualDNA } = await import("@/lib/visual/dna");
    const a = await extractVisualDNA(mixedBuffer);
    const b = await extractVisualDNA(mixedBuffer);
    expect(a.hash).toBe(b.hash);
    expect(a.contrast).toBeGreaterThan(0.15);
    expect(a.saturation).toBeGreaterThan(0.3);
  });

  it("rejects malformed image buffers with a thrown decode error", async () => {
    const { extractVisualDNA } = await import("@/lib/visual/dna");
    const garbage = Buffer.from("not an image at all, just bytes");
    await expect(extractVisualDNA(garbage)).rejects.toThrow();
  });
});
