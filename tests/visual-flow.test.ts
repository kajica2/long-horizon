import { describe, it, expect } from "vitest";
import { visualBindingDelta } from "@/lib/visual/bindings";
import { extractVisualDNAFromRGB } from "@/lib/visual/dna";
import { paletteNameFromVisualDNA } from "@/lib/visual/palette-name";
import type { VisualDNA } from "@/lib/types";

function buildPixels(
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

describe("VisualDNA → ShaderGraph bindings", () => {
  it("produces a partial ShaderGraph with the 6 bound params", () => {
    const pixels = buildPixels(() => [200, 80, 50]);
    const dna = extractVisualDNAFromRGB(pixels, 64, 64);
    const deltas = visualBindingDelta(dna);
    expect(deltas).toHaveProperty("noiseScale");
    expect(deltas).toHaveProperty("fieldStrength");
    expect(deltas).toHaveProperty("pointSize");
    expect(deltas).toHaveProperty("chromaticAberration");
    expect(deltas).toHaveProperty("feedback");
    expect(deltas).toHaveProperty("bloom");
    expect(Object.keys(deltas).length).toBe(6);
  });

  it("all bound values fall inside the published ranges", () => {
    const rng: () => [number, number, number] = () => {
      const r = Math.floor(Math.random() * 256);
      const g = Math.floor(Math.random() * 256);
      const b = Math.floor(Math.random() * 256);
      return [r, g, b];
    };
    const pixels = buildPixels(rng);
    const dna = extractVisualDNAFromRGB(pixels, 64, 64);
    const deltas = visualBindingDelta(dna);

    expect(deltas.noiseScale!).toBeGreaterThanOrEqual(0.3 - 0.001);
    expect(deltas.noiseScale!).toBeLessThanOrEqual(1.5 + 0.001);
    expect(deltas.fieldStrength!).toBeGreaterThanOrEqual(0.5 - 0.001);
    expect(deltas.fieldStrength!).toBeLessThanOrEqual(2.0 + 0.001);
    expect(deltas.pointSize!).toBeGreaterThanOrEqual(1.0 - 0.001);
    expect(deltas.pointSize!).toBeLessThanOrEqual(2.5 + 0.001);
    expect(deltas.bloom!).toBeGreaterThanOrEqual(0.3 - 0.001);
    expect(deltas.bloom!).toBeLessThanOrEqual(1.4 + 0.001);
  });

  it("is monotonic in feature value (more warmth → more bloom)", () => {
    const cool = buildPixels(() => [30, 80, 220]);
    const warm = buildPixels(() => [220, 80, 30]);
    const dnaCool = extractVisualDNAFromRGB(cool, 64, 64);
    const dnaWarm = extractVisualDNAFromRGB(warm, 64, 64);
    const dc = visualBindingDelta(dnaCool);
    const dw = visualBindingDelta(dnaWarm);
    expect(Number(dw.bloom)).toBeGreaterThanOrEqual(Number(dc.bloom) - 0.001);
  });

  it("suggested palette reflects dominant hue", () => {
    const redImage = buildPixels(() => [220, 50, 30]);
    const blueImage = buildPixels(() => [30, 50, 220]);
    const greenImage = buildPixels(() => [30, 220, 50]);

    const dnaR = extractVisualDNAFromRGB(redImage, 64, 64);
    const dnaB = extractVisualDNAFromRGB(blueImage, 64, 64);
    const dnaG = extractVisualDNAFromRGB(greenImage, 64, 64);

    expect(["ember", "tide"]).toContain(paletteNameFromVisualDNA(dnaR));
    expect(["ink", "aurora"]).toContain(paletteNameFromVisualDNA(dnaB));
    expect(paletteNameFromVisualDNA(dnaG)).toBe("aurora");
  });

  it("DNA-extracted dna is reproducible from identical pixel buffers", () => {
    const a = buildPixels((x, y) => [x * 4, y * 4, (x + y) * 2]);
    const b = buildPixels((x, y) => [x * 4, y * 4, (x + y) * 2]);
    const da = extractVisualDNAFromRGB(a, 64, 64);
    const db = extractVisualDNAFromRGB(b, 64, 64);
    expect(da.hash).toBe(db.hash);

    const Da = visualBindingDelta(da);
    const Db = visualBindingDelta(db);
    expect(Da.noiseScale).toBe(Db.noiseScale);
    expect(Da.bloom).toBe(Db.bloom);
  });

  it("full DNA → deltas → canonical JSON round-trip stable", () => {
    const a = buildPixels((x, y) => [(x * 7 + y * 3) & 0xff, (x * 13 + y * 5) & 0xff, (x + y * 11) & 0xff]);
    const dna = extractVisualDNAFromRGB(a, 64, 64);
    const d = visualBindingDelta(dna);
    const json = JSON.stringify(d);
    const parsed = JSON.parse(json);
    expect(parsed.noiseScale).toBeCloseTo(Number(d.noiseScale), 6);
    expect(parsed.bloom).toBeCloseTo(Number(d.bloom), 6);
  });
});

describe("VisualDNA — shape conformance for the API", () => {
  it("matches the lib/types.ts VisualDNA shape", () => {
    const pixels = buildPixels((x, y) => [x * 7, y * 11, (x + y) * 13 & 0xff]);
    const dna = extractVisualDNAFromRGB(pixels, 64, 64);

    // The exact fields the /api/visual/create route needs
    const requiredFields: (keyof VisualDNA)[] = [
      "palette",
      "brightness",
      "contrast",
      "saturation",
      "warmth",
      "edgeDensity",
      "textureComplexity",
      "aspectRatio",
      "compositionalCenter",
      "focalDistance",
      "hash",
    ];
    for (const f of requiredFields) {
      expect(dna).toHaveProperty(f);
    }
    expect(dna.palette).toHaveLength(5);
    expect(dna.compositionalCenter).toHaveProperty("x");
    expect(dna.compositionalCenter).toHaveProperty("y");
  });
});
