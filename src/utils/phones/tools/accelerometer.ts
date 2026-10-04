// src/utils/phones/tools/accelerometer.ts
// Per-sample maths and verdict bands for the accelerometer test. Inputs are
// in m/s²; outputs are in g.

import { mean, standardDeviation, type Vector3 } from "./motion";

export const STANDARD_GRAVITY = 9.80665;
/** Low-pass weight for the gravity estimate used to derive linear motion. */
export const GRAVITY_LPF_ALPHA = 0.08;

export type AccelInput = {
  gx: number | null;
  gy: number | null;
  gz: number | null;
  lx: number | null;
  ly: number | null;
  lz: number | null;
};

export type AccelEstimate = {
  latest: Vector3;
  gravity: Vector3;
  gravityReady: boolean;
};

export type AccelStep = {
  estimate: AccelEstimate;
  hasGravityData: boolean;
  /** Magnitude of the raw reading, in g; null without all three axes. */
  totalG: number | null;
  /** Change since the last sample, in g. */
  delta: number;
  /** Signed vertical linear acceleration, in g. */
  liftSignal: number;
  /** Strongest linear axis, signed, in g. */
  shakeSignal: number;
  /** Horizontal component of the raw reading, in g. */
  tiltSignal: number;
};

export function createAccelEstimate(): AccelEstimate {
  return {
    latest: { x: 0, y: 0, z: 0 },
    gravity: { x: 0, y: 0, z: STANDARD_GRAVITY },
    gravityReady: false,
  };
}

/**
 * Folds one reading into the estimate. Missing axes keep their last value.
 * Linear motion comes from the linear sensor when it reports, otherwise
 * from the raw reading minus the low-passed gravity estimate.
 */
export function stepAccel(
  previous: AccelEstimate,
  { gx, gy, gz, lx, ly, lz }: AccelInput,
  alpha = GRAVITY_LPF_ALPHA,
): AccelStep {
  const hasGravityData = gx !== null && gy !== null && gz !== null;
  const prev = previous.latest;
  const latest = {
    x: gx ?? prev.x,
    y: gy ?? prev.y,
    z: gz ?? prev.z,
  };
  const hadPreviousSample = previous.gravityReady;

  let gravity = previous.gravity;
  let gravityReady = previous.gravityReady;
  if (hasGravityData) {
    gravity = gravityReady
      ? {
          x: gravity.x + (latest.x - gravity.x) * alpha,
          y: gravity.y + (latest.y - gravity.y) * alpha,
          z: gravity.z + (latest.z - gravity.z) * alpha,
        }
      : { ...latest };
    gravityReady = true;
  }

  const totalG = hasGravityData
    ? Math.sqrt(latest.x ** 2 + latest.y ** 2 + latest.z ** 2) / STANDARD_GRAVITY
    : null;
  const tiltSignal = hasGravityData ? Math.hypot(latest.x, latest.y) / STANDARD_GRAVITY : 0;
  const gravityDelta =
    hasGravityData && hadPreviousSample
      ? Math.sqrt((latest.x - prev.x) ** 2 + (latest.y - prev.y) ** 2 + (latest.z - prev.z) ** 2) /
        STANDARD_GRAVITY
      : 0;

  const derived = {
    x: hasGravityData ? latest.x - gravity.x : 0,
    y: hasGravityData ? latest.y - gravity.y : 0,
    z: hasGravityData ? latest.z - gravity.z : 0,
  };
  const linearAxes = [lx ?? derived.x, ly ?? derived.y, lz ?? derived.z];
  const dominantLinearAxis = linearAxes.reduce(
    (strongest, value) => (Math.abs(value) > Math.abs(strongest) ? value : strongest),
    0,
  );
  const liftSignal = lz !== null ? lz / STANDARD_GRAVITY : derived.z / STANDARD_GRAVITY;
  const shakeSignal = dominantLinearAxis / STANDARD_GRAVITY;
  const delta = hasGravityData && hadPreviousSample ? gravityDelta : Math.abs(shakeSignal);

  return {
    estimate: { latest, gravity, gravityReady },
    hasGravityData,
    totalG,
    delta,
    liftSignal,
    shakeSignal,
    tiltSignal,
  };
}

/** Samples steadier than this count towards the flat-check window. */
export const STILL_DELTA_LIMIT_G = 0.08;

export function isStillSample(totalG: number | null, delta: number): boolean {
  return totalG !== null && delta < STILL_DELTA_LIMIT_G;
}

export const SHAKE_DEBOUNCE_MS = 500;

/** A shake is a 1.65 g total, or a 0.8 g jump or linear spike, at most every 500 ms. */
export function isShakeEvent(step: {
  totalG: number | null;
  delta: number;
  shakeSignal: number;
  sampleCount: number;
  msSinceLastShake: number;
}): boolean {
  return (
    step.sampleCount > 1 &&
    ((step.totalG !== null && step.totalG > 1.65) ||
      step.delta > 0.8 ||
      Math.abs(step.shakeSignal) > 0.8) &&
    step.msSinceLastShake > SHAKE_DEBOUNCE_MS
  );
}

// --- Verdicts ---------------------------------------------------------------

export const STILL_WINDOW_MIN_SAMPLES = 8;

export type StillnessEvidence = {
  ready: boolean;
  /** Standard deviation of total force while still, in g. */
  noise: number;
  /** Distance of the mean total force from 1 g. */
  gravityError: number;
};

export function stillnessEvidence(stillForce: readonly number[]): StillnessEvidence {
  return {
    ready: stillForce.length >= STILL_WINDOW_MIN_SAMPLES,
    noise: standardDeviation(stillForce),
    gravityError: Math.abs(mean(stillForce) - 1),
  };
}

export function gravityOffsetState(evidence: StillnessEvidence): string {
  if (!evidence.ready) return "Collecting flat samples";
  if (evidence.gravityError < 0.03) return "On target";
  if (evidence.gravityError < 0.08) return "Slight offset";
  return "High offset";
}

export function noiseState(evidence: StillnessEvidence): string {
  if (!evidence.ready) return "Collecting flat samples";
  if (evidence.noise < 0.015) return "Quiet";
  if (evidence.noise < 0.045) return "Normal";
  if (evidence.noise < 0.09) return "Noisy";
  return "Very noisy";
}

export function motionDeltaState(delta: number): string {
  if (delta < 0.35) return "Stable";
  if (delta < 1.2) return "Moving";
  if (delta < 3) return "Strong motion";
  return "Sharp spike";
}

export function peakDeltaState(peak: number): string {
  if (peak < 0.35) return "No spike yet";
  if (peak < 1.2) return "Light motion";
  if (peak < 3) return "Clear spike";
  return "Heavy spike";
}
