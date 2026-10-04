import { describe, expect, it } from "vitest";
import {
  createMeterAccumulator,
  formatClipEvents,
  formatDbfs,
  formatSeconds,
  isNewClipEvent,
  levelEstimates,
  mergeMeterReports,
  nextPeakHold,
  pickRecorderMimeType,
  snrDb,
  micConstraints,
  micDeviceOptions,
} from "@/utils/phones/tools/mic";

describe("micConstraints", () => {
  it("turns browser voice processing off unless call processing is on", () => {
    expect(micConstraints("", false)).toEqual({
      audio: { echoCancellation: false, noiseSuppression: false, autoGainControl: false },
    });
    expect(micConstraints("abc", true)).toEqual({
      audio: {
        deviceId: { exact: "abc" },
        echoCancellation: true,
        noiseSuppression: true,
        autoGainControl: true,
      },
    });
  });
});

describe("micDeviceOptions", () => {
  it("lists real inputs after the system default and skips aliases", () => {
    const options = micDeviceOptions([
      { deviceId: "default", kind: "audioinput", label: "Default - USB" },
      { deviceId: "communications", kind: "audioinput", label: "Comms" },
      { deviceId: "a", kind: "audioinput", label: "Built-in" },
      { deviceId: "b", kind: "audioinput", label: "" },
      { deviceId: "c", kind: "audiooutput", label: "Speaker" },
    ]);
    expect(options).toEqual([
      { value: "", label: "System default" },
      { value: "a", label: "Built-in" },
      { value: "b", label: "Microphone 2" },
    ]);
  });
});

describe("createMeterAccumulator", () => {
  it("reports peak and RMS over every sample", () => {
    const meter = createMeterAccumulator(256);
    const block = new Float32Array(128).fill(0.5);
    block[7] = -0.9;
    expect(meter.add([block])).toBeNull();
    const report = meter.add([new Float32Array(128).fill(0.5)]);
    expect(report?.peak).toBeCloseTo(0.9, 6);
    expect(report?.samples).toBe(256);
    expect(report?.rms).toBeCloseTo(Math.sqrt((255 * 0.25 + 0.81) / 256), 6);
    expect(report?.clipped).toBe(false);
  });

  it("detects a 3-sample clip that spans two blocks", () => {
    const meter = createMeterAccumulator(256);
    const first = new Float32Array(128);
    first[126] = 1;
    first[127] = -1;
    const second = new Float32Array(128);
    second[0] = 1;
    meter.add([first]);
    expect(meter.add([second])?.clipped).toBe(true);
  });

  it("ignores single full-scale samples", () => {
    const meter = createMeterAccumulator(128);
    const block = new Float32Array(128);
    block[10] = 1;
    block[20] = 1;
    expect(meter.add([block])?.clipped).toBe(false);
  });

  it("uses the loudest channel of each sample frame", () => {
    const meter = createMeterAccumulator(128);
    const left = new Float32Array(128).fill(0.1);
    const right = new Float32Array(128).fill(0.4);
    expect(meter.add([left, right])?.peak).toBeCloseTo(0.4, 6);
  });
});

describe("mergeMeterReports", () => {
  it("keeps the highest peak and weights RMS by samples", () => {
    const merged = mergeMeterReports([
      { peak: 0.2, rms: 0.1, clipped: false, samples: 100 },
      { peak: 0.6, rms: 0.3, clipped: true, samples: 300 },
    ]);
    expect(merged?.peak).toBe(0.6);
    expect(merged?.clipped).toBe(true);
    expect(merged?.rms).toBeCloseTo(Math.sqrt((0.01 * 100 + 0.09 * 300) / 400), 6);
    expect(mergeMeterReports([])).toBeNull();
  });
});

describe("level statistics", () => {
  it("waits for 30 readings, then takes the 10th and 95th percentiles", () => {
    expect(levelEstimates(Array.from({ length: 29 }, () => -50))).toBeNull();
    const window = Array.from({ length: 100 }, (_, i) => -90 + i * 0.5);
    const estimates = levelEstimates(window);
    expect(estimates?.noiseFloorDb).toBeCloseTo(-85, 6);
    expect(estimates?.speechDb).toBeCloseTo(-43, 6);
  });

  it("reports SNR only when both levels are usable", () => {
    expect(snrDb(-70, -30)).toBe(40);
    expect(snrDb(-70, -69.5)).toBeNull();
    expect(snrDb(-100, -30)).toBeNull();
  });

  it("debounces clip events and holds the peak for 1.5 s", () => {
    expect(isNewClipEvent(true, 1000, 800)).toBe(false);
    expect(isNewClipEvent(true, 1000, 700)).toBe(true);
    expect(isNewClipEvent(false, 1000, 0)).toBe(false);
    const hold = { amplitude: 0.8, at: 0 };
    expect(nextPeakHold(0.5, 1000, hold)).toBe(hold);
    expect(nextPeakHold(0.5, 1600, hold)).toEqual({ amplitude: 0.5, at: 1600 });
    expect(nextPeakHold(0.9, 100, hold)).toEqual({ amplitude: 0.9, at: 100 });
  });

  it("formats readouts", () => {
    expect(formatDbfs(-100)).toBe("--");
    expect(formatDbfs(-12.34)).toBe("-12.3 dBFS");
    expect(formatSeconds(-5)).toBe("0.0");
    expect(formatSeconds(9450)).toBe("9.4");
    expect([0, 1, 3].map(formatClipEvents)).toEqual(["None", "1 event", "3 events"]);
  });

  it("picks the first supported recording format", () => {
    const supported = new Set(["audio/webm", "audio/mp4"]);
    expect(pickRecorderMimeType(["audio/webm;codecs=opus", "audio/webm", "audio/mp4"], (t) => supported.has(t))).toBe(
      "audio/webm",
    );
    expect(pickRecorderMimeType(["audio/ogg"], () => false)).toBeUndefined();
  });
});
