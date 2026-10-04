import { describe, expect, it } from "vitest";
import {
  STANDARD_GRAVITY as G,
  createAccelEstimate,
  gravityOffsetState,
  isShakeEvent,
  isStillSample,
  motionDeltaState,
  noiseState,
  peakDeltaState,
  stepAccel,
  stillnessEvidence,
  type AccelInput,
} from "@/utils/phones/tools/accelerometer";

const raw = (x: number, y: number, z: number): AccelInput => ({ gx: x, gy: y, gz: z, lx: null, ly: null, lz: null });

function run(inputs: AccelInput[]) {
  let estimate = createAccelEstimate();
  return inputs.map((input) => {
    const step = stepAccel(estimate, input);
    estimate = step.estimate;
    return step;
  });
}

describe("stepAccel", () => {
  it("reads 1 g at rest and settles with no motion", () => {
    const steps = run(Array.from({ length: 30 }, () => raw(0, 0, G)));
    const last = steps.at(-1);
    expect(last?.totalG).toBeCloseTo(1, 6);
    expect(last?.delta).toBeCloseTo(0, 6);
    expect(last?.shakeSignal).toBeCloseTo(0, 6);
  });

  it("reports a faulty 1.30 g reading as 1.30 g", () => {
    const last = run(Array.from({ length: 10 }, () => raw(0, 0, 1.3 * G))).at(-1);
    expect(last?.totalG).toBeCloseTo(1.3, 6);
  });

  it("uses the linear sensor for lift and shake when it reports", () => {
    const [step] = run([{ gx: 0, gy: 0, gz: G, lx: 0.5 * G, ly: 0, lz: -0.2 * G }]);
    expect(step?.shakeSignal).toBeCloseTo(0.5, 6);
    expect(step?.liftSignal).toBeCloseTo(-0.2, 6);
  });

  it("derives linear motion from the gravity estimate otherwise", () => {
    const steps = run([...Array.from({ length: 20 }, () => raw(0, 0, G)), raw(0.6 * G, 0, G)]);
    const spike = steps.at(-1);
    // The low-pass estimate moves 8% towards the spike, so 92% remains.
    expect(spike?.shakeSignal).toBeCloseTo(0.6 * 0.92, 6);
    expect(spike?.delta).toBeCloseTo(0.6, 6);
  });

  it("keeps the last value for a missing axis and gives no total without all three", () => {
    const steps = run([raw(1, 2, 3), { gx: null, gy: 5, gz: 6, lx: null, ly: null, lz: null }]);
    expect(steps[1]?.estimate.latest).toEqual({ x: 1, y: 5, z: 6 });
    expect(steps[1]?.totalG).toBeNull();
  });
});

describe("events", () => {
  it("counts a shake at most every 500 ms", () => {
    const base = { totalG: 1, delta: 0.9, shakeSignal: 0, sampleCount: 5 };
    expect(isShakeEvent({ ...base, msSinceLastShake: 600 })).toBe(true);
    expect(isShakeEvent({ ...base, msSinceLastShake: 400 })).toBe(false);
    expect(isShakeEvent({ ...base, delta: 0.1, msSinceLastShake: 600 })).toBe(false);
    expect(isShakeEvent({ ...base, delta: 0.1, totalG: 1.7, msSinceLastShake: 600 })).toBe(true);
  });

  it("treats small changes as still", () => {
    expect(isStillSample(1, 0.05)).toBe(true);
    expect(isStillSample(1, 0.1)).toBe(false);
    expect(isStillSample(null, 0)).toBe(false);
  });
});

describe("verdicts", () => {
  it("grades the gravity offset and noise from the still window", () => {
    expect(gravityOffsetState(stillnessEvidence([1, 1, 1]))).toBe("Collecting flat samples");
    const high = stillnessEvidence(Array.from({ length: 10 }, () => 1.3));
    expect(gravityOffsetState(high)).toBe("High offset");
    expect(noiseState(high)).toBe("Quiet");
    const good = stillnessEvidence(Array.from({ length: 10 }, (_, i) => 1 + (i % 2 ? 0.02 : -0.02)));
    expect(gravityOffsetState(good)).toBe("On target");
    expect(noiseState(good)).toBe("Normal");
  });

  it("labels motion and peaks", () => {
    expect([0.1, 0.5, 2, 4].map(motionDeltaState)).toEqual(["Stable", "Moving", "Strong motion", "Sharp spike"]);
    expect([0.1, 0.5, 2, 4].map(peakDeltaState)).toEqual(["No spike yet", "Light motion", "Clear spike", "Heavy spike"]);
  });
});
