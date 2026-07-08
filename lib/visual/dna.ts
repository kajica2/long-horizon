/**
 * VisualDNA — extract a genome from a static image.
 *
 * Like AudioDNA but for pixels. The pipeline:
 *
 *   1. Decode the image (PNG/JPEG/WebP/GIF/AVIF) and resize to 64×64 RGB
 *   2. Extract a 5-colour palette via k-means clustering (8 iterations)
 *   3. Compute photometric features: brightness, contrast, saturation, warmth
 *   4. Run a Sobel edge detector → edgeDensity
 *   5. Compute local 8×8 variance → textureComplexity
 *   6. Find the centre of mass of high-saturation pixels → compositionalCenter
 *   7. Hash the result for caching / reproducibility
 *
 * Reproducibility: same image bytes → same VisualDNA. Always.
 *
 * Server-side only — relies on `sharp` for decoding.
 */

import sharp from "sharp";
import { canonicalJson, sha256Hex } from "@/lib/hash";
import type { Palette5, VisualDNA } from "@/lib/types";
import { paletteNameFromVisualDNA as _paletteNameFromVisualDNA } from "./palette-name";

// Re-export the browser-safe helper for backwards compatibility
// with everything that imported it from this file (incl. server-only callers).
export const paletteNameFromVisualDNA = _paletteNameFromVisualDNA;
// Add a hint for bundlers that everything else here is server-only
// — dynamic imports from client components should work, but bundlers
// are free to refuse static imports of this module from client components.
void sharp;

/** Resize target. 64×64 gives us 4096 pixels — enough for all features. */
const TARGET_SIZE = 64;

/** k-means iterations for palette extraction. */
const PALETTE_ITERATIONS = 8;

/** Number of palette colours. */
const PALETTE_K = 5;

/** Sobel edge threshold (gradient magnitude normalised to [0, 1]). */
const SOBEL_THRESHOLD = 0.15;

/** Local variance window for texture complexity. */
const TEXTURE_WINDOW = 8;

/** High-saturation threshold for compositional centre calculation. */
const HIGH_SATURATION_THRESHOLD = 0.4;

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

/**
 * Extract a VisualDNA from a raw image buffer (PNG/JPEG/WebP/GIF/AVIF).
 *
 * Same input → same output. Always.
 */
export async function extractVisualDNA(buffer: Buffer): Promise<VisualDNA> {
  // Step 1: decode + resize to TARGET_SIZE × TARGET_SIZE
  const { data, width, height } = await decode(buffer);

  const targetW = TARGET_SIZE;
  const targetH = TARGET_SIZE;

  // Resize by averaging to a TARGET_SIZE grid.
  // We avoid sharp's resize step and do it in code so we have full control
  // and the same algorithm runs both server-side and (potentially) in tests.
  const pixels =
    width === targetW && height === targetH
      ? data.subarray(0, width * height * 4)
      : downsampleBilinear(data, width, height, targetW, targetH);
  const aspectRatioRaw = width / height;
  const aspectRatio = clamp(0.5, 2.0, aspectRatioRaw);

  // Step 2: palette extraction via k-means on RGB triplets
  const palette = extractPalette(pixels, targetW * targetH);

  // Step 3: photometric features
  const photo = computePhotometrics(pixels, targetW, targetH);

  // Step 4: Sobel edges
  const edgeDensity = computeEdgeDensity(pixels, targetW, targetH);

  // Step 5: texture complexity
  const textureComplexity = computeTextureComplexity(pixels, targetW, targetH);

  // Step 6: compositional centre
  const composition = computeComposition(pixels, targetW, targetH);

  const dna: Omit<VisualDNA, "hash"> = {
    palette,
    brightness: photo.brightness,
    contrast: photo.contrast,
    saturation: photo.saturation,
    warmth: photo.warmth,
    edgeDensity,
    textureComplexity,
    aspectRatio,
    compositionalCenter: composition.center,
    focalDistance: composition.focalDistance,
  };

  const hash = sha256Hex(canonicalJson(dna));

  return { ...dna, hash };
}

