// src/utils/phones/tools/mic-meter.worklet.ts
// AudioWorklet that meters every microphone sample and posts a report about
// every 50 ms. Loaded with `?worker&url`; an AudioWorklet must be its own
// file, so the metering it needs lives here.

declare const sampleRate: number;
declare function registerProcessor(name: string, processor: unknown): void;
declare class AudioWorkletProcessor {
  readonly port: MessagePort;
}

type MeterReport = {
  /** Highest absolute sample value in the block, 0 to 1. */
  peak: number;
  /** RMS of the block, 0 to 1. */
  rms: number;
  /** True if at least `clipRun` consecutive samples reached the threshold. */
  clipped: boolean;
  samples: number;
};

type MeterAccumulator = {
  /** Adds one render block; returns a report once enough samples are in. */
  add: (channels: readonly Float32Array[]) => MeterReport | null;
};

/**
 * Looks at every sample, so short peaks and clipping between screen frames
 * are not missed. With several channels, the loudest channel of each sample
 * frame is used.
 */
function createMeterAccumulator(
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

const REPORT_SECONDS = 0.05;

class MicMeterProcessor extends AudioWorkletProcessor {
  private readonly meter = createMeterAccumulator(
    Math.round(sampleRate * REPORT_SECONDS),
  );

  process(inputs: Float32Array[][]): boolean {
    const report = this.meter.add(inputs[0] ?? []);
    if (report) this.port.postMessage(report);
    return true;
  }
}

registerProcessor("mic-meter", MicMeterProcessor);
