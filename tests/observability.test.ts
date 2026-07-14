// @vitest-environment jsdom
import { describe, it, expect, beforeEach } from "vitest";
import { act } from "@testing-library/react";
import { useEngineStore } from "@/lib/engine/store";

describe("engine observability", () => {
  beforeEach(() => {
    act(() => {
      useEngineStore.setState({
        fps: 0,
        frameTimeMs: 0,
        particlesRendered: 0,
        drawCalls: 0,
      });
    });
  });

  it("initial state is zeroed", () => {
    const state = useEngineStore.getState();
    expect(state.fps).toBe(0);
    expect(state.frameTimeMs).toBe(0);
  });

  it("setObservability updates fps and frame time", () => {
    act(() => {
      useEngineStore.getState().setObservability({ fps: 60, frameTimeMs: 16.7 });
    });
    const state = useEngineStore.getState();
    expect(state.fps).toBe(60);
    expect(state.frameTimeMs).toBeCloseTo(16.7, 1);
  });

  it("setObservability keeps previous particle count when omitted", () => {
    act(() => {
      useEngineStore.getState().setObservability({
        fps: 60,
        frameTimeMs: 16,
        particlesRendered: 250000,
      });
    });
    act(() => {
      useEngineStore.getState().setObservability({ fps: 30, frameTimeMs: 33 });
    });
    expect(useEngineStore.getState().particlesRendered).toBe(250000);
  });

  it("setObservability overwrites particles when provided", () => {
    act(() => {
      useEngineStore.getState().setObservability({
        fps: 60,
        frameTimeMs: 16,
        particlesRendered: 250000,
      });
    });
    act(() => {
      useEngineStore.getState().setObservability({
        fps: 60,
        frameTimeMs: 16,
        particlesRendered: 100000,
      });
    });
    expect(useEngineStore.getState().particlesRendered).toBe(100000);
  });
});