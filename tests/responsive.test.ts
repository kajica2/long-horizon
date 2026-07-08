import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import {
  deviceTierForWidth,
  scaleForTier,
  tickRateForTier,
  floorCount,
  scaledFlowFieldCount,
  scaledDejongCount,
  scaledFilamentCount,
  scaledSandCount,
  prefersReducedMotion,
  isWebKit,
  DEFAULT_PARTICLE_COUNTS,
} from "@/lib/engine/responsive";

describe("responsive — device tier", () => {
  it("classifies widths correctly", () => {
    expect(deviceTierForWidth(375)).toBe("mobile");
    expect(deviceTierForWidth(639)).toBe("mobile");
    expect(deviceTierForWidth(640)).toBe("tablet");
    expect(deviceTierForWidth(1023)).toBe("tablet");
    expect(deviceTierForWidth(1024)).toBe("desktop");
    expect(deviceTierForWidth(1920)).toBe("desktop");
  });

  it("returns expected scale factors", () => {
    expect(scaleForTier("mobile")).toBe(0.3);
    expect(scaleForTier("tablet")).toBe(0.7);
    expect(scaleForTier("desktop")).toBe(1.0);
  });

  it("tick rates are 30/45/60", () => {
    expect(tickRateForTier("mobile")).toBe(30);
    expect(tickRateForTier("tablet")).toBe(45);
    expect(tickRateForTier("desktop")).toBe(60);
  });
});

describe("responsive — count scaling", () => {
  it("scales flow-field count with tier", () => {
    expect(scaledFlowFieldCount("mobile")).toBe(
      Math.floor(DEFAULT_PARTICLE_COUNTS.flowField * 0.3),
    );
    expect(scaledFlowFieldCount("desktop")).toBe(DEFAULT_PARTICLE_COUNTS.flowField);
  });

  it("scales deJong traveler count with tier", () => {
    expect(scaledDejongCount("mobile")).toBe(
      Math.floor(DEFAULT_PARTICLE_COUNTS.dejongTravelers * 0.3),
    );
    expect(scaledDejongCount("desktop")).toBe(DEFAULT_PARTICLE_COUNTS.dejongTravelers);
  });

  it("scales filament count with tier", () => {
    expect(scaledFilamentCount("mobile")).toBe(
      Math.floor(DEFAULT_PARTICLE_COUNTS.filamentCount * 0.3),
    );
    expect(scaledFilamentCount("desktop")).toBe(DEFAULT_PARTICLE_COUNTS.filamentCount);
  });

  it("scales sand traveler count with tier", () => {
    expect(scaledSandCount("mobile")).toBe(
      Math.floor(DEFAULT_PARTICLE_COUNTS.sandTravelers * 0.3),
    );
  });

  it("enforces minimum sensible counts", () => {
    // Even with absurd base count of 10, mobile scale yields at least the floor
    expect(floorCount(10, "particles")).toBeGreaterThanOrEqual(256);
    expect(floorCount(10, "filaments")).toBeGreaterThanOrEqual(8);
    expect(floorCount(10, "travelers")).toBeGreaterThanOrEqual(32);
  });

  it("keeps counts integer", () => {
    const c = scaledFlowFieldCount("tablet");
    expect(Number.isInteger(c)).toBe(true);
  });
});

describe("responsive — accessibility & browser detection", () => {
  beforeEach(() => {
    vi.stubGlobal("window", undefined);
  });
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("prefersReducedMotion() is safe when window is undefined (SSR)", () => {
    expect(prefersReducedMotion()).toBe(false);
  });

  it("isWebKit() is safe when navigator is undefined (SSR)", () => {
    expect(isWebKit()).toBe(false);
  });

  it("detects WebKit UA", () => {
    vi.stubGlobal("navigator", { userAgent: "Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Mobile/15E148 Safari/604.1" });
    expect(isWebKit()).toBe(true);
  });

  it("does not flag Chrome as WebKit", () => {
    vi.stubGlobal("navigator", { userAgent: "Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36" });
    expect(isWebKit()).toBe(false);
  });
});