/**
 * Synchronous variant for tests that have raw RGB triplets (no buffer decode).
 * Used by the test suite to verify determinism without going through sharp.
 */
export function extractVisualDNAFromRGB(
  rgb: Uint8Array,
  width: number,
  height: number,
): VisualDNA {
  // Skip downsample when already at target size — bilinear would blur edges.
  // If smaller/larger, downsample with explicit 3-bpp stride.
  const pixels =
    width === TARGET_SIZE && height === TARGET_SIZE
      ? rgb
      : downsampleCustom(rgb, width, height, 3, TARGET_SIZE, TARGET_SIZE, 3);
  const aspectRatio = clamp(0.5, 2.0, width / height);

  const palette = extractPalette(pixels, TARGET_SIZE * TARGET_SIZE);
  const photo = computePhotometrics(pixels, TARGET_SIZE, TARGET_SIZE);
  const edgeDensity = computeEdgeDensity(pixels, TARGET_SIZE, TARGET_SIZE);
  const textureComplexity = computeTextureComplexity(
    pixels,
    TARGET_SIZE,
    TARGET_SIZE,
  );
  const composition = computeComposition(pixels, TARGET_SIZE, TARGET_SIZE);

  const dna: Omit<VisualDNA, "hash"> = {
    palette,
    brightness: photo.brightness,
    contrast: photo.contrast,
    saturation: photo.saturation,
    warmth: photo.warmth,
    edgeDensity,
    textureComplexity,
    aspectRatio,
    compositionalCenter: composition.center,
    focalDistance: composition.focalDistance,
  };

  const hash = sha256Hex(canonicalJson(dna));
  return { ...dna, hash };
}

// ---------------------------------------------------------------------------
// Internals
// ---------------------------------------------------------------------------

interface DecodedImage {
  data: Uint8Array;
  width: number;
  height: number;
}

async function decode(buffer: Buffer): Promise<DecodedImage> {
  const img = sharp(buffer, { failOn: "error" }).ensureAlpha();
  const meta = await img.metadata();
  const raw = await img
    .raw()
    .toBuffer({ resolveWithObject: true });

  return {
    data: new Uint8Array(raw.data.buffer, raw.data.byteOffset, raw.data.byteLength),
    width: raw.info.width,
    height: raw.info.height,
    // meta unused for now; sharp metadata kept for future use
  };
}

/**
 * Bilinear downsample with explicit source/destination BPP.
 * Used by both decode() (4-bpp RGBA → 3-bpp RGB) and the
 * synchronous test path (3-bpp RGB → 3-bpp RGB).
 */
function downsampleCustom(
  src: Uint8Array,
  srcW: number,
  srcH: number,
  srcBpp: number,
  dstW: number,
  dstH: number,
  dstBpp: number,
): Uint8Array {
  const dst = new Uint8Array(dstW * dstH * dstBpp);
  for (let dy = 0; dy < dstH; dy++) {
    const sy = (dy / dstH) * srcH;
    const sy0 = Math.min(srcH - 1, Math.floor(sy));
    const sy1 = Math.min(srcH - 1, sy0 + 1);
    const syf = sy - sy0;
    for (let dx = 0; dx < dstW; dx++) {
      const sx = (dx / dstW) * srcW;
      const sx0 = Math.min(srcW - 1, Math.floor(sx));
      const sx1 = Math.min(srcW - 1, sx0 + 1);
      const sxf = sx - sx0;
      const i00 = (sy0 * srcW + sx0) * srcBpp;
      const i10 = (sy0 * srcW + sx1) * srcBpp;
      const i01 = (sy1 * srcW + sx0) * srcBpp;
      const i11 = (sy1 * srcW + sx1) * srcBpp;
      for (let c = 0; c < Math.min(srcBpp, dstBpp); c++) {
        const a = src[i00 + c] * (1 - sxf) + src[i10 + c] * sxf;
        const b = src[i01 + c] * (1 - sxf) + src[i11 + c] * sxf;
        const v = a * (1 - syf) + b * syf;
        dst[(dy * dstW + dx) * dstBpp + c] = Math.round(v);
      }
    }
  }
  return dst;
}

