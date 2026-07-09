/**
 * BeatRender Genesis — core data model.
 *
 * The Artwork record is the unit of storage and sharing.
 * Reproducibility: given (seed, soundtrack, shaderGraph, audioDNA), the engine
 * produces identical state at any time t (within float tolerance).
 *
 * Source of truth: see /workspace/beatrender-genesis-engine.md Section 2.
 */

// ============================================================
// Identifiers
// ============================================================

export type ArtworkId = string;
export type SoundtrackId = string;
export type Seed = string; // 32+ char lowercase hex

// ============================================================
// Soundtrack
// ============================================================

export type Soundtrack = {
  id: SoundtrackId;
  hash: string; // sha256 of MP3 file content, lowercase hex
  originalFilename: string;
  duration: number; // seconds
  uploadedAt: string; // ISO 8601
  url: string; // storage URL
};

// ============================================================
// AudioDNA — the genome
// ============================================================

export type AudioDNA = {
  // rhythm
  tempo: number; // BPM
  key: string; // e.g. "C", "F#"
  mode: "major" | "minor";

  // spectrum
  brightness: number; // [0,1] spectral centroid normalized
  warmth: number; // [0,1] low-mid vs high balance
  texture: number; // [0,1] MFCC entropy

  // dynamics
  energy: number; // [0,1] RMS curve integral
  aggression: number; // [0,1] transient density

  // complexity
  complexity: number; // [0,1] spectral flux variance
  motion: number; // [0,1] onset rate per second
  entropy: number; // [0,1] zero crossing rate
};

// ============================================================
// VisualDNA — the image-driven genome
// ============================================================

/**
 * A 5-colour palette extracted from the source image, in #rrggbb form.
 * Palette[0] is the dominant colour; later entries are accent colours.
 */
export type Palette5 = [string, string, string, string, string];

/**
 * VisualDNA — the genome derived from a static image. Like AudioDNA but
 * for pixels. Drives the same ShaderGraph engine with different bindings:
 *   - palette[0..4]      → engine palette
 *   - edgeDensity        → noiseScale    (more edges → finer noise)
 *   - textureComplexity  → fieldStrength (more texture → stronger field)
 *   - warmth             → cameraMode + bloomBias
 *   - compositionalCenter → driftOrigin offset
 *   - aspectRatio        → camera FOV auto-adjust
 */
export type VisualDNA = {
  // The dominant 5-colour palette
  palette: Palette5;

  // Photometric features, all [0, 1]
  brightness: number;    // mean luminance
  contrast: number;      // luminance standard deviation / mean
  saturation: number;    // mean HSL saturation
  warmth: number;        // mean (R - B) / 255

  // Structural features, all [0, 1]
  edgeDensity: number;   // 1.0 - normalised count of Sobel edges
  textureComplexity: number;  // mean local variance of 8x8 blocks

  // Composition
  aspectRatio: number;   // width / height, normalised to [0.5, 2.0] range
  compositionalCenter: { x: number; y: number }; // [0, 1] each
  focalDistance: number; // [0, 1] mean distance of high-saturation pixels from centre

  // Cached for reproducibility
  hash: string;
};

// ============================================================
// ShaderGraph — the procedural recipe
// ============================================================

export type LivingSystemName =
  | "flowFieldMeditation"
  | "cosmicFilaments"
  | "sandTraveler"
  | "deJongAttractor"
  | "birthChart"
  | "reactionDiffusion"
  | "lorenzAttractor"
  | "physarum";

// ============================================================
// PlanetaryDNA — genome derived from real-time planetary positions
// ============================================================

export type ZodiacElement = "fire" | "earth" | "air" | "water";

export type ZodiacSign =
  | "aries" | "taurus" | "gemini" | "cancer"
  | "leo" | "virgo" | "libra" | "scorpio"
  | "sagittarius" | "capricorn" | "aquarius" | "pisces";

export type HouseNumber = 1 | 2 | 3 | 4 | 5 | 6 | 7 | 8 | 9 | 10 | 11 | 12;

