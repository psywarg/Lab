// src/utils/phones/tools/screen.ts
// Measurement and option helpers for the screen test.

import { median } from "./stats";

export const FRAME_RATE_MIN_SAMPLES = 20;
export const FRAME_RATE_MAX_SAMPLES = 120;

export type FrameRateMeter = {
  /** Records a requestAnimationFrame timestamp; returns fps once there are enough frames. */
  tick: (timestamp: number) => number | null;
  reset: () => void;
};

/**
 * Display refresh estimate from the median frame interval, so occasional
 * dropped or doubled frames do not move the reading.
 */
export function createFrameRateMeter(
  minSamples = FRAME_RATE_MIN_SAMPLES,
  maxSamples = FRAME_RATE_MAX_SAMPLES,
): FrameRateMeter {
  let samples: number[] = [];
  let lastTimestamp = 0;
  return {
    tick(timestamp) {
      const previous = lastTimestamp;
      lastTimestamp = timestamp;
      if (previous === 0) return null;
      samples.push(timestamp - previous);
      if (samples.length > maxSamples) samples.shift();
      if (samples.length < minSamples) return null;
      const interval = median(samples) ?? 0;
      return interval > 0 ? Math.round(1000 / interval) : null;
    },
    reset() {
      samples = [];
      lastTimestamp = 0;
    },
  };
}

/** Grey level (0-255) that looks like 50% brightness at a display gamma. */
export function gammaPatchValue(gamma: number): number {
  return Math.round(255 * 0.5 ** (1 / gamma));
}

export function isBandingKind(kind: string): boolean {
  return kind === "steps-16" || kind === "steps-32" || kind === "steps-64";
}

export type OptionMode = "angle" | "banding" | "none";

/** Which option button a pattern offers: rotate it, change its channel, or none. */
export function optionModeFor(kind: string, angleableKinds: ReadonlySet<string>): OptionMode {
  if (angleableKinds.has(kind)) return "angle";
  if (isBandingKind(kind)) return "banding";
  return "none";
}

/** Hex colours are shown upper-case; other labels unchanged. */
export function formatPatternMeta(value: string): string {
  return value.startsWith("#") ? value.toUpperCase() : value;
}
