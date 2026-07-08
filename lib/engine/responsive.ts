/**
 * Responsive + accessibility utilities for the engine.
 *
 * Used to scale particle counts and tick rates down on mobile, and to respect
 * the user's prefers-reduced-motion preference.
 *
 * Living systems picked by viewport width:
 *   - mobile (< 640px): drop particle counts to ~30% of desktop, disable
 *     non-essential post-FX, swap to reduced-motion variants
 *   - tablet (640-1024): ~70% of desktop
 *   - desktop (≥ 1024): full fidelity
 */

export type DeviceTier = "mobile" | "tablet" | "desktop";

/**
 * Determine the device tier for a given viewport width.
 * The width passed should be the visual viewport width (not layout, not DPR-scaled).
 */
export function deviceTierForWidth(width: number): DeviceTier {
  if (width < 640) return "mobile";
  if (width < 1024) return "tablet";
  return "desktop";
}

/**
 * Scale a particle / curve count by device tier. Returns floor(count * scale).
 *   - desktop: 1.0
 *   - tablet: 0.7
 *   - mobile: 0.3
 */
export function scaleForTier(tier: DeviceTier): number {
  if (tier === "mobile") return 0.3;
  if (tier === "tablet") return 0.7;
  return 1.0;
}

/**
 * Tick rate cap by tier (frames per second). Mobile runs at 30fps to preserve
 * battery on background browsers; tablet at 45; desktop at 60.
 */
export function tickRateForTier(tier: DeviceTier): number {
  if (tier === "mobile") return 30;
  if (tier === "tablet") return 45;
  return 60;
}

/**
 * Returns a count clamped to a defensible min for living systems that must
 * always show *something*. Floor: 256 particles, 32 travelers, 8 filaments.
 */
export function floorCount(count: number, kind: "particles" | "filaments" | "travelers"): number {
  if (kind === "particles") return Math.max(256, Math.floor(count * scaleForTier("mobile")));
  if (kind === "travelers") return Math.max(32, Math.floor(count * scaleForTier("mobile")));
  if (kind === "filaments") return Math.max(8, Math.floor(count * scaleForTier("mobile")));
  return Math.max(1, Math.floor(count));
}

/**
 * Respects prefers-reduced-motion: when enabled, the engine should disable
 * post-FX, freeze camera drift, and slow the simulation tick rate.
 *
 * Detect via:
 *   window.matchMedia('(prefers-reduced-motion: reduce)').matches
 *
 * This is a thin wrapper so test code doesn't need to mock matchMedia.
 */
export function prefersReducedMotion(): boolean {
  if (typeof window === "undefined" || !window.matchMedia) return false;
  return window.matchMedia("(prefers-reduced-motion: reduce)").matches;
}

/**
 * Detect Safari / iOS WebKit. WebKit has known quirks with:
 *   - AudioContext autoplay (need user gesture)
 *   - WebGL2 availability on older devices
 *   - OffscreenCanvas (limited support)
 */
export function isWebKit(): boolean {
  if (typeof navigator === "undefined") return false;
  const ua = navigator.userAgent;
  return /AppleWebKit/i.test(ua) && !/Chrome|Chromium|Edg/i.test(ua);
}

/**
 * The default particle counts before scaling.
 *  - 250,000 for flowFieldMeditation (GPGPU, GPU strain)
 *  - 12,000 for deJongAttractor (CPU-bound)
 *  - 600 for cosmicFilaments strands
 *
 * These get scaled by tier via scaleForTier() before being passed to renderers.
 */
export const DEFAULT_PARTICLE_COUNTS = {
  flowField: 250_000,
  dejongTravelers: 12_000,
  filamentCount: 600,
  sandTravelers: 800,
} as const;

export function scaledFlowFieldCount(tier: DeviceTier): number {
  return Math.floor(DEFAULT_PARTICLE_COUNTS.flowField * scaleForTier(tier));
}

export function scaledDejongCount(tier: DeviceTier): number {
  return Math.floor(DEFAULT_PARTICLE_COUNTS.dejongTravelers * scaleForTier(tier));
}

export function scaledFilamentCount(tier: DeviceTier): number {
  return Math.floor(DEFAULT_PARTICLE_COUNTS.filamentCount * scaleForTier(tier));
}

export function scaledSandCount(tier: DeviceTier): number {
  return Math.floor(DEFAULT_PARTICLE_COUNTS.sandTravelers * scaleForTier(tier));
}
