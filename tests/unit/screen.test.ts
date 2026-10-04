import { describe, expect, it } from "vitest";
import {
  FRAME_RATE_MIN_SAMPLES,
  createFrameRateMeter,
  formatPatternMeta,
  gammaPatchValue,
  isBandingKind,
  optionModeFor,
} from "@/utils/phones/tools/screen";

describe("createFrameRateMeter", () => {
  it("reports nothing until enough frames, then the median rate", () => {
    const meter = createFrameRateMeter();
    let t = 1000;
    const results: (number | null)[] = [];
    for (let i = 0; i <= FRAME_RATE_MIN_SAMPLES; i += 1) {
      results.push(meter.tick(t));
      t += 1000 / 120;
    }
    expect(results.slice(0, -1).every((value) => value === null)).toBe(true);
    expect(results.at(-1)).toBe(120);
  });

  it("ignores occasional long frames", () => {
    const meter = createFrameRateMeter(5, 20);
    let t = 1;
    let last: number | null = null;
    for (let i = 0; i < 12; i += 1) {
      t += i % 4 === 3 ? 50 : 1000 / 60;
      last = meter.tick(t);
    }
    expect(last).toBe(60);
  });

  it("starts over after reset", () => {
    const meter = createFrameRateMeter(2, 10);
    meter.tick(10);
    meter.tick(20);
    expect(meter.tick(30)).toBe(100);
    meter.reset();
    expect(meter.tick(40)).toBeNull();
  });
});

describe("helpers", () => {
  it("computes the 50% grey for a display gamma", () => {
    expect(gammaPatchValue(2.2)).toBe(186);
    expect(gammaPatchValue(1)).toBe(128);
  });

  it("picks the option button for a pattern", () => {
    const angleable = new Set(["gradient"]);
    expect(optionModeFor("gradient", angleable)).toBe("angle");
    expect(optionModeFor("steps-32", angleable)).toBe("banding");
    expect(optionModeFor("solid", angleable)).toBe("none");
    expect(isBandingKind("steps-64")).toBe(true);
  });

  it("upper-cases hex labels only", () => {
    expect(formatPatternMeta("#ff00aa")).toBe("#FF00AA");
    expect(formatPatternMeta("1 px lines")).toBe("1 px lines");
  });
});
