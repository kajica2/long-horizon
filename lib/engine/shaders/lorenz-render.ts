/**
 * Lorenz Attractor — line-render shaders.
 *
 * Renders the orbit as a polyline. The vertex shader receives a flat
 * position buffer (length = trailLength * 3) plus a per-vertex "age"
 * attribute carrying the chronological index (0 = oldest, head-1 = newest).
 *
 * The fragment shader fades older segments to transparent so the trail
 * "snakes" out of the orbit's tail into the bright head, and tints the
 * segment by the active palette.
 *
 * Palette color is driven by two uniforms (start/end), mirroring the
 * particle-render convention so the Lorenz slice can share the
 * `PaletteName` codepath with the rest of the engine.
 */

export type LorenzPaletteName =
  | "aurora"
  | "ember"
  | "tide"
  | "ink"
  | "bone"
  | "moss";

export type LorenzPalette = {
  start: [number, number, number];
  end: [number, number, number];
};

export const LORENZ_PALETTES: Record<LorenzPaletteName, LorenzPalette> = {
  aurora: { start: [0.20, 0.40, 0.95], end: [0.95, 0.30, 0.80] },
  ember:  { start: [0.95, 0.50, 0.10], end: [0.90, 0.10, 0.05] },
  tide:   { start: [0.05, 0.60, 0.70], end: [0.20, 0.90, 0.60] },
  ink:    { start: [0.10, 0.10, 0.20], end: [0.50, 0.20, 0.85] },
  bone:   { start: [0.85, 0.85, 0.80], end: [0.55, 0.55, 0.50] },
  moss:   { start: [0.20, 0.50, 0.20], end: [0.60, 0.75, 0.30] },
};

export const LORENZ_VERTEX = /* glsl */ `
precision highp float;

attribute vec3 position;
attribute float a_age;     // 0..trailLength-1; 0 = oldest, max = newest

uniform float u_maxAge;    // == trailLength; age denominator
uniform float u_lineWidth;
uniform float u_pixelRatio;

varying float v_age01;     // normalised age [0, 1]; 1 = head (newest)

void main() {
  vec4 mvPosition = modelViewMatrix * vec4(position, 1.0);
  gl_Position = projectionMatrix * mvPosition;

  // Distance attenuation for line width, so trails don't look like ropes
  // when the camera flies close to the attractor.
  gl_PointSize = 1.0;
  v_age01 = clamp(a_age / max(u_maxAge, 1.0), 0.0, 1.0);
}
`;

export const LORENZ_FRAGMENT = /* glsl */ `
precision highp float;

uniform vec3 u_colorStart;
uniform vec3 u_colorEnd;
uniform float u_fadeTail;   // [0, 1] — how aggressively to fade old segments
uniform float u_alpha;
uniform float u_audioBass;
uniform float u_audioMid;

varying float v_age01;

void main() {
  // Older segments fade to transparent. u_fadeTail lets the parameter
  // panel stretch the tail (1.0) or cut it hard (0.5).
  float fade = smoothstep(0.0, 1.0 - u_fadeTail, 1.0 - v_age01);
  // Lift the head — the newest few percent glow brighter.
  float headBoost = smoothstep(0.85, 1.0, v_age01);

  // Palette interpolation along the trail — start (old) → end (new).
  vec3 color = mix(u_colorStart, u_colorEnd, v_age01);

  // Subtle audio modulation.
  color *= 0.85 + 0.15 * u_audioBass;
  color += vec3(u_audioMid * 0.05, 0.0, u_audioMid * 0.05);

  // Head boost — only on the brightest section.
  color += vec3(headBoost) * 0.4;

  float a = fade * u_alpha;
  if (a <= 0.001) discard;
  gl_FragColor = vec4(color, a);
}
`;
