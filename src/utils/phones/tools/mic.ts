// src/utils/phones/tools/mic.ts
// Microphone capture settings and the sample-accurate level meter used by
// the mic test. Kept free of DOM access so the AudioWorklet can import it.

/**
 * Raw capture by default: echo cancellation, noise suppression and automatic
 * gain change the level, noise floor and SNR the test is trying to measure.
 */
export function micConstraints(
  deviceId: string,
  callProcessing: boolean,
): MediaStreamConstraints {
  return {
    audio: {
      ...(deviceId ? { deviceId: { exact: deviceId } } : {}),
      echoCancellation: callProcessing,
      noiseSuppression: callProcessing,
      autoGainControl: callProcessing,
    },
  };
}

export type MicOption = { value: string; label: string };

type DeviceLike = Pick<MediaDeviceInfo, "deviceId" | "kind" | "label">;

/** Chrome lists these aliases next to the real devices. */
const ALIAS_DEVICE_IDS = new Set(["", "default", "communications"]);

/** "System default" first, then each real input; unnamed until permission. */
export function micDeviceOptions(devices: readonly DeviceLike[]): MicOption[] {
  const inputs = devices.filter(
    (device) =>
      device.kind === "audioinput" && !ALIAS_DEVICE_IDS.has(device.deviceId),
  );
  return [
    { value: "", label: "System default" },
    ...inputs.map((device, index) => ({
      value: device.deviceId,
      label: device.label || `Microphone ${index + 1}`,
    })),
  ];
}

export type MeterReport = {
  /** Highest absolute sample value in the block, 0 to 1. */
  peak: number;
  /** RMS of the block, 0 to 1. */
  rms: number;
  /** True if at least `clipRun` consecutive samples reached the threshold. */
  clipped: boolean;
  samples: number;
};

export type MeterAccumulator = {
  /** Adds one render block; returns a report once enough samples are in. */
  add: (channels: readonly Float32Array[]) => MeterReport | null;
};

/**
 * Looks at every sample, so short peaks and clipping between screen frames
 * are not missed. With several channels, the loudest channel of each sample
 * frame is used.
 */
export function createMeterAccumulator(
  reportEvery: number,
  clipThreshold = 0.99,
  clipRun = 3,
): MeterAccumulator {
  let peak = 0;
  let sumSquares = 0;
  let count = 0;
  let run = 0;
  let clipped = false;

  return {
    add(channels) {
      const length = channels[0]?.length ?? 0;
      for (let index = 0; index < length; index += 1) {
        let sample = 0;
        for (const channel of channels) {
          const value = Math.abs(channel[index] ?? 0);
          if (value > sample) sample = value;
        }
        if (sample > peak) peak = sample;
        sumSquares += sample * sample;
        count += 1;
        if (sample >= clipThreshold) {
          run += 1;
          if (run >= clipRun) clipped = true;
        } else {
          run = 0;
        }
      }
      if (count < reportEvery) return null;
      const report: MeterReport = {
        peak,
        rms: Math.sqrt(sumSquares / count),
        clipped,
        samples: count,
      };
      peak = 0;
      sumSquares = 0;
      count = 0;
      clipped = false;
      return report;
    },
  };
}

/** Combines several reports into one, weighting RMS by sample count. */
export function mergeMeterReports(reports: readonly MeterReport[]): MeterReport | null {
  if (reports.length === 0) return null;
  let peak = 0;
  let energy = 0;
  let samples = 0;
  let clipped = false;
  for (const report of reports) {
    peak = Math.max(peak, report.peak);
    energy += report.rms * report.rms * report.samples;
    samples += report.samples;
    clipped ||= report.clipped;
  }
  return {
    peak,
    rms: samples > 0 ? Math.sqrt(energy / samples) : 0,
    clipped,
    samples,
  };
}
