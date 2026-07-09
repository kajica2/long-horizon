/**
 * Physarum (Slime Mold) — Jeff Jones 2010 agent-based simulation.
 *
 * Each agent has position (x, y) and heading θ. Each step:
 *   1. Agent senses pheromone at 3 points: front, front-left, front-right
 *      (each offset by ±sensorAngle from heading at distance sensorDistance).
 *   2. Agent turns toward the strongest sensor (with stochastic jitter).
 *   3. Agent moves forward by stepSize.
 *   4. Agent deposits pheromone at its new position.
 *
 * A separate pheromone field diffuses (3x3 weighted average) and decays
 * (multiply by decay coefficient) every step. The pheromone texture is what
 * we render — agents self-organize into network-like structures resembling
 * real slime mold.
 *
 * This module is GPU-AGNOSTIC where possible. The runtime path uses GLSL
 * compute shaders (see lib/engine/shaders/physarum-*.ts). The CPU
 * implementation below is for unit tests only — limited to ≤2000 agents.
 *
 * Reproducibility: same (seed, t) → identical state on any machine.
 * All randomness uses mulberry32 + hashSeed from lib/seed. NO Math.random.
 */

import { mulberry32, hashSeed } from "@/lib/seed";

// ============================================================
// Numeric defaults — match lib/engine/dispatch-physarum.ts
// ============================================================

export const DEFAULT_NUM_AGENTS = 65536;
export const DEFAULT_PHEROMONE_W = 1024;
export const DEFAULT_PHEROMONE_H = 1024;
export const DEFAULT_SENSOR_ANGLE_DEG = 22.5;
export const DEFAULT_SENSOR_DISTANCE = 9.0;
export const DEFAULT_STEP_SIZE = 1.0;
export const DEFAULT_TURN_RATE_DEG = 45.0;
export const DEFAULT_DECAY = 0.92;
export const DEFAULT_DIFFUSE = 0.5;

export const LOW_TIER_NUM_AGENTS = 16384;

/** Maximum agent count for CPU step — keep test path fast. */
export const CPU_MAX_AGENTS = 2000;

// ============================================================
// State types
// ============================================================

/**
 * One agent in the simulation. x, y are float pixel coordinates inside the
 * pheromone texture; heading is in radians [0, 2π).
 */
export type PhysarumAgent = {
  x: number;
  y: number;
  heading: number;
};

/**
 * Pheromone field — a 2D scalar grid stored row-major as a Float32Array of
 * length width * height. Values are non-negative floats that diffuse/decay
 * over time. Use Float32 (typed array) so we can pass the same backing
 * buffer into a DataTexture in the GPU path if we want to upload it.
 */
export type PheromoneField = {
  width: number;
  height: number;
  data: Float32Array;
};

export type PhysarumParams = {
  sensorAngle: number;   // radians (stored internally; degrees in the dispatch manifest)
  sensorDistance: number; // pixels
  stepSize: number;      // pixels
  turnRate: number;      // radians (max turn per step)
  decay: number;         // [0,1] pheromone retained each step
  diffuse: number;       // [0,1] 3x3 gaussian blend coefficient (0=sharp, 1=all-neighbors)
};

export type PhysarumState = {
  agents: PhysarumAgent[];
  pheromone: PheromoneField;
  pheromoneTmp: PheromoneField; // second buffer for diffuse ping-pong
  params: PhysarumParams;
  frame: number;
  width: number;
  height: number;
  rng: () => number;
  seed: string;
};

// ============================================================
// Helpers
// ============================================================

function degToRad(deg: number): number {
  return (deg * Math.PI) / 180;
}

/**
 * Wraps x into [0, width). Periodic boundary — matches the GPU texture's
 * REPEAT wrap mode so an agent leaving the right edge reappears on the left.
 */
function wrap(v: number, max: number): number {
  const r = v % max;
  return r < 0 ? r + max : r;
}

/** Sample the pheromone field with bilinear interpolation at (fx, fy). */
function samplePheromone(field: PheromoneField, fx: number, fy: number): number {
  const w = field.width;
  const h = field.height;
  // Wrap to [0, w) and [0, h)
  let x = fx;
  let y = fy;
  x = wrap(x, w);
  y = wrap(y, h);
  const x0 = Math.floor(x);
  const y0 = Math.floor(y);
  const x1 = (x0 + 1) % w;
  const y1 = (y0 + 1) % h;
  const tx = x - x0;
  const ty = y - y0;
  const v00 = field.data[y0 * w + x0];
  const v10 = field.data[y0 * w + x1];
  const v01 = field.data[y1 * w + x0];
  const v11 = field.data[y1 * w + x1];
  const a = v00 * (1 - tx) + v10 * tx;
  const b = v01 * (1 - tx) + v11 * tx;
  return a * (1 - ty) + b * ty;
}

