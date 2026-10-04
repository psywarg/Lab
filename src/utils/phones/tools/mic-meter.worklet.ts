// src/utils/phones/tools/mic-meter.worklet.ts
// AudioWorklet that meters every microphone sample and posts a report about
// every 50 ms. Loaded with `?worker&url` so Vite bundles the shared code.
import { createMeterAccumulator } from "./mic";

declare const sampleRate: number;
declare function registerProcessor(name: string, processor: unknown): void;
declare class AudioWorkletProcessor {
  readonly port: MessagePort;
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
