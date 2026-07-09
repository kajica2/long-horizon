/**
 * Physarum pheromone deposit + diffusion + decay shader.
 *
 * Inputs (read):
 *   - u_prevPheromone: R32F previous pheromone field (1024x1024)
 *
 * Outputs (write):
 *   - next pheromone field (ping-pong with input) — deposit + diffuse + decay
 *
 * Each fragment:
 *   1. Sample the 3x3 neighborhood (itself + 8 neighbors).
 *   2. Apply 3x3 weighted average controlled by u_diffuse (0=sharp, 1=blurred).
 *   3. Multiply by u_decay (multiplicative decay, e.g. 0.92 = 8% loss/step).
 *   4. Write to output.
 *
 * Pheromone deposition (agents dropping pheromone at their location) is
 * handled by a separate one-shot additive blend pass — see the component
 * (Physarum.tsx) which renders the agent texture as additive points onto
 * the pheromone target before this diffusion pass. This fragment-shader
 * does the diffuse+decay only; the deposit step happens via an additive
 * point-render of the agent texture, which is more efficient than touching
 * every cell inside this shader.
 */

export const PHYSARUM_DEPOSIT_FRAGMENT = /* glsl */ `
precision highp float;

uniform sampler2D u_prevPheromone;
uniform vec2  u_texSize;     // pheromone texture size (square)
uniform float u_diffuse;     // [0,1] — fraction of neighbor average
uniform float u_decay;       // [0,1] — multiplicative decay per step

void main() {
  vec2 uv = gl_FragCoord.xy / u_texSize;
  vec2 px = uv * u_texSize;
  float x0 = floor(px.x);
  float y0 = floor(px.y);
  float x1 = mod(x0 + 1.0, u_texSize.x);
  float y1 = mod(y0 + 1.0, u_texSize.y);
  float xm = mod(x0 - 1.0 + u_texSize.x, u_texSize.x);
  float ym = mod(y0 - 1.0 + u_texSize.y, u_texSize.y);

  vec2 uv00 = vec2(x0 / u_texSize.x, y0 / u_texSize.y);
  vec2 uv10 = vec2(x1 / u_texSize.x, y0 / u_texSize.y);
  vec2 uv01 = vec2(x0 / u_texSize.x, y1 / u_texSize.y);
  vec2 uv11 = vec2(x1 / u_texSize.x, y1 / u_texSize.y);
  vec2 uvm0 = vec2(xm / u_texSize.x, y0 / u_texSize.y);
  vec2 uv0m = vec2(x0 / u_texSize.x, ym / u_texSize.y);
  vec2 uvmp = vec2(xm / u_texSize.x, y1 / u_texSize.y);
  vec2 uvm1 = vec2(xm / u_texSize.x, y1 / u_texSize.y);
  vec2 uvp1 = vec2(x1 / u_texSize.x, y1 / u_texSize.y);

  float v00 = texture2D(u_prevPheromone, uv00).r;
  float v10 = texture2D(u_prevPheromone, uv10).r;
  float v01 = texture2D(u_prevPheromone, uv01).r;
  float v11 = texture2D(u_prevPheromone, uv11).r;
  float vm0 = texture2D(u_prevPheromone, uvm0).r; // (-1, 0)
  float v0m = texture2D(u_prevPheromone, uv0m).r; // (0, -1)
  float vmp = texture2D(u_prevPheromone, uvmp).r; // (-1, +1)
  float vm1 = texture2D(u_prevPheromone, uvm1).r; // (-1, +1) alias for clarity
  float v1m = texture2D(u_prevPheromone, vec2(x1 / u_texSize.x, ym / u_texSize.y)).r; // (+1, -1)
  float vp1 = texture2D(u_prevPheromone, uvp1).r; // (+1, +1)

  // 3x3 weighted average. Center weight = (1 - diffuse); 8 neighbors split diffuse/8.
  float centerW = 1.0 - u_diffuse;
  float nW = u_diffuse / 8.0;
  float blurred =
      v00 * centerW
    + vm0 * nW
    + v10 * nW
    + v0m * nW
    + v01 * nW
    + vm1 * nW
    + v11 * nW
    + v1m * nW
    + vp1 * nW;

  // Multiplicative decay — values decay toward zero but never go negative.
  float result = max(blurred * u_decay, 0.0);

  gl_FragColor = vec4(result, 0.0, 0.0, 1.0);
}
`;

/**
 * Deposit-only additive shader. Used to splat agent positions onto the
 * pheromone field via additive blending (the agent texture is sampled
 * as additive points). This is a minimal vertex/fragment for a single
 * pass that adds +1 at each agent pixel.
 */
export const PHYSARUM_DEPOSIT_POINT_VERTEX = /* glsl */ `
attribute float a_index;
uniform sampler2D u_agentTexture;
uniform vec2 u_agentTexSize;
uniform float u_fieldSize;
uniform float u_pointSize;
uniform float u_pixelRatio;

void main() {
  vec2 uv = vec2(
    mod(a_index, u_agentTexSize.x) / u_agentTexSize.x,
    floor(a_index / u_agentTexSize.x) / u_agentTexSize.y
  );
  vec4 agent = texture2D(u_agentTexture, uv);
  // agent.x, agent.y are in [0, fieldSize]. Map to NDC.
  gl_Position = vec4(
    (agent.x / u_fieldSize) * 2.0 - 1.0,
    (agent.y / u_fieldSize) * 2.0 - 1.0,
    0.0, 1.0
  );
  gl_PointSize = u_pointSize * u_pixelRatio;
}
`;

export const PHYSARUM_DEPOSIT_POINT_FRAGMENT = /* glsl */ `
void main() {
  // Each agent deposit is a constant +1, softened by a circular falloff.
  vec2 d = gl_PointCoord - 0.5;
  float r = length(d);
  if (r > 0.5) discard;
  gl_FragColor = vec4(1.0 - smoothstep(0.0, 0.5, r), 0.0, 0.0, 1.0);
}
`;