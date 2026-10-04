import { describe, expect, it } from "vitest";
import { createXorshift32 } from "@/utils/phones/tools/stuckPixel";
import { channelGain, fillNoise, formatClock, hearingSteps, panForChannel } from "@/utils/phones/tools/speaker";

/** Seeded uniform source in [0, 1). */
function seeded(seed: number): () => number {
  const next = createXorshift32(seed);
  return () => next() / 2 ** 32;
}

/** Share of energy in sample-to-sample differences: a rough high-frequency measure. */
function highFrequencyShare(data: Float32Array): number {
  let energy = 0;
  let diffEnergy = 0;
  for (let i = 1; i < data.length; i += 1) {
    const value = data[i] ?? 0;
    energy += value * value;
    diffEnergy += (value - (data[i - 1] ?? 0)) ** 2;
  }
  return diffEnergy / energy;
}

function noise(type: "white" | "pink" | "brown"): Float32Array {
  const data = new Float32Array(48000);
  fillNoise(data, type, seeded(42));
  return data;
}

describe("fillNoise", () => {
  it("stays within full scale", () => {
    for (const type of ["white", "pink", "brown"] as const) {
      const peak = noise(type).reduce((max, value) => Math.max(max, Math.abs(value)), 0);
      expect(peak, type).toBeGreaterThan(0.05);
      expect(peak, type).toBeLessThanOrEqual(1);
    }
  });

  it("puts less energy in the highs for pink, and less again for brown", () => {
    const white = highFrequencyShare(noise("white"));
    const pink = highFrequencyShare(noise("pink"));
    const brown = highFrequencyShare(noise("brown"));
    expect(white).toBeCloseTo(2, 0);
    expect(pink).toBeLessThan(white * 0.75);
    expect(brown).toBeLessThan(pink * 0.25);
  });
});

describe("routing", () => {
  it("pans fixed channels and leaves the rest centred", () => {
    expect([panForChannel("left"), panForChannel("right"), panForChannel("mono")]).toEqual([-1, 1, 0]);
  });

  it("adds 3 dB only for mono through the panner", () => {
    expect(channelGain(0.25, "mono", true)).toBeCloseTo(0.25 * Math.SQRT2, 9);
    expect(channelGain(0.25, "mono", false)).toBe(0.25);
    expect(channelGain(0.25, "left", true)).toBe(0.25);
  });
});

describe("hearing steps and clock", () => {
  it("spans 20 Hz to 20 kHz in 20 rising log steps", () => {
    const steps = hearingSteps();
    expect(steps).toHaveLength(20);
    expect([steps[0], steps.at(-1)]).toEqual([20, 20000]);
    expect(steps.every((value, i) => i === 0 || value > (steps[i - 1] ?? 0))).toBe(true);
  });

  it("formats m:ss rounding up", () => {
    expect(formatClock(45000)).toBe("0:45");
    expect(formatClock(44001)).toBe("0:45");
    expect(formatClock(-1)).toBe("0:00");
    expect(formatClock(61000)).toBe("1:01");
  });
});
