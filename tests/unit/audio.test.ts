import { describe, expect, it } from "vitest";
import {
  SILENCE_DBFS,
  amplitudeToDbfs,
  averageBandLevel,
  computePeakAmplitude,
  computeRmsDbfs,
  createLogBands,
  detectClipping,
  formatVolumeLabel,
  percentile,
  VOLUME_MIN_DB,
  volumeDbToGain,
} from "@/utils/phones/tools/audio";

describe("amplitudeToDbfs", () => {
  it("maps full scale to 0 dBFS and half scale to about -6 dBFS", () => {
    expect(amplitudeToDbfs(1)).toBeCloseTo(0, 6);
    expect(amplitudeToDbfs(0.5)).toBeCloseTo(-6.0206, 3);
  });

  it("clamps silence to the floor", () => {
    expect(amplitudeToDbfs(0)).toBe(SILENCE_DBFS);
    expect(amplitudeToDbfs(1e-9)).toBe(SILENCE_DBFS);
  });
});

describe("computeRmsDbfs", () => {
  it("returns about -3 dBFS for a full-scale sine", () => {
    const sine = Float32Array.from({ length: 4800 }, (_, i) =>
      Math.sin((2 * Math.PI * i) / 48),
    );
    expect(computeRmsDbfs(sine)).toBeCloseTo(-3.0103, 2);
  });
});

describe("computePeakAmplitude", () => {
  it("returns the largest absolute sample", () => {
    expect(computePeakAmplitude(Float32Array.from([0.1, -0.8, 0.5]))).toBeCloseTo(0.8, 6);
  });
});

describe("detectClipping", () => {
  it("needs a run of samples at or above the threshold", () => {
    expect(detectClipping(Float32Array.from([0.995, 0.2, 0.995, 0.1]))).toBe(false);
    expect(detectClipping(Float32Array.from([0.2, 0.995, -0.999, 1, 0.1]))).toBe(true);
  });
});

describe("percentile", () => {
  it("picks the nearest-rank value and handles empty input", () => {
    expect(percentile([5, 1, 3, 2, 4], 0.5)).toBe(3);
    expect(percentile([5, 1, 3, 2, 4], 0)).toBe(1);
    expect(percentile([5, 1, 3, 2, 4], 1)).toBe(5);
    expect(percentile([], 0.5)).toBe(SILENCE_DBFS);
  });
});

describe("createLogBands", () => {
  it("returns contiguous, non-empty bands within the bin range", () => {
    const bands = createLogBands(6, 60, 16000, 48000, 2048);
    expect(bands).toHaveLength(6);
    for (const band of bands) {
      expect(band.endBin).toBeGreaterThan(band.startBin);
      expect(band.startBin).toBeGreaterThanOrEqual(0);
      expect(band.endBin).toBeLessThanOrEqual(2048);
    }
  });
});

describe("averageBandLevel", () => {
  it("normalises the average byte level of a band to 0..1", () => {
    const data = Uint8Array.from([255, 255, 0, 0]);
    expect(averageBandLevel(data, { startBin: 0, endBin: 2 })).toBe(1);
    expect(averageBandLevel(data, { startBin: 0, endBin: 4 })).toBe(0.5);
  });
});

describe("volume in dB", () => {
  it("maps dB to amplitude, with the bottom of the range silent", () => {
    expect(volumeDbToGain(0)).toBe(1);
    expect(volumeDbToGain(-6)).toBeCloseTo(0.501, 3);
    expect(volumeDbToGain(-12)).toBeCloseTo(0.251, 3);
    expect(volumeDbToGain(VOLUME_MIN_DB)).toBe(0);
    expect(volumeDbToGain(Number.NaN)).toBe(0);
    expect(volumeDbToGain(6)).toBe(1);
  });

  it("labels the level in dB and amplitude percent", () => {
    expect(formatVolumeLabel(-12)).toBe("-12 dB · 25%");
    expect(formatVolumeLabel(0)).toBe("0 dB · 100%");
    expect(formatVolumeLabel(-50)).toBe("-50 dB · <1%");
    expect(formatVolumeLabel(VOLUME_MIN_DB)).toBe("Off");
  });
});
