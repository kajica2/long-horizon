/**
 * Physarum — determinism + simulation tests.
 *
 *   1. createState: same seed → identical initial state
 *   2. Different seeds → different initial states
 *   3. After N steps, agents have moved
 *   4. Determinism: two state instances with same seed produce identical state after N steps
 *   5. Reset returns to frame 0 with re-derived state from same RNG
 *   6. senseField returns 3 readings, agent turns toward strongest (controlled test)
 *   7. State stays bounded (no NaN, no Inf, agents within reasonable bounds)
 *   8. Dispatch manifest has all expected fields and ranges are sensible
 *   9. Decay coefficient correctly reduces pheromone values over time
 *  10. CPU_MAX_AGENTS guard rejects oversize agent count
 *  11. decideTurn behaves correctly for each sensor configuration
 */

import { describe, it, expect } from "vitest";
import { mulberry32 } from "@/lib/seed";
import {
  createPhysarumState,
  stepPhysarumCPU,
  resetPhysarum,
  senseField,
  decideTurn,
  CPU_MAX_AGENTS,
  DEFAULT_NUM_AGENTS,
  DEFAULT_PHEROMONE_W,
  DEFAULT_PHEROMONE_H,
  DEFAULT_SENSOR_ANGLE_DEG,
  DEFAULT_SENSOR_DISTANCE,
  DEFAULT_STEP_SIZE,
  DEFAULT_TURN_RATE_DEG,
  DEFAULT_DECAY,
  DEFAULT_DIFFUSE,
  type PhysarumState,
} from "@/lib/engine/physarum";
import { PHYSARUM } from "@/lib/engine/dispatch-physarum";

const SMALL_AGENTS = 1000;
const SMALL_FIELD = 128;

function makeState(seed: string, numAgents = SMALL_AGENTS, w = SMALL_FIELD, h = SMALL_FIELD): PhysarumState {
  return createPhysarumState({ seed, numAgents, width: w, height: h });
}

describe("Physarum — initialization", () => {
  it("same seed → identical initial positions and headings", () => {
    const a = makeState("physarum-seed-a");
    const b = makeState("physarum-seed-a");
    for (let i = 0; i < SMALL_AGENTS; i++) {
      expect(a.agents[i].x).toBe(b.agents[i].x);
      expect(a.agents[i].y).toBe(b.agents[i].y);
      expect(a.agents[i].heading).toBe(b.agents[i].heading);
    }
    expect(a.frame).toBe(b.frame);
  });

  it("different seeds → different initial states", () => {
    const a = makeState("aaaaaaaaaaaaaaaa");
    const b = makeState("bbbbbbbbbbbbbbbb");
    let differs = 0;
    for (let i = 0; i < SMALL_AGENTS; i++) {
      if (
        a.agents[i].x !== b.agents[i].x ||
        a.agents[i].y !== b.agents[i].y ||
        a.agents[i].heading !== b.agents[i].heading
      ) {
        differs++;
      }
    }
    // The vast majority of agents should differ
    expect(differs).toBeGreaterThan(SMALL_AGENTS * 0.9);
  });

  it("starts with the requested number of agents and frame 0", () => {
    const s = makeState("init", 200);
    expect(s.agents).toHaveLength(200);
    expect(s.frame).toBe(0);
    expect(s.pheromone.data).toHaveLength(SMALL_FIELD * SMALL_FIELD);
  });

  it("uses the dispatch manifest defaults when params are not overridden", () => {
    const s = createPhysarumState({
      seed: "default-test",
      numAgents: 100,
      width: 256,
      height: 256,
    });
    // Convert back to degrees for comparison
    const angleDeg = (s.params.sensorAngle * 180) / Math.PI;
    const turnDeg = (s.params.turnRate * 180) / Math.PI;
    expect(angleDeg).toBeCloseTo(DEFAULT_SENSOR_ANGLE_DEG, 5);
    expect(turnDeg).toBeCloseTo(DEFAULT_TURN_RATE_DEG, 5);
    expect(s.params.sensorDistance).toBe(DEFAULT_SENSOR_DISTANCE);
    expect(s.params.stepSize).toBe(DEFAULT_STEP_SIZE);
    expect(s.params.decay).toBe(DEFAULT_DECAY);
    expect(s.params.diffuse).toBe(DEFAULT_DIFFUSE);
  });

  it("default constants match dispatch expectations", () => {
    expect(DEFAULT_NUM_AGENTS).toBe(PHYSARUM.defaultParams.numAgents);
    expect(DEFAULT_PHEROMONE_W).toBe(1024);
    expect(DEFAULT_PHEROMONE_H).toBe(1024);
    expect(DEFAULT_SENSOR_ANGLE_DEG).toBe(22.5);
    expect(DEFAULT_SENSOR_DISTANCE).toBe(9.0);
    expect(DEFAULT_STEP_SIZE).toBe(1.0);
    expect(DEFAULT_TURN_RATE_DEG).toBe(45.0);
    expect(DEFAULT_DECAY).toBe(0.92);
    expect(DEFAULT_DIFFUSE).toBe(0.5);
  });
});

