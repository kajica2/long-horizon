/**
 * Background nebula shader — slow-evolving large-scale noise behind particles.
 * Provides depth + parallax. Deterministic from the artwork seed.
 */

import { SIMPLEX_3D_GLSL } from "./curl-noise";

export const BACKGROUND_VERTEX = /* glsl */ `
varying vec2 v_uv;
void main() {
  v_uv = uv;
  gl_Position = vec4(position, 1.0);
}
`;

export const BACKGROUND_FRAGMENT = /* glsl */ `
precision highp float;

uniform float u_seed;
uniform float u_simTime;
uniform float u_audioBass;
uniform vec3 u_colorTop;
uniform vec3 u_colorBottom;

varying vec2 v_uv;

${SIMPLEX_3D_GLSL}

// Smooth value noise (deterministic from seed)
float vnoise(vec2 p) {
  vec2 i = floor(p);
  vec2 f = fract(p);
  vec2 u = f * f * (3.0 - 2.0 * f);
  float a = snoise(vec3(i + vec2(0.0, 0.0), u_seed));
  float b = snoise(vec3(i + vec2(1.0, 0.0), u_seed));
  float c = snoise(vec3(i + vec2(0.0, 1.0), u_seed));
  float d = snoise(vec3(i + vec2(1.0, 1.0), u_seed));
  return mix(mix(a, b, u.x), mix(c, d, u.x), u.y);
}

float fbm(vec2 p) {
  float v = 0.0;
  float a = 0.5;
  for (int i = 0; i < 5; i++) {
    v += a * vnoise(p);
    p *= 2.0;
    a *= 0.5;
  }
  return v;
}

void main() {
  vec2 uv = v_uv - 0.5;
  uv.x *= 1.6;  // slight aspect correction
  float r = length(uv);

  // Slow rotation + zoom for breathing
  float t = u_simTime * 0.02;
  vec2 rotUv = mat2(cos(t), -sin(t), sin(t), cos(t)) * uv;
  float n = fbm(rotUv * 2.0 + vec2(u_simTime * 0.05, 0.0));

  // Bass swells the nebula outward
  float glow = smoothstep(0.5, 0.0, r) * (0.5 + n * 0.5 + u_audioBass * 0.3);

  vec3 color = mix(u_colorBottom, u_colorTop, n * 0.5 + 0.5);
  color *= glow;

  // Vignette
  color *= 1.0 - smoothstep(0.4, 0.9, r);

  gl_FragColor = vec4(color, 1.0);
}
`;