/** Deposit pheromone at integer cell (x, y) with additive blending. */
function deposit(
  field: PheromoneField,
  x: number,
  y: number,
  amount: number,
): void {
  const w = field.width;
  const h = field.height;
  const xi = ((Math.floor(x) % w) + w) % w;
  const yi = ((Math.floor(y) % h) + h) % h;
  field.data[yi * w + xi] += amount;
}

// ============================================================
// senseField — pure, fully testable
// ============================================================

/**
 * Sample pheromone at the three sensor points of an agent.
 *   - Forward sensor:  (agent.x + cos(h+sensorAngle*0)*sensorDistance, ...)
 *                      — but the standard convention is "center sensor along
 *                      heading, with two flanking sensors at ±sensorAngle".
 *   - Left sensor:     heading + sensorAngle
 *   - Right sensor:    heading - sensorAngle
 *
 * Returns [center, left, right] pheromone readings. Pure function: no
 * state mutation, no random, fully deterministic.
 */
export function senseField(
  agent: PhysarumAgent,
  pheromone: PheromoneField,
  sensorAngle: number,
  sensorDistance: number,
): [number, number, number] {
  const cx = agent.x + Math.cos(agent.heading) * sensorDistance;
  const cy = agent.y + Math.sin(agent.heading) * sensorDistance;
  const lh = agent.heading + sensorAngle;
  const rh = agent.heading - sensorAngle;
  const lx = agent.x + Math.cos(lh) * sensorDistance;
  const ly = agent.y + Math.sin(lh) * sensorDistance;
  const rx = agent.x + Math.cos(rh) * sensorDistance;
  const ry = agent.y + Math.sin(rh) * sensorDistance;

  const center = samplePheromone(pheromone, cx, cy);
  const left = samplePheromone(pheromone, lx, ly);
  const right = samplePheromone(pheromone, rx, ry);
  return [center, left, right];
}

/**
 * Given a 3-tuple of sensor readings and an RNG function, return the new
 * heading. Pure-ish (uses rng for stochastic jitter).
 *
 * If center > left AND center > right → no turn (continue straight).
 * If left > right → turn left by turnRate (with jitter).
 * If right > left → turn right by turnRate (with jitter).
 * If left == right → turn randomly left or right (with full turnRate jitter).
 */
export function decideTurn(
  readings: [number, number, number],
  heading: number,
  turnRate: number,
  rng: () => number,
): number {
  const [c, l, r] = readings;
  const jitter = (rng() - 0.5) * turnRate * 0.25;
  if (c > l && c > r) {
    // Stay straight, but add a tiny random walk to keep things alive
    return heading + jitter * 0.25;
  }
  if (l > r) {
    return heading - turnRate + jitter;
  }
  if (r > l) {
    return heading + turnRate + jitter;
  }
  // Tie: pick a random side
  const sign = rng() < 0.5 ? -1 : 1;
  return heading + sign * turnRate + jitter;
}

// ============================================================
// State creation / reset
// ============================================================

export function createPhysarumState(opts: {
  seed: string;
  numAgents?: number;
  width?: number;
  height?: number;
  params?: Partial<PhysarumParams>;
}): PhysarumState {
  const seedU32 = hashSeed(opts.seed);
  const rng = mulberry32(seedU32);

  const numAgents = opts.numAgents ?? DEFAULT_NUM_AGENTS;
  const width = opts.width ?? DEFAULT_PHEROMONE_W;
  const height = opts.height ?? DEFAULT_PHEROMONE_H;

  // Agents initialized uniformly over the field, headings uniform [0, 2π)
  const agents: PhysarumAgent[] = new Array(numAgents);
  for (let i = 0; i < numAgents; i++) {
    agents[i] = {
      x: rng() * width,
      y: rng() * height,
      heading: rng() * Math.PI * 2,
    };
  }

  const params: PhysarumParams = {
    sensorAngle: degToRad(opts.params?.sensorAngle ?? DEFAULT_SENSOR_ANGLE_DEG),
    sensorDistance: opts.params?.sensorDistance ?? DEFAULT_SENSOR_DISTANCE,
    stepSize: opts.params?.stepSize ?? DEFAULT_STEP_SIZE,
    turnRate: degToRad(opts.params?.turnRate ?? DEFAULT_TURN_RATE_DEG),
    decay: opts.params?.decay ?? DEFAULT_DECAY,
    diffuse: opts.params?.diffuse ?? DEFAULT_DIFFUSE,
  };

  const pheromone: PheromoneField = {
    width,
    height,
    data: new Float32Array(width * height),
  };
  const pheromoneTmp: PheromoneField = {
    width,
    height,
    data: new Float32Array(width * height),
  };

  return {
    agents,
    pheromone,
    pheromoneTmp,
    params,
    frame: 0,
    width,
    height,
    rng,
    seed: opts.seed,
  };
}