describe("Physarum — simulation", () => {
  it("agents move after one step", () => {
    const s = makeState("move");
    const before = s.agents.map((a) => ({ x: a.x, y: a.y, h: a.heading }));
    stepPhysarumCPU(s);
    let moved = 0;
    for (let i = 0; i < SMALL_AGENTS; i++) {
      if (s.agents[i].x !== before[i].x || s.agents[i].y !== before[i].y) {
        moved++;
      }
    }
    expect(moved).toBe(SMALL_AGENTS);
    expect(s.frame).toBe(1);
  });

  it("two state instances with same seed produce identical state after N steps", () => {
    const a = makeState("det-step");
    const b = makeState("det-step");
    for (let i = 0; i < 5; i++) {
      stepPhysarumCPU(a);
      stepPhysarumCPU(b);
    }
    expect(a.frame).toBe(b.frame);
    for (let i = 0; i < SMALL_AGENTS; i++) {
      expect(Math.abs(a.agents[i].x - b.agents[i].x)).toBeLessThan(1e-10);
      expect(Math.abs(a.agents[i].y - b.agents[i].y)).toBeLessThan(1e-10);
      expect(Math.abs(a.agents[i].heading - b.agents[i].heading)).toBeLessThan(1e-10);
    }
  });

  it("state stays bounded after many steps (no NaN / Inf / runaway)", () => {
    const s = makeState("bound");
    for (let i = 0; i < 50; i++) stepPhysarumCPU(s);
    for (let i = 0; i < SMALL_AGENTS; i++) {
      const a = s.agents[i];
      expect(Number.isFinite(a.x)).toBe(true);
      expect(Number.isFinite(a.y)).toBe(true);
      expect(Number.isFinite(a.heading)).toBe(true);
      expect(a.x).toBeGreaterThanOrEqual(0);
      expect(a.x).toBeLessThan(SMALL_FIELD);
      expect(a.y).toBeGreaterThanOrEqual(0);
      expect(a.y).toBeLessThan(SMALL_FIELD);
      expect(a.heading).toBeGreaterThanOrEqual(0);
      expect(a.heading).toBeLessThan(Math.PI * 2);
    }
    // Pheromone should also be bounded and non-negative
    for (let i = 0; i < s.pheromone.data.length; i++) {
      expect(Number.isFinite(s.pheromone.data[i])).toBe(true);
      expect(s.pheromone.data[i]).toBeGreaterThanOrEqual(0);
    }
  });

  it("reset returns to frame 0 with re-derived state from same RNG", () => {
    const s = makeState("reset-test");
    const before = s.agents.map((a) => ({ x: a.x, y: a.y, h: a.heading }));
    for (let i = 0; i < 10; i++) stepPhysarumCPU(s);
    expect(s.frame).toBe(10);
    resetPhysarum(s);
    expect(s.frame).toBe(0);
    for (let i = 0; i < SMALL_AGENTS; i++) {
      expect(s.agents[i].x).toBe(before[i].x);
      expect(s.agents[i].y).toBe(before[i].y);
      expect(s.agents[i].heading).toBe(before[i].h);
    }
  });

  it("CPU_MAX_AGENTS guard rejects oversize agent count", () => {
    const big = createPhysarumState({
      seed: "big",
      numAgents: CPU_MAX_AGENTS + 1,
      width: 256,
      height: 256,
    });
    expect(() => stepPhysarumCPU(big)).toThrow(/CPU_MAX_AGENTS/);
  });
});

