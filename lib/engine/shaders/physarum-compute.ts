/**
 * Physarum agent compute shader.
 *
 * Inputs (read):
 *   - u_agentTexture:  RGBA32F (x, y, heading, agentSeed)
 *   - u_pheromoneTex:  R32F (pheromone scalar field)
 *
 * Output (write):
 *   - next agent texture (ping-pong with input)
 *
 * Each pixel of the dispatch = one agent. Per-agent storage is float
 * (x, y, heading, agentSeed) so we can pack agent index derivation from
 * gl_FragCoord and pull agentSeed from the .w channel for stochastic jitter.
 *
 * Algorithm (Jeff Jones 2010):
 *   1. Sense pheromone at three points: forward, +sensorAngle, -sensorAngle,
 *      each at distance sensorDistance.
 *   2. If center > left && center > right → continue straight (with jitter).
 *      Else turn toward the stronger side by up to turnRate.
 *   3. Move forward by stepSize (with wrap to [0, dim]).
 *   4. Write new (x, y, heading) to output; agentSeed is unchanged.
 *
 * Reproducibility: same (seed, position, heading, pheromone, t) → same output.
 * Stochastic jitter is hash-deterministic from agentSeed + frame index — no
 * use of uniform-random since we have no per-step uniform input.
 */

export const PHYSARUM_AGENT_COMPUTE_FRAGMENT = /* glsl */ `
precision highp float;

uniform sampler2D u_agentTexture;
uniform sampler2D u_pheromoneTex;

uniform float u_seed;            // artwork seed (32-bit)
uniform float u_frame;           // global frame index, advances at fixedDt
uniform float u_sensorAngle;     // radians
uniform float u_sensorDistance;  // pixels
uniform float u_stepSize;        // pixels per step
uniform float u_turnRate;        // radians, max turn per step
uniform float u_fieldWidth;      // pheromone texture width  (e.g. 1024)
uniform float u_fieldHeight;     // pheromone texture height (e.g. 1024)
uniform vec2  u_agentTexSize;    // agent texture (square) side, e.g. 256

// Hash from float in [0,1) → [0,1)
float hash11(float p) {
  p = fract(p * 0.1031);
  p *= p + 33.33;
  p *= p + p;
  return fract(p);
}

// Sample pheromone field with bilinear interpolation, periodic wrap.
float samplePheromone(vec2 p) {
  vec2 wrapped = vec2(
    mod(p.x, u_fieldWidth),
    mod(p.y, u_fieldHeight)
  );
  vec2 px = wrapped;
  float x0 = floor(px.x);
  float y0 = floor(px.y);
  float x1 = mod(x0 + 1.0, u_fieldWidth);
  float y1 = mod(y0 + 1.0, u_fieldHeight);
  float tx = px.x - x0;
  float ty = px.y - y0;
  vec2 uv00 = vec2(x0 / u_fieldWidth, y0 / u_fieldHeight);
  vec2 uv10 = vec2(x1 / u_fieldWidth, y0 / u_fieldHeight);
  vec2 uv01 = vec2(x0 / u_fieldWidth, y1 / u_fieldHeight);
  vec2 uv11 = vec2(x1 / u_fieldWidth, y1 / u_fieldHeight);
  float v00 = texture2D(u_pheromoneTex, uv00).r;
  float v10 = texture2D(u_pheromoneTex, uv10).r;
  float v01 = texture2D(u_pheromoneTex, uv01).r;
  float v11 = texture2D(u_pheromoneTex, uv11).r;
  float a = mix(v00, v10, tx);
  float b = mix(v01, v11, tx);
  return mix(a, b, ty);
}

void main() {
  vec2 uv = gl_FragCoord.xy / u_agentTexSize;
  vec4 agent = texture2D(u_agentTexture, uv);
  float x = agent.x;
  float y = agent.y;
  float h = agent.z;
  float aSeed = agent.w;

  // Sensor positions
  float sd = u_sensorDistance;
  float sa = u_sensorAngle;
  vec2 ctrPt = vec2(x + cos(h) * sd, y + sin(h) * sd);
  vec2 lPt   = vec2(x + cos(h + sa) * sd, y + sin(h + sa) * sd);
  vec2 rPt   = vec2(x + cos(h - sa) * sd, y + sin(h - sa) * sd);

  float cVal = samplePheromone(ctrPt);
  float lVal = samplePheromone(lPt);
  float rVal = samplePheromone(rPt);

  // Hash-deterministic jitter for stochastic turn behavior.
  float j1 = hash11(aSeed * 7.13 + u_frame * 0.731 + u_seed * 0.0001);
  float j2 = hash11(aSeed * 3.91 + u_frame * 1.073 + u_seed * 0.0002);
  float jitter = (j1 - 0.5) * u_turnRate * 0.25;

  float newH;
  if (cVal > lVal && cVal > rVal) {
    // Continue straight with a tiny random walk
    newH = h + jitter * 0.25;
  } else if (lVal > rVal) {
    newH = h - u_turnRate + jitter;
  } else if (rVal > lVal) {
    newH = h + u_turnRate + jitter;
  } else {
    // Tie — pick a random side
    float s = j2 < 0.5 ? -1.0 : 1.0;
    newH = h + s * u_turnRate + jitter;
  }

  // Move forward
  float nx = x + cos(newH) * u_stepSize;
  float ny = y + sin(newH) * u_stepSize;

  // Periodic wrap to keep agents inside [0, dim)
  nx = mod(nx, u_fieldWidth);
  ny = mod(ny, u_fieldHeight);

  gl_FragColor = vec4(nx, ny, newH, aSeed);
}
`;