export type AspectName = "conjunction" | "opposition" | "trine" | "square" | "sextile";

export type BodyKey =
  | "sun" | "moon" | "mercury" | "venus" | "mars"
  | "jupiter" | "saturn" | "uranus" | "neptune" | "pluto";

export type Aspect = {
  a: BodyKey;
  b: BodyKey;
  type: AspectName;
  angle: number;
  orb: number;
  applying: boolean;
};

export type PlanetaryDNA = {
  // Heliocentric ecliptic longitude [0, 360) for each body
  sunLongitude: number;
  moonLongitude: number;
  mercuryLongitude: number;
  venusLongitude: number;
  marsLongitude: number;
  jupiterLongitude: number;
  saturnLongitude: number;
  uranusLongitude: number;
  neptuneLongitude: number;

  // Lunar phase
  moonPhase: number;          // [0, 1] — 0=new, 0.5=full, 1=new
  moonPhaseAngle: number;     // [0, 360) — angular separation sun↔moon

  // Retrograde flags (apparent motion against the zodiac)
  mercuryRetrograde: boolean;
  venusRetrograde: boolean;
  marsRetrograde: boolean;
  jupiterRetrograde: boolean;
  saturnRetrograde: boolean;
  uranusRetrograde: boolean;
  neptuneRetrograde: boolean;

  // Aspect summary
  aspectCount: number;        // count of major aspects in orb
  chartIntensity: number;     // [0, 1] — weighted sum, normalized

  // Dominant element from sign distribution
  dominantElement: ZodiacElement;
  elementBalance: Record<ZodiacElement, number>;  // [0, 1] per element

  // Captured moment
  timestamp: string;          // ISO 8601 UTC
};

/**
 * BirthChart — a full astrological chart (v1: Western, Placidus, tropical).
 *
 * Extends PlanetaryDNA with location-dependent features:
 *   - 12 house cusps
 *   - Ascendant (1st house cusp) and Midheaven (10th house cusp)
 *   - Vertex (auxiliary angle)
 *   - Per-aspect aspect list (conjunction, opposition, trine, square, sextile)
 */
export type BirthChart = PlanetaryDNA & {
  // Birth location (degrees)
  latitude: number;
  longitude: number;

  // Angles
  ascendant: number;    // [0, 360) — zodiacal longitude of 1st house cusp
  midheaven: number;    // [0, 360) — zodiacal longitude of 10th house cusp (= IC + 180)
  vertex: number;       // [0, 360) — auxiliary

  // 12 house cusps (ecliptic longitude, [0, 360))
  // Index 0 = house 1 (Ascendant), Index 9 = house 10 (Midheaven)
  houses: [number, number, number, number, number, number, number, number, number, number, number, number];

  // Body positions in [0, 360) — the wheel uses these for marker placement.
  // Includes the 10 bodies; sun/moon also live on PlanetaryDNA but we keep
  // them here too for convenience so the wheel doesn't need to splice.
  bodies: Record<BodyKey, number>;

  // Aspects between bodies, in orbs of the 5 major aspects.
  aspects: Aspect[];
};

export type AudioBand = "bass" | "mid" | "treble" | "vocals";

export type PaletteName =
  | "aurora"
  | "ember"
  | "tide"
  | "ink"
  | "bone"
  | "moss";

export type CameraMode =
  | "drone"
  | "orbit"
  | "meditationDrift"
  | "inside"
  | "cinematic";

export type ShaderGraph = {
  version: 1;
  system: LivingSystemName;
  params: Record<string, number | string | boolean>;
  audioBindings: Record<AudioBand, string>;
  palette: PaletteName;
  camera: CameraMode;
  postFx: {
    bloom: number; // [0,2]
    chromaticAberration: number; // [0, 0.02]
    filmGrain: number; // [0, 0.2]
    feedback: number; // [0,1]
  };
};

// ============================================================
// Artwork — the central record
// ============================================================

