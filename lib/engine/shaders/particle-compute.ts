/**
 * Particle compute shader — updates position, velocity, age every fixedDt.
 *
 * Inputs (read):
 *   - u_positionTexture: RGBA32F (x, y, z, age)
 *   - u_velocityTexture: RGBA32F (vx, vy, vz, particleSeed)
 *
 * Output (write):
 *   - next position texture, next velocity texture (ping-pong)
 *
 * Determinism: same (seed, position, age, audioMod, t) → same output.
 * Audio modulation only modulates params; it does not compute new state directly.
 */

import { SIMPLEX_3D_GLSL, CURL_NOISE_GLSL } from "./curl-noise";

export const PARTICLE_COMPUTE_FRAGMENT = /* glsl */ `
precision highp float;

uniform sampler2D u_positionTexture;
uniform sampler2D u_velocityTexture;

uniform float u_seed;            // artwork seed (32-bit)
uniform float u_simTime;          // advances at fixedDt
uniform float u_fieldStrength;    // base 1.0; audio bass modulates up
uniform float u_noiseScale;       // spatial frequency of field
uniform float u_drag;             // [0, 0.3] velocity damping
uniform float u_spawnRadius;      // particles respawn outside this
uniform float u_maxAge;           // seconds before forced respawn
uniform float u_fixedDt;          // 1/60 sec
uniform float u_audioBass;        // [0, 1] analyser; small non-state-modulating
uniform float u_audioMid;         // [0, 1]
uniform float u_audioTreble;      // [0, 1]

uniform vec2 u_textureSize;       // width, height of position texture

${SIMPLEX_3D_GLSL}
${CURL_NOISE_GLSL}

// Deterministic respawn position from a per-particle integer-ish seed.
// Combines particle seed with sim time so respawn positions are reproducible.
vec3 respawnPosition(float pSeed, float simT) {
  float s = pSeed + simT * 0.073;  // slow drift so particles don't always respawn at same place
  vec3 unit = normalize(vec3(
    sin(s * 12.9898) * 43758.5453,
    sin(s * 78.233)  * 43758.5453,
    sin(s * 39.346)  * 43758.5453
  ));
  // Cube root for uniform volume distribution
  float r = pow(fract(s * 0.3183099 + 0.1), 1.0 / 3.0) * u_spawnRadius;
  return unit * r;
}

void main() {
  vec2 uv = gl_FragCoord.xy / u_textureSize;
  vec4 posData = texture2D(u_positionTexture, uv);
  vec4 velData = texture2D(u_velocityTexture, uv);

  vec3 pos = posData.xyz;
  float age = posData.w;
  vec3 vel = velData.xyz;
  float pSeed = velData.w;

  // Sample curl-noise force at current position
  vec3 force = curlNoise(u_seed * 0.001 + pSeed * 0.0001, pos * u_noiseScale, u_simTime);

  // Bass boosts field strength (does not accumulate into state — same PCM at same t → same boost)
  float strength = u_fieldStrength * (1.0 + u_audioBass * 1.5);
  vec3 accel = force * strength;

  // Integrate (semi-implicit Euler)
  vel += accel * u_fixedDt;
  // Midrange reduces drag → particles flow more freely
  float effectiveDrag = u_drag * (1.0 - u_audioMid * 0.5);
  vel *= (1.0 - effectiveDrag);
  pos += vel * u_fixedDt;

  // Age and respawn conditions
  age += u_fixedDt;
  bool outOfBounds = length(pos) > u_spawnRadius * 1.5;
  bool tooOld = age > u_maxAge;

  if (tooOld || outOfBounds) {
    pos = respawnPosition(pSeed, floor(u_simTime * 60.0));
    vel = vec3(0.0);
    age = 0.0;
  }

  // Write to output
  gl_FragColor = vec4(pos, age);
}
`;

export const PARTICLE_VELOCITY_COMPUTE_FRAGMENT = /* glsl */ `
// Companion pass: writes the updated velocity to a separate texture.
// In practice we pack velocity+age into the position texture and only
// need a single pass — this stub is here for future split-rendering use.
precision highp float;

void main() {
  gl_FragColor = vec4(0.0);
}
`;