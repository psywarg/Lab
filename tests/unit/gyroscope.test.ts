import { describe, expect, it } from "vitest";
import {
  SENSOR_FRESHNESS_MS,
  appendHeading,
  applyDriftRateDeadband,
  applyQuietRateDeadband,
  correctedRate,
  driftStateLabel,
  formatAngle,
  formatSignedRate,
  headingDriftRange,
  headingStateLabel,
  isRecent,
  restingNoiseLabel,
  smoothCorrectedRate,
  wrapDegrees,
} from "@/utils/phones/tools/gyroscope";
import { startButtonView } from "@/utils/phones/tools/sensorSession";

describe("angles", () => {
  it("wraps into -180..180", () => {
    expect(wrapDegrees(190)).toBe(-170);
    expect(wrapDegrees(-190)).toBe(170);
    expect(wrapDegrees(0)).toBe(0);
  });

  it("tracks heading drift across the ±180 seam without a 360° jump", () => {
    const wrapped: number[] = [];
    const unwrapped: number[] = [];
    for (const heading of [178, 179, -180, -179, -178]) appendHeading(wrapped, unwrapped, heading);
    expect(unwrapped).toEqual([178, 179, 180, 181, 182]);
    expect(headingDriftRange(unwrapped)).toBe(4);
    expect(headingDriftRange([])).toBe(0);
  });

  it("keeps the history to its limit", () => {
    const wrapped: number[] = [];
    const unwrapped: number[] = [];
    for (let i = 0; i < 10; i += 1) appendHeading(wrapped, unwrapped, i, 4);
    expect(wrapped).toEqual([6, 7, 8, 9]);
    expect(unwrapped).toEqual([6, 7, 8, 9]);
  });
});

describe("rates", () => {
  it("subtracts a captured offset and hides residuals under 0.9 deg/s", () => {
    expect(correctedRate(5, 2, true)).toBe(3);
    expect(correctedRate(5, 2, false)).toBe(5);
    expect(correctedRate(2.5, 2, true)).toBe(0);
  });

  it("eases towards the new rate and snaps small values to zero", () => {
    expect(smoothCorrectedRate(0, 10)).toBeCloseTo(2.6, 6);
    expect(smoothCorrectedRate(1, 0)).toBe(0);
    expect(smoothCorrectedRate(10, 0)).toBeCloseTo(7.4, 6);
  });

  it("applies the animation deadbands", () => {
    expect(applyDriftRateDeadband(2.3)).toBe(0);
    expect(applyDriftRateDeadband(-2.5)).toBe(-2.5);
    expect(applyQuietRateDeadband(3.4)).toBe(0);
    expect(applyQuietRateDeadband(3.4, 1)).toBe(3.4);
  });

  it("treats readings older than the freshness window as stale", () => {
    expect(isRecent(1000, 1000 + SENSOR_FRESHNESS_MS - 1)).toBe(true);
    expect(isRecent(1000, 1000 + SENSOR_FRESHNESS_MS)).toBe(false);
    expect(isRecent(0, 10)).toBe(false);
  });
});

describe("labels", () => {
  it("formats values", () => {
    expect(formatAngle(1.26)).toBe("1.3°");
    expect(formatSignedRate(4.6)).toBe("+5 deg/s");
    expect(formatSignedRate(-4.6)).toBe("-5 deg/s");
  });

  it("names drift, noise and heading states", () => {
    expect(["waiting", "calm", "minor", "high"].map((s) => driftStateLabel(s as never))).toEqual([
      "Waiting for rate",
      "Calm",
      "Minor drift",
      "High drift",
    ]);
    expect(restingNoiseLabel("calm", 1.4)).toBe("Steady");
    expect(restingNoiseLabel("calm", 1.5)).toBe("Moving or noisy");
    expect(headingStateLabel(false, 0)).toBe("Unavailable");
    expect([1, 5, 9].map((range) => headingStateLabel(true, range))).toEqual(["Stable", "Minor drift", "Large drift"]);
  });
});

describe("startButtonView (accelerometer and gyroscope)", () => {
  it("labels each run state", () => {
    expect(startButtonView({ started: false, paused: false, inFlight: false })).toEqual({ running: false, disabled: false, label: "Start" });
    expect(startButtonView({ started: false, paused: false, inFlight: true })).toEqual({ running: false, disabled: true, label: "Starting..." });
    expect(startButtonView({ started: true, paused: false, inFlight: false })).toEqual({ running: true, disabled: false, label: "Pause" });
    expect(startButtonView({ started: true, paused: true, inFlight: false })).toEqual({ running: false, disabled: false, label: "Resume" });
  });
});