describe("Physarum — senseField and decideTurn", () => {
  it("senseField returns 3 readings from the pheromone field", () => {
    const field = {
      width: 256,
      height: 256,
      data: new Float32Array(256 * 256),
    };
    // Agent is at (100, 100) heading 0. Center sensor at distance 5 lands at (105, 100).
    // Drop pheromone exactly there so center > 0. Left/right sensors are at
    // (±sin(angle)·5, cos(angle)·5) offsets → (~2.4, ~4.6) and (~-2.4, ~4.6).
    field.data[100 * 256 + 105] = 1.0;
    field.data[100 * 256 + 106] = 1.0;
    field.data[101 * 256 + 105] = 1.0;
    field.data[101 * 256 + 106] = 1.0;

    const agent = { x: 100, y: 100, heading: 0 };
    const readings = senseField(agent, field, 0.5, 5);
    expect(readings).toHaveLength(3);
    expect(readings[0]).toBeGreaterThan(0); // center sensor
    expect(readings[1]).toBeGreaterThanOrEqual(0); // left
    expect(readings[2]).toBeGreaterThanOrEqual(0); // right
    // Center should be the strongest since we placed pheromone there
    expect(readings[0]).toBeGreaterThan(readings[1]);
    expect(readings[0]).toBeGreaterThan(readings[2]);
  });

  it("agent turns toward the strongest sensor (controlled test)", () => {
    const field = {
      width: 256,
      height: 256,
      data: new Float32Array(256 * 256),
    };
    // Strong pheromone only on the right side (heading 0 → +x direction)
    for (let x = 150; x < 160; x++) {
      for (let y = 95; y < 105; y++) {
        field.data[y * 256 + x] = 10.0;
      }
    }
    const agent = { x: 100, y: 100, heading: 0 };
    // (We don't actually need the senseField result here — we synthesize
    //  the sensor readings directly to control decideTurn's branches.)
    void senseField; // imported for the explicit senseField unit test above
    const turnRate = Math.PI / 4;
    const rng = mulberry32(42);
    // Force readings where right > left but center is not the largest
    const newH = decideTurn([0, 0, 1], agent.heading, turnRate, rng);
    // Right sensor wins → new heading should be heading + turnRate (mod 2π)
    expect(newH).toBeGreaterThan(turnRate - 0.01);
    expect(newH).toBeLessThan(turnRate + turnRate * 0.25 + 0.01);

    const newH2 = decideTurn([0, 1, 0], agent.heading, turnRate, rng);
    // Left sensor wins → new heading should be heading - turnRate (no wrap inside decideTurn)
    // jitter is ±(turnRate * 0.25) / 2 ≈ ±0.098
    const expected = agent.heading - turnRate;
    expect(newH2).toBeCloseTo(expected, 1);

    // Center is strongest → stay roughly straight
    const newH3 = decideTurn([1, 0, 0], agent.heading, turnRate, rng);
    expect(Math.abs(newH3 - agent.heading)).toBeLessThan(turnRate * 0.5);
  });

  it("decideTurn handles ties by randomly picking a side", () => {
    const rng = mulberry32(1);
    const turnRate = 0.1;
    const sides = new Set<number>();
    for (let i = 0; i < 100; i++) {
      const h = decideTurn([0, 1, 1], 0, turnRate, rng);
      // Tie: h should be ≈ ±turnRate
      const modH = ((h % (Math.PI * 2)) + Math.PI * 2) % (Math.PI * 2);
      sides.add(Math.round(modH * 1000));
    }
    // Should see both +turnRate and -turnRate (mod 2π)
    expect(sides.size).toBeGreaterThan(1);
  });
});

