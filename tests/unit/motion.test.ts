import { describe, expect, it } from "vitest";
import {
  BIAS_CAPTURE,
  deviationRms,
  driftState,
  evaluateBiasCapture,
  mean,
  restingStats,
  rootMeanSquare,
  standardDeviation,
} from "@/utils/phones/tools/motion";

/** Deterministic pseudo-noise in [-amplitude, amplitude]. */
function stream(count: number, offset: number, amplitude: number, seed: number): number[] {
  return Array.from({ length: count }, (_, i) => offset + amplitude * Math.sin(seed + i * 1.7));
}

describe("basic statistics", () => {
  it("computes mean, sample SD, RMS and deviation RMS", () => {
    expect(mean([1, 2, 3, 4])).toBe(2.5);
    expect(standardDeviation([2, 4, 4, 4, 5, 5, 7, 9])).toBeCloseTo(2.138, 3);
    expect(rootMeanSquare([3, 4])).toBeCloseTo(Math.sqrt(12.5), 6);
    expect(deviationRms([1, 3], 2)).toBe(1);
    expect(mean([])).toBe(0);
  });
});

describe("restingStats", () => {
  it("reports the raw bias without hiding small offsets", () => {
    // 4 deg/s overall bias split evenly across axes, with ±0.1 deg/s noise.
    const perAxis = 4 / Math.sqrt(3);
    const stats = restingStats(
      stream(60, perAxis, 0.1, 1),
      stream(60, perAxis, 0.1, 2),
      stream(60, perAxis, 0.1, 3),
    );
    expect(stats?.biasMagnitude).toBeCloseTo(4, 1);
    expect(stats?.noiseRms).toBeLessThan(0.2);
    expect(driftState(stats?.biasMagnitude ?? 0)).toBe("minor");
  });

  it("returns null without samples", () => {
    expect(restingStats([], [], [])).toBeNull();
  });
});

describe("driftState", () => {
  it("keeps the original bands on raw values", () => {
    expect(driftState(0.5)).toBe("calm");
    expect(driftState(2.4)).toBe("minor");
    expect(driftState(5.5)).toBe("high");
  });
});

describe("evaluateBiasCapture", () => {
  it("accepts a large steady offset and flags it as high", () => {
    const result = evaluateBiasCapture(stream(40, 6, 0.05, 1), stream(40, 4, 0.05, 2), stream(40, 0, 0.05, 3));
    expect(result.ok).toBe(true);
    expect(result.ok && result.highOffset).toBe(true);
  });

  it("rejects only when the phone moved or there is too little data", () => {
    expect(evaluateBiasCapture([1], [1], [1])).toMatchObject({ ok: false, reason: "too-few-samples" });
    const moving = evaluateBiasCapture(
      stream(40, 0, BIAS_CAPTURE.noiseLimit * 2, 1),
      stream(40, 0, BIAS_CAPTURE.noiseLimit * 2, 2),
      stream(40, 0, 0, 3),
    );
    expect(moving).toMatchObject({ ok: false, reason: "moved" });
  });
});
