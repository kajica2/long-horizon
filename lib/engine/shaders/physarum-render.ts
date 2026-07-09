/**
 * Physarum render shader — displays the pheromone field as a color-mapped
 * texture on a fullscreen quad or 3D plane.
 *
 * Reads the pheromone scalar field (R32F) and maps its intensity through
 * the active palette (2-color gradient, like the particle render shader)
 * to produce the final image.
 *
 * Color-mapping: low pheromone → u_colorLow, high pheromone → u_colorHigh.
 * The threshold curve uses a power-law for visual contrast.
 */

import type { PaletteName } from "@/lib/types";

export const PHYSARUM_RENDER_VERTEX = /* glsl */ `
varying vec2 v_uv;
void main() {
  v_uv = uv;
  gl_Position = vec4(position, 1.0);
}
`;

export const PHYSARUM_RENDER_FRAGMENT = /* glsl */ `
precision highp float;

uniform sampler2D u_pheromoneTex;
uniform vec3 u_colorLow;
uniform vec3 u_colorHigh;
uniform float u_intensity;   // [0,1] master gain
uniform float u_exposure;    // gamma-ish: higher = brighter mid-tones

varying vec2 v_uv;

void main() {
  float p = texture2D(u_pheromoneTex, v_uv).r;
  // Map pheromone scalar to [0, 1] with exposure
  float t = clamp(p * u_exposure, 0.0, 1.0);
  // Slight contrast curve
  t = pow(t, 0.85);
  vec3 color = mix(u_colorLow, u_colorHigh, t) * u_intensity;
  gl_FragColor = vec4(color, 1.0);
}
`;

/**
 * Same palette colors as particle-render.ts so the two systems share
 * a unified look-and-feel. The dispatch-physarum manifest restricts the
 * available palettes; this table is the source of truth for actual RGB.
 */
export const PALETTES: Record<
  PaletteName,
  { low: [number, number, number]; high: [number, number, number] }
> = {
  aurora: { low: [0.05, 0.04, 0.12], high: [0.95, 0.30, 0.80] }, // deep violet → pink
  ember:  { low: [0.10, 0.03, 0.02], high: [0.95, 0.55, 0.10] }, // ember black → amber
  tide:   { low: [0.02, 0.06, 0.10], high: [0.20, 0.90, 0.60] }, // deep ocean → mint
  ink:    { low: [0.02, 0.02, 0.05], high: [0.78, 0.82, 0.86] }, // ink → silver
  bone:   { low: [0.10, 0.08, 0.06], high: [0.95, 0.92, 0.86] }, // charcoal → bone
  moss:   { low: [0.04, 0.08, 0.04], high: [0.60, 0.75, 0.30] }, // deep moss → olive
};