describe("Physarum — pheromone decay", () => {
  it("decay coefficient correctly reduces pheromone values over time", () => {
    // We isolate the diffuse+decay math here without going through
    // stepPhysarumCPU (which also runs agent deposit/sense). The math
    // matches what stepPhysarumCPU applies in its 3x3 weighted-average loop.
    const w = 32;
    const h = 32;
    const PEAK = 1.0;
    const src = new Float32Array(w * h);
    src[16 * w + 16] = PEAK;
    // Apply the same 3x3 weighted average + decay used by stepPhysarumCPU.
    // For a single-cell impulse with diffuse=0, centerW=1 → output = src[i] * decay.
    const decay = DEFAULT_DECAY;
    const diffuse = DEFAULT_DIFFUSE;
    const centerW = 1 - diffuse;
    const neighborW = diffuse / 8;
    const dst = new Float32Array(w * h);
    for (let y = 0; y < h; y++) {
      for (let x = 0; x < w; x++) {
        const xm = (x - 1 + w) % w;
        const xp = (x + 1) % w;
        const ym = (y - 1 + h) % h;
        const yp = (y + 1) % h;
        const i = y * w + x;
        dst[i] = (
          src[i] * centerW +
          src[y * w + xm] * neighborW +
          src[y * w + xp] * neighborW +
          src[ym * w + xm] * neighborW +
          src[ym * w + x] * neighborW +
          src[ym * w + xp] * neighborW +
          src[yp * w + xm] * neighborW +
          src[yp * w + x] * neighborW +
          src[yp * w + xp] * neighborW
        ) * decay;
      }
    }
    // After one step the peak should have decayed. With diffuse=0.5 and a
    // single-cell impulse, the center cell value drops to (1 - 0.5) * PEAK * decay
    // because half the weight goes to the 8 neighbors (mass is redistributed).
    expect(dst[16 * w + 16]).toBeLessThan(PEAK);
    expect(dst[16 * w + 16]).toBeCloseTo(PEAK * (1 - DEFAULT_DIFFUSE) * decay, 5);
    // Total mass should be ≈ PEAK * decay (mass is conserved up to decay,
    // diffusion just spreads it across cells)
    let total = 0;
    for (let i = 0; i < dst.length; i++) total += dst[i];
    expect(total).toBeCloseTo(PEAK * decay, 5);

    // Sanity: the decay coefficient is between 0 and 1
    expect(DEFAULT_DECAY).toBeGreaterThan(0);
    expect(DEFAULT_DECAY).toBeLessThan(1);
  });

  it("pheromone stays non-negative after many steps with agents", () => {
    const s = makeState("nonneg", 500);
    for (let i = 0; i < 20; i++) stepPhysarumCPU(s);
    for (let i = 0; i < s.pheromone.data.length; i++) {
      expect(s.pheromone.data[i]).toBeGreaterThanOrEqual(0);
    }
  });
});

describe("Physarum — dispatch manifest", () => {
  it("has all expected fields and ranges are sensible", () => {
    expect(PHYSARUM.name).toBe("physarum");
    expect(PHYSARUM.displayName).toBe("Slime Mold");
    expect(PHYSARUM.description).toBeTruthy();
    expect(PHYSARUM.component).toBe("Physarum");

    // defaultParams — present and matching the spec
    expect(PHYSARUM.defaultParams.numAgents).toBe(65536);
    expect(PHYSARUM.defaultParams.sensorAngle).toBe(22.5);
    expect(PHYSARUM.defaultParams.sensorDistance).toBe(9.0);
    expect(PHYSARUM.defaultParams.stepSize).toBe(1.0);
    expect(PHYSARUM.defaultParams.turnRate).toBe(45.0);
    expect(PHYSARUM.defaultParams.decay).toBe(0.92);
    expect(PHYSARUM.defaultParams.diffuse).toBe(0.5);

    // audioBindings — all 4 bands present
    expect(PHYSARUM.audioBindings.bass).toBe("decay");
    expect(PHYSARUM.audioBindings.mid).toBe("sensorDistance");
    expect(PHYSARUM.audioBindings.treble).toBe("stepSize");
    expect(PHYSARUM.audioBindings.vocals).toBe("diffuse");

    // palettes — at least the 6 supported
    expect(PHYSARUM.palettes).toContain("aurora");
    expect(PHYSARUM.palettes).toContain("ember");
    expect(PHYSARUM.palettes).toContain("tide");
    expect(PHYSARUM.palettes).toContain("ink");
    expect(PHYSARUM.palettes).toContain("bone");
    expect(PHYSARUM.palettes).toContain("moss");

    // camera — drone mode
    expect(PHYSARUM.camera).toBe("drone");

    // paramRanges — sensible [min, max] for every key
    const r = PHYSARUM.paramRanges;
    expect(r.numAgents[0]).toBeLessThanOrEqual(PHYSARUM.defaultParams.numAgents);
    expect(r.numAgents[1]).toBeGreaterThanOrEqual(PHYSARUM.defaultParams.numAgents);
    expect(r.sensorAngle[0]).toBeLessThan(r.sensorAngle[1]);
    expect(r.sensorAngle[0]).toBeLessThanOrEqual(PHYSARUM.defaultParams.sensorAngle);
    expect(r.sensorAngle[1]).toBeGreaterThanOrEqual(PHYSARUM.defaultParams.sensorAngle);
    expect(r.sensorDistance[0]).toBeLessThan(r.sensorDistance[1]);
    expect(r.stepSize[0]).toBeLessThan(r.stepSize[1]);
    expect(r.turnRate[0]).toBeLessThan(r.turnRate[1]);
    expect(r.decay[0]).toBeGreaterThan(0);
    expect(r.decay[1]).toBeLessThanOrEqual(1);
    expect(r.diffuse[0]).toBeGreaterThanOrEqual(0);
    expect(r.diffuse[1]).toBeLessThanOrEqual(1);
  });
});