/**
 * Reset the simulation to frame 0 using the same seeded RNG.
 * Re-derives agent positions and headings; clears pheromone.
 * The RNG is re-seeded so the new initial state is identical to the
 * initial state from createPhysarumState (deterministic replay).
 */
export function resetPhysarum(state: PhysarumState): void {
  const fresh = createPhysarumState({
    seed: state.seed,
    numAgents: state.agents.length,
    width: state.width,
    height: state.height,
    params: {
      // Convert internal radian params back to degrees for the ctor
      sensorAngle: (state.params.sensorAngle * 180) / Math.PI,
      sensorDistance: state.params.sensorDistance,
      stepSize: state.params.stepSize,
      turnRate: (state.params.turnRate * 180) / Math.PI,
      decay: state.params.decay,
      diffuse: state.params.diffuse,
    },
  });
  // Copy fresh fields into the existing state object (preserve identity)
  state.agents = fresh.agents;
  state.pheromone.data.fill(0);
  state.pheromoneTmp.data.fill(0);
  state.frame = 0;
  state.rng = fresh.rng;
  state.params = fresh.params;
}

// ============================================================
// CPU step (testing only — supports up to CPU_MAX_AGENTS agents)
// ============================================================

/**
 * Advance the simulation by one frame on the CPU. Intended for unit tests;
 * the runtime path uses GLSL compute shaders. The agent count is bounded by
 * CPU_MAX_AGENTS to keep test wall-time reasonable.
 *
 * For each agent:
 *   1. Sense pheromone at 3 sensor points.
 *   2. Decide turn (toward strongest, with jitter).
 *   3. Move forward.
 *   4. Deposit pheromone at new position.
 * Then diffuse + decay the field.
 */
export function stepPhysarumCPU(
  state: PhysarumState,
  pheromone?: PheromoneField,
  // dt is accepted for API symmetry with the GPU step function; the CPU
  // implementation runs a single fixed step regardless of dt.
  _dt?: number,
): void {
  // Reference _dt to satisfy linter while keeping the param in the signature
  // for API parity with the GPU step (see spec).
  void _dt;
  if (state.agents.length > CPU_MAX_AGENTS) {
    throw new Error(
      `stepPhysarumCPU: agent count ${state.agents.length} exceeds CPU_MAX_AGENTS (${CPU_MAX_AGENTS}); use the GPU path for >${CPU_MAX_AGENTS} agents.`,
    );
  }
  const field = pheromone ?? state.pheromone;
  const { sensorAngle, sensorDistance, stepSize, turnRate } = state.params;

  // 1. Move + turn each agent (and deposit)
  for (let i = 0; i < state.agents.length; i++) {
    const a = state.agents[i];
    const readings = senseField(a, field, sensorAngle, sensorDistance);
    a.heading = decideTurn(readings, a.heading, turnRate, state.rng);
    // Wrap heading into [0, 2π) so it never escapes even under heavy jitter
    if (a.heading < 0) a.heading += Math.PI * 2;
    else if (a.heading >= Math.PI * 2) a.heading -= Math.PI * 2;
    a.x += Math.cos(a.heading) * stepSize;
    a.y += Math.sin(a.heading) * stepSize;
    // Wrap position
    if (a.x < 0) a.x += state.width;
    else if (a.x >= state.width) a.x -= state.width;
    if (a.y < 0) a.y += state.height;
    else if (a.y >= state.height) a.y -= state.height;
    // Deposit
    deposit(field, a.x, a.y, 1.0);
  }

  // 2. Diffuse + decay: in-place 3x3 weighted average × decay
  //    We use the tmp buffer to avoid races, then swap.
  const w = state.width;
  const h = state.height;
  const src = field.data;
  const dst = state.pheromoneTmp.data;
  const diffuse = state.params.diffuse;
  // Center weight = (1 - diffuse) so when diffuse=0 the field is unchanged,
  // and the 8 neighbors average in proportion to diffuse.
  const centerW = 1 - diffuse;
  const neighborW = diffuse / 8;

  for (let y = 0; y < h; y++) {
    const ym = (y - 1 + h) % h;
    const yp = (y + 1) % h;
    for (let x = 0; x < w; x++) {
      const xm = (x - 1 + w) % w;
      const xp = (x + 1) % w;
      const i = y * w + x;
      const sum =
        src[i] * centerW +
        src[y * w + xm] * neighborW +
        src[y * w + xp] * neighborW +
        src[ym * w + xm] * neighborW +
        src[ym * w + x] * neighborW +
        src[ym * w + xp] * neighborW +
        src[yp * w + xm] * neighborW +
        src[yp * w + x] * neighborW +
        src[yp * w + xp] * neighborW;
      dst[i] = sum * state.params.decay;
    }
  }

  // 3. Swap
  field.data = dst;
  state.pheromoneTmp.data = src;
  // Keep state's reference aligned
  if (pheromone === undefined) {
    state.pheromone.data = dst;
    state.pheromoneTmp.data = src;
  }

  state.frame++;
}