export type BirthLocation = {
  label: string;        // e.g. "Reykjavík, Iceland"
  latitude: number;     // degrees, +N
  longitude: number;    // degrees, +E
};

export type Artwork = {
  id: ArtworkId;
  seed: Seed;
  soundtrack: Soundtrack;
  audioDNA: AudioDNA;
  visualDNA?: VisualDNA;         // present when the genome is image-driven
  planetaryDNA?: PlanetaryDNA;   // present when the genome is planetary (a moment)
  birthChart?: BirthChart;       // present when the genome is a personal birth chart
  birthLocation?: BirthLocation; // present alongside birthChart
  shaderGraph: ShaderGraph;
  createdAt: string; // ISO 8601
  creator: string; // user id or anonymous session id
  title?: string;

  // Remix chain (action 20) — lineage of forks.
  // parentId points at the artwork this was forked from. unset for originals.
  parentId?: ArtworkId;
};

// ============================================================
// Living System Definition (registered primitive)
// ============================================================

export type ParamSpec = {
  key: string;
  label: string;
  min: number;
  max: number;
  step: number;
  default: number;
  group: "physics" | "visual" | "audio";
};

export type LivingSystemDefinition = {
  name: LivingSystemName;
  label: string;
  description: string;
  defaultParams: Record<string, number>;
  defaultAudioBindings: Record<AudioBand, string>;
  paramSpec: ParamSpec[];
};

// ============================================================
// Flow Field Meditation — system definition
// ============================================================

export const FLOW_FIELD_MEDITATION: LivingSystemDefinition = {
  name: "flowFieldMeditation",
  label: "Flow Field Meditation",
  description:
    "Millions of particles drifting through currents derived from harmonic ratios. The most alive-feeling of the Living Systems.",
  defaultParams: {
    particleCount: 250_000,
    noiseScale: 0.6,
    fieldStrength: 1.0,
    drag: 0.08,
    spawnRadius: 8.0,
    maxAge: 12.0,
    pointSize: 1.4,
  },
  defaultAudioBindings: {
    bass: "fieldStrength",
    mid: "drag",
    treble: "noiseScale",
    vocals: "bloom",
  },
  paramSpec: [
    {
      key: "particleCount",
      label: "Particles",
      min: 50_000,
      max: 1_000_000,
      step: 50_000,
      default: 250_000,
      group: "physics",
    },
    {
      key: "noiseScale",
      label: "Noise Scale",
      min: 0.1,
      max: 2.5,
      step: 0.05,
      default: 0.6,
      group: "physics",
    },
    {
      key: "fieldStrength",
      label: "Field Strength",
      min: 0,
      max: 3,
      step: 0.05,
      default: 1.0,
      group: "physics",
    },
    {
      key: "drag",
      label: "Drag",
      min: 0,
      max: 0.3,
      step: 0.005,
      default: 0.08,
      group: "physics",
    },
    {
      key: "spawnRadius",
      label: "Spawn Radius",
      min: 2,
      max: 20,
      step: 0.5,
      default: 8.0,
      group: "physics",
    },
    {
      key: "maxAge",
      label: "Max Age",
      min: 2,
      max: 30,
      step: 1,
      default: 12.0,
      group: "physics",
    },
    {
      key: "pointSize",
      label: "Point Size",
      min: 0.4,
      max: 4.0,
      step: 0.1,
      default: 1.4,
      group: "visual",
    },
  ],
};

// ============================================================
// Default graph factory
// ============================================================

export function defaultShaderGraph(): ShaderGraph {
  return {
    version: 1,
    system: "flowFieldMeditation",
    params: { ...FLOW_FIELD_MEDITATION.defaultParams },
    audioBindings: { ...FLOW_FIELD_MEDITATION.defaultAudioBindings },
    palette: "aurora",
    camera: "drone",
    postFx: {
      bloom: 0.8,
      chromaticAberration: 0.002,
      filmGrain: 0.05,
      feedback: 0.05,
    },
  };
}