/**
 * Bilinear downsample to TARGET_SIZE. Input is RGBA (4 bytes per pixel).
 * Output is RGB (3 bytes per pixel).
 */
function downsampleBilinear(
  src: Uint8Array,
  srcW: number,
  srcH: number,
  dstW: number,
  dstH: number,
): Uint8Array {
  return downsampleCustom(src, srcW, srcH, 4, dstW, dstH, 3);
}

// ---------------------------------------------------------------------------
// Palette: k-means on RGB triplets
// ---------------------------------------------------------------------------

function extractPalette(rgb: Uint8Array, pixelCount: number): Palette5 {
  // Deterministic RNG seeded by FNV-1a hash of pixel buffer
  // — k-means seeding must be reproducible for hash stability.
  let seed = 2166136261;
  for (let i = 0; i < rgb.length; i++) {
    seed = (seed ^ rgb[i]) * 16777619 >>> 0;
  }
  const rng = mulberry32(seed);

  // Initialise centres via k-means++ style: pick the first random, then bias
  // toward pixels farthest from already-chosen centres.
  const centres: number[][] = [];
  const firstIdx = Math.floor(rng() * pixelCount);
  centres.push([rgb[firstIdx * 3], rgb[firstIdx * 3 + 1], rgb[firstIdx * 3 + 2]]);

  for (let k = 1; k < PALETTE_K; k++) {
    let bestIdx = 0;
    let bestDist = -1;
    for (let i = 0; i < pixelCount; i++) {
      let minDist = Infinity;
      for (let c = 0; c < centres.length; c++) {
        const dr = rgb[i * 3] - centres[c][0];
        const dg = rgb[i * 3 + 1] - centres[c][1];
        const db = rgb[i * 3 + 2] - centres[c][2];
        const d = dr * dr + dg * dg + db * db;
        if (d < minDist) minDist = d;
      }
      if (minDist > bestDist) {
        bestDist = minDist;
        bestIdx = i;
      }
    }
    centres.push([rgb[bestIdx * 3], rgb[bestIdx * 3 + 1], rgb[bestIdx * 3 + 2]]);
  }

  // Lloyd's iterations
  const labels = new Int32Array(pixelCount);
  for (let iter = 0; iter < PALETTE_ITERATIONS; iter++) {
    // Assign
    for (let i = 0; i < pixelCount; i++) {
      let bestK = 0;
      let bestDist = Infinity;
      for (let k = 0; k < PALETTE_K; k++) {
        const dr = rgb[i * 3] - centres[k][0];
        const dg = rgb[i * 3 + 1] - centres[k][1];
        const db = rgb[i * 3 + 2] - centres[k][2];
        const d = dr * dr + dg * dg + db * db;
        if (d < bestDist) {
          bestDist = d;
          bestK = k;
        }
      }
      labels[i] = bestK;
    }
    // Update
    const sums = Array.from({ length: PALETTE_K }, () => [0, 0, 0, 0]);
    for (let i = 0; i < pixelCount; i++) {
      const k = labels[i];
      sums[k][0] += rgb[i * 3];
      sums[k][1] += rgb[i * 3 + 1];
      sums[k][2] += rgb[i * 3 + 2];
      sums[k][3] += 1;
    }
    for (let k = 0; k < PALETTE_K; k++) {
      if (sums[k][3] > 0) {
        centres[k] = [
          sums[k][0] / sums[k][3],
          sums[k][1] / sums[k][3],
          sums[k][2] / sums[k][3],
        ];
      }
    }
  }

  // Sort by cluster size, descending, so palette[0] is dominant colour
  const clusterSizes = Array.from({ length: PALETTE_K }, () => 0);
  for (let i = 0; i < pixelCount; i++) clusterSizes[labels[i]]++;
  const order = centres.map((_, i) => i).sort((a, b) => clusterSizes[b] - clusterSizes[a]);

  return order.map((k) => rgbToHex(Math.round(centres[k][0]), Math.round(centres[k][1]), Math.round(centres[k][2]))) as Palette5;
}

