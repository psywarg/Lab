// src/utils/phones/tools/gyroscope.ts
// Rate maths, heading tracking, formatters and verdict labels for the
// gyroscope test. Rates are in deg/s, angles in degrees.

import { BIAS_CAPTURE, type DriftState } from "./motion";

/** Corrected rates closer to zero than this are shown as zero (animation only). */
export const RATE_RESIDUAL_DEADBAND = 0.9;
export const RATE_SMOOTHING_FACTOR = 0.26;
/** Rates below this read as resting in the drift animation. */
export const DRIFT_QUIET_RATE = 2.4;
/** Z rates below this read as not twisting. */
export const TWIST_QUIET_RATE = 3.5;
/** A sensor that has not reported for this long counts as stale. */
export const SENSOR_FRESHNESS_MS = 1800;
const HEADING_HISTORY_LIMIT = 48;

/** Wraps an angle into -180..180. */
export function wrapDegrees(value: number): number {
  return ((value + 540) % 360) - 180;
}

export function isRecent(lastSampleTime: number, now: number): boolean {
  return lastSampleTime > 0 && now - lastSampleTime < SENSOR_FRESHNESS_MS;
}

/** Raw rate minus the captured offset, with a small deadband for display. */
export function correctedRate(value: number, bias: number, biasReady: boolean): number {
  const corrected = value - (biasReady ? bias : 0);
  return Math.abs(corrected) < RATE_RESIDUAL_DEADBAND ? 0 : corrected;
}

/** Eases the displayed rate towards `next`, snapping small values to zero. */
export function smoothCorrectedRate(previous: number, next: number): number {
  if (next === 0 && Math.abs(previous) < RATE_RESIDUAL_DEADBAND * 1.25) return 0;
  const smoothed = previous + (next - previous) * RATE_SMOOTHING_FACTOR;
  return Math.abs(smoothed) < RATE_RESIDUAL_DEADBAND ? 0 : smoothed;
}

export function applyQuietRateDeadband(value: number, threshold = TWIST_QUIET_RATE): number {
  return Math.abs(value) < threshold ? 0 : value;
}

export function applyDriftRateDeadband(value: number): number {
  return Math.abs(value) < DRIFT_QUIET_RATE ? 0 : value;
}

/**
 * Appends a heading to the wrapped history and its continuous (unwrapped)
 * twin, so a turn across ±180 is not read as a 360° jump.
 */
export function appendHeading(
  wrapped: number[],
  unwrapped: number[],
  heading: number,
  limit = HEADING_HISTORY_LIMIT,
): void {
  wrapped.push(heading);
  if (wrapped.length > limit) wrapped.shift();
  if (!unwrapped.length) {
    unwrapped.push(heading);
    return;
  }
  const lastWrapped = wrapped.length > 1 ? (wrapped[wrapped.length - 2] ?? heading) : heading;
  const lastUnwrapped = unwrapped[unwrapped.length - 1] ?? heading;
  unwrapped.push(lastUnwrapped + wrapDegrees(heading - lastWrapped));
  if (unwrapped.length > limit) unwrapped.shift();
}

export function headingDriftRange(unwrapped: readonly number[]): number {
  if (!unwrapped.length) return 0;
  return Math.max(...unwrapped) - Math.min(...unwrapped);
}

// --- Formatting and verdicts -------------------------------------------------

export function formatAngle(value: number): string {
  return `${value.toFixed(1)}°`;
}

export function formatRate(value: number): string {
  return `${Math.round(value)} deg/s`;
}

export function formatSignedRate(value: number): string {
  const rounded = Math.round(value);
  return `${rounded > 0 ? "+" : ""}${rounded} deg/s`;
}

export function formatNoise(value: number): string {
  return `${value.toFixed(1)} deg/s`;
}

export function driftStateLabel(state: DriftState | "waiting"): string {
  if (state === "waiting") return "Waiting for rate";
  if (state === "calm") return "Calm";
  if (state === "minor") return "Minor drift";
  return "High drift";
}

/** Noise at or under the capture limit means the phone was held still. */
export function restingNoiseLabel(state: DriftState | "waiting", noise: number): string {
  if (state === "waiting") return "Waiting for rate";
  return noise <= BIAS_CAPTURE.noiseLimit ? "Steady" : "Moving or noisy";
}

export function headingStateLabel(available: boolean, range: number): string {
  if (!available) return "Unavailable";
  if (range < 2) return "Stable";
  if (range < 8) return "Minor drift";
  return "Large drift";
}
