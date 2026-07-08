/**
 * Particle render shaders — vertices sample the position texture,
 * fragments apply age-based gradient + audio energy modulation.
 */

export const PARTICLE_VERTEX = /* glsl */ `
attribute float a_index;          // particle index 0..N
uniform sampler2D u_positionTexture;
uniform vec2 u_textureSize;
uniform float u_pointSize;
uniform float u_pixelRatio;

varying float v_age;
varying float v_seed01;

void main() {
  // Map index to UV
  vec2 uv = vec2(
    mod(a_index, u_textureSize.x) / u_textureSize.x,
    floor(a_index / u_textureSize.x) / u_textureSize.y
  );
  vec4 data = texture2D(u_positionTexture, uv);

  vec3 pos = data.xyz;
  float age = data.w;

  vec4 mvPosition = modelViewMatrix * vec4(pos, 1.0);
  gl_Position = projectionMatrix * mvPosition;

  // Distance attenuation
  gl_PointSize = u_pointSize * u_pixelRatio * (10.0 / -mvPosition.z);

  v_age = age;
  v_seed01 = fract(a_index * 0.6180339887);  // golden ratio hashing
}
`;

export const PARTICLE_FRAGMENT = /* glsl */ `
uniform vec3 u_colorStart;
uniform vec3 u_colorEnd;
uniform float u_maxAge;
uniform float u_energy;          // [0, 1] audio-driven brightness
uniform float u_alpha;

varying float v_age;
varying float v_seed01;

void main() {
  // Circular soft point
  vec2 d = gl_PointCoord - 0.5;
  float r = length(d);
  if (r > 0.5) discard;
  float falloff = 1.0 - smoothstep(0.0, 0.5, r);

  // Age-based gradient: cool (start) → warm (end)
  float t = clamp(v_age / u_maxAge, 0.0, 1.0);
  vec3 color = mix(u_colorStart, u_colorEnd, t);

  // Energy modulation
  color *= (0.6 + u_energy * 0.8);

  // Slight per-particle hue variation
  color += vec3(sin(v_seed01 * 6.28), cos(v_seed01 * 4.0), 0.0) * 0.05;

  gl_FragColor = vec4(color, falloff * u_alpha);
}
`;

export const PALETTES: Record<
  "aurora" | "ember" | "tide" | "ink" | "bone" | "moss",
  { start: [number, number, number]; end: [number, number, number] }
> = {
  aurora: { start: [0.20, 0.40, 0.95], end: [0.95, 0.30, 0.80] }, // violet → pink
  ember: { start: [0.95, 0.50, 0.10], end: [0.90, 0.10, 0.05] }, // amber → crimson
  tide: { start: [0.05, 0.60, 0.70], end: [0.20, 0.90, 0.60] }, // cyan → mint
  ink: { start: [0.10, 0.10, 0.20], end: [0.50, 0.20, 0.85] }, // deep blue → violet
  bone: { start: [0.85, 0.85, 0.80], end: [0.55, 0.55, 0.50] }, // warm white → grey
  moss: { start: [0.20, 0.50, 0.20], end: [0.60, 0.75, 0.30] }, // dark green → olive
};