// ---------------------------------------------------------------------------
// Photometrics
// ---------------------------------------------------------------------------

interface Photometrics {
  brightness: number;
  contrast: number;
  saturation: number;
  warmth: number;
}

function computePhotometrics(rgb: Uint8Array, w: number, h: number): Photometrics {
  const N = w * h;
  let totalLum = 0;
  let totalSat = 0;
  let totalWarm = 0;
  const lums: number[] = new Array(N);
  for (let i = 0; i < N; i++) {
    const r = rgb[i * 3];
    const g = rgb[i * 3 + 1];
    const b = rgb[i * 3 + 2];
    const lum = 0.2126 * r + 0.7152 * g + 0.0722 * b;
    lums[i] = lum;
    totalLum += lum;
    totalSat += saturation(r, g, b);
    totalWarm += (r - b) / 255;
  }
  const meanLum = totalLum / N;
  let varLum = 0;
  for (let i = 0; i < N; i++) {
    const d = lums[i] - meanLum;
    varLum += d * d;
  }
  const stdLum = Math.sqrt(varLum / N);
  const contrast = meanLum > 0 ? Math.min(1, stdLum / 128) : 0;
  return {
    brightness: meanLum / 255,
    contrast,
    saturation: clamp01(totalSat / N),
    warmth: clamp01(0.5 + totalWarm / N / 2), // map [-0.5, 0.5] → [0, 1]
  };
}

// ---------------------------------------------------------------------------
// Edge density (Sobel)
// ---------------------------------------------------------------------------

function computeEdgeDensity(rgb: Uint8Array, w: number, h: number): number {
  let edgeCount = 0;
  const total = (w - 2) * (h - 2);
  for (let y = 1; y < h - 1; y++) {
    for (let x = 1; x < w - 1; x++) {
      // Sobel kernels × each channel
      let mag = 0;
      for (let c = 0; c < 3; c++) {
        const tl = rgb[((y - 1) * w + (x - 1)) * 3 + c];
        const t = rgb[((y - 1) * w + x) * 3 + c];
        const tr = rgb[((y - 1) * w + (x + 1)) * 3 + c];
        const l = rgb[(y * w + (x - 1)) * 3 + c];
        const r = rgb[(y * w + (x + 1)) * 3 + c];
        const bl = rgb[((y + 1) * w + (x - 1)) * 3 + c];
        const b = rgb[((y + 1) * w + x) * 3 + c];
        const br = rgb[((y + 1) * w + (x + 1)) * 3 + c];
        const gx = -tl + tr - 2 * l + 2 * r - bl + br;
        const gy = -tl - 2 * t - tr + bl + 2 * b + br;
        mag += Math.sqrt(gx * gx + gy * gy);
      }
      mag /= 3;
      // Normalise by 4 × max possible 8-bit gradient (255 × 4 = 1020)
      const normalised = mag / 1020;
      if (normalised > SOBEL_THRESHOLD) edgeCount++;
    }
  }
  return clamp01(edgeCount / Math.max(1, total));
}

// ---------------------------------------------------------------------------
// Texture complexity (local 8x8 variance)
// ---------------------------------------------------------------------------

function computeTextureComplexity(rgb: Uint8Array, w: number, h: number): number {
  const totalSamples = Math.floor((w / TEXTURE_WINDOW)) * Math.floor((h / TEXTURE_WINDOW));
  let totalVar = 0;
  let n = 0;
  for (let y = 0; y + TEXTURE_WINDOW <= h; y += TEXTURE_WINDOW) {
    for (let x = 0; x + TEXTURE_WINDOW <= w; x += TEXTURE_WINDOW) {
      let lumSum = 0;
      const cells = TEXTURE_WINDOW * TEXTURE_WINDOW;
      for (let yy = 0; yy < TEXTURE_WINDOW; yy++) {
        for (let xx = 0; xx < TEXTURE_WINDOW; xx++) {
          const i = ((y + yy) * w + (x + xx)) * 3;
          lumSum += 0.2126 * rgb[i] + 0.7152 * rgb[i + 1] + 0.0722 * rgb[i + 2];
        }
      }
      const mean = lumSum / cells;
      let v = 0;
      for (let yy = 0; yy < TEXTURE_WINDOW; yy++) {
        for (let xx = 0; xx < TEXTURE_WINDOW; xx++) {
          const i = ((y + yy) * w + (x + xx)) * 3;
          const lum = 0.2126 * rgb[i] + 0.7152 * rgb[i + 1] + 0.0722 * rgb[i + 2];
          const d = lum - mean;
          v += d * d;
        }
      }
      const std = Math.sqrt(v / cells);
      totalVar += clamp01(std / 64); // normalise
      n++;
    }
  }
  if (n === 0) return 0;
  void totalSamples;
  return clamp01(totalVar / n);
}

// ---------------------------------------------------------------------------
// Composition (centre of mass + focal distance)
// ---------------------------------------------------------------------------

interface Composition {
  center: { x: number; y: number };
  focalDistance: number;
}

function computeComposition(rgb: Uint8Array, w: number, h: number): Composition {
  let sumX = 0, sumY = 0, mass = 0;
  let focalSum = 0, focalN = 0;
  const cx = (w - 1) / 2;
  const cy = (h - 1) / 2;
  const maxDist = Math.sqrt(cx * cx + cy * cy);

  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const i = (y * w + x) * 3;
      const r = rgb[i];
      const g = rgb[i + 1];
      const b = rgb[i + 2];
      const sat = saturation(r, g, b);
      if (sat > HIGH_SATURATION_THRESHOLD) {
        // Weight by saturation × luminance (saturated + bright pixels are focal)
        const weight = sat * (0.2126 * r + 0.7152 * g + 0.0722 * b) / 255;
        sumX += x * weight;
        sumY += y * weight;
        mass += weight;

        const dx = x - cx;
        const dy = y - cy;
        const dist = Math.sqrt(dx * dx + dy * dy) / maxDist;
        focalSum += dist;
        focalN++;
      }
    }
  }
  if (mass === 0) {
    return {
      center: { x: 0.5, y: 0.5 },
      focalDistance: 0,
    };
  }
  return {
    center: {
      x: sumX / mass / w,
      y: sumY / mass / h,
    },
    focalDistance: focalN === 0 ? 0 : focalSum / focalN,
  };
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/**
 * Mulberry32 — small, fast 32-bit RNG. Returns a function that produces
 * pseudo-random numbers in [0, 1). Identical seed → identical stream.
 */
function mulberry32(seed: number): () => number {
  let s = seed >>> 0;
  return function (): number {
    s = (s + 0x6D2B79F5) >>> 0;
    let t = s;
    t = Math.imul(t ^ (t >>> 15), 1 | t);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function clamp(min: number, max: number, v: number): number {
  if (v < min) return min;
  if (v > max) return max;
  return v;
}

function clamp01(v: number): number {
  if (v < 0) return 0;
  if (v > 1) return 1;
  return v;
}

function saturation(r: number, g: number, b: number): number {
  const max = Math.max(r, g, b);
  const min = Math.min(r, g, b);
  if (max === 0) return 0;
  return (max - min) / max;
}

function rgbToHex(r: number, g: number, b: number): string {
  const c = (n: number) => n.toString(16).padStart(2, "0");
  return `#${c(r)}${c(g)}${c(b)}`;
}
