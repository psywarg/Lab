// src/utils/phones/tools/motion.ts
// Shared logic for the accelerometer and gyroscope tools.

export type Vector3 = { x: number; y: number; z: number };

/** A sensor reading as a number, or null when missing or not finite. */
export function finiteNumber(value: number | null | undefined): number | null {
  return typeof value === "number" && Number.isFinite(value) ? value : null;
}

export function mean(values: readonly number[]): number {
  if (values.length === 0) return 0;
  let sum = 0;
  for (const value of values) sum += value;
  return sum / values.length;
}

/** Sample standard deviation (n - 1). */
export function standardDeviation(values: readonly number[]): number {
  if (values.length < 2) return 0;
  const centre = mean(values);
  let sum = 0;
  for (const value of values) sum += (value - centre) ** 2;
  return Math.sqrt(sum / (values.length - 1));
}

export function rootMeanSquare(values: readonly number[]): number {
  if (values.length === 0) return 0;
  let sum = 0;
  for (const value of values) sum += value * value;
  return Math.sqrt(sum / values.length);
}

/** RMS distance from `centre` (population, n). */
export function deviationRms(values: readonly number[], centre: number): number {
  if (values.length === 0) return 0;
  let sum = 0;
  for (const value of values) sum += (value - centre) ** 2;
  return Math.sqrt(sum / values.length);
}

export type RestingStats = {
  perAxisMean: Vector3;
  /** Magnitude of the per-axis means: the resting offset (bias). */
  biasMagnitude: number;
  /** Combined RMS of each axis around its own mean. */
  noiseRms: number;
  samples: number;
};

/**
 * Bias and noise of a resting gyroscope (or any 3-axis) stream, from raw
 * readings: no smoothing and no deadbands, so small offsets are not hidden.
 */
export function restingStats(
  x: readonly number[],
  y: readonly number[],
  z: readonly number[],
): RestingStats | null {
  const samples = Math.min(x.length, y.length, z.length);
  if (samples === 0) return null;
  const xs = x.slice(-samples);
  const ys = y.slice(-samples);
  const zs = z.slice(-samples);
  const perAxisMean = { x: mean(xs), y: mean(ys), z: mean(zs) };
  return {
    perAxisMean,
    biasMagnitude: Math.hypot(perAxisMean.x, perAxisMean.y, perAxisMean.z),
    noiseRms: Math.hypot(
      deviationRms(xs, perAxisMean.x),
      deviationRms(ys, perAxisMean.y),
      deviationRms(zs, perAxisMean.z),
    ),
    samples,
  };
}

export type DriftState = "calm" | "minor" | "high";

/** Thresholds in deg/s, unchanged from the tool's original bands. */
export const DRIFT_THRESHOLDS = { calm: 2.4, minor: 5.5 } as const;

export function driftState(biasMagnitude: number): DriftState {
  if (biasMagnitude < DRIFT_THRESHOLDS.calm) return "calm";
  if (biasMagnitude < DRIFT_THRESHOLDS.minor) return "minor";
  return "high";
}

export const BIAS_CAPTURE = { minSamples: 20, noiseLimit: 1.4 } as const;

export type BiasCaptureResult =
  | { ok: true; stats: RestingStats; highOffset: boolean }
  | { ok: false; reason: "too-few-samples" | "moved"; stats: RestingStats | null };

/**
 * A capture is rejected only when there is too little data or the noise shows
 * the phone moved. A large but steady offset is a result, not a user error.
 */
export function evaluateBiasCapture(
  x: readonly number[],
  y: readonly number[],
  z: readonly number[],
): BiasCaptureResult {
  const stats = restingStats(x, y, z);
  if (!stats || stats.samples < BIAS_CAPTURE.minSamples) {
    return { ok: false, reason: "too-few-samples", stats };
  }
  if (stats.noiseRms > BIAS_CAPTURE.noiseLimit) {
    return { ok: false, reason: "moved", stats };
  }
  return {
    ok: true,
    stats,
    highOffset: driftState(stats.biasMagnitude) === "high",
  };
}

// --- Generic Sensor API -------------------------------------------------

export type GenericSensor = EventTarget & {
  readonly x?: number;
  readonly y?: number;
  readonly z?: number;
  start(): void;
  stop(): void;
};

type GenericSensorCtor = new (options?: { frequency?: number }) => GenericSensor;

export type GenericSensorName =
  | "Accelerometer"
  | "LinearAccelerationSensor"
  | "GravitySensor"
  | "Gyroscope";

export function genericSensorCtor(name: GenericSensorName): GenericSensorCtor | null {
  const candidate = (window as unknown as Record<string, unknown>)[name];
  return typeof candidate === "function" ? (candidate as GenericSensorCtor) : null;
}

export type StartGenericSensorOptions = {
  frequency?: number;
  timeoutMs?: number;
  signal?: AbortSignal;
  onReading: (sensor: GenericSensor) => void;
  /** Called for errors after the sensor has activated. */
  onError?: () => void;
};

/**
 * Starts a Generic Sensor and resolves with it once it activates, or with
 * null if it is unsupported, errors, or does not activate within the timeout.
 */
export function startGenericSensor(
  name: GenericSensorName,
  { frequency = 60, timeoutMs = 1000, signal, onReading, onError }: StartGenericSensorOptions,
): Promise<GenericSensor | null> {
  const Ctor = genericSensorCtor(name);
  if (!Ctor) return Promise.resolve(null);

  return new Promise((resolve) => {
    let settled = false;
    let sensor: GenericSensor | null = null;
    const finish = (value: GenericSensor | null): void => {
      if (settled) return;
      settled = true;
      window.clearTimeout(timer);
      if (!value) sensor?.stop();
      resolve(value);
    };
    const timer = window.setTimeout(() => finish(null), timeoutMs);
    try {
      sensor = new Ctor({ frequency });
      const current = sensor;
      current.addEventListener("reading", () => onReading(current), { signal });
      current.addEventListener("activate", () => finish(current), { signal });
      current.addEventListener(
        "error",
        () => {
          if (settled) onError?.();
          else finish(null);
        },
        { signal },
      );
      current.start();
    } catch {
      finish(null);
    }
  });
}

// --- Graph --------------------------------------------------------------

export type GraphSeries = {
  values: readonly number[];
  sampleCount: number;
  min: number;
  max: number;
  baseline?: number;
  label: string;
};

type Rgb = { r: number; g: number; b: number };

export type MotionGraph = {
  resize: () => void;
  draw: (series: GraphSeries) => void;
  updateLabel: (series: GraphSeries) => void;
  disconnect: () => void;
};

/**
 * Line graph on a canvas. The line colour comes from the canvas's CSS
 * `color`, read once and re-read only when the theme class changes.
 */
export function createMotionGraph(
  canvas: HTMLCanvasElement | null,
  label: HTMLElement | null,
  fallbackColor: Rgb,
): MotionGraph {
  let width = 0;
  let height = 0;
  let color: Rgb | null = null;

  const themeObserver =
    typeof MutationObserver === "undefined"
      ? null
      : new MutationObserver(() => {
          color = null;
        });
  themeObserver?.observe(document.documentElement, {
    attributes: true,
    attributeFilter: ["class"],
  });

  function lineColor(): Rgb {
    if (color) return color;
    const computed = canvas ? getComputedStyle(canvas).color : "";
    const match = computed.match(/rgba?\(\s*([\d.]+)[,\s]+([\d.]+)[,\s]+([\d.]+)/);
    color = match
      ? { r: Number(match[1]), g: Number(match[2]), b: Number(match[3]) }
      : fallbackColor;
    return color;
  }

  function updateLabel(series: GraphSeries): void {
    if (!label) return;
    const sampleLabel =
      series.sampleCount > 0
        ? `Last ${series.sampleCount} sample${series.sampleCount === 1 ? "" : "s"}`
        : "No samples yet";
    label.textContent = `${series.label} - ${sampleLabel}`;
  }

  function resize(): void {
    if (!canvas) return;
    const rect = canvas.getBoundingClientRect();
    width = rect.width;
    height = rect.height;
    if (width <= 0 || height <= 0) return;
    const ratio = Math.min(window.devicePixelRatio || 1, 2);
    canvas.width = Math.round(width * ratio);
    canvas.height = Math.round(height * ratio);
    canvas.getContext("2d")?.setTransform(ratio, 0, 0, ratio, 0, 0);
  }

  function draw(series: GraphSeries): void {
    updateLabel(series);
    if (!canvas || width <= 0 || height <= 0) return;
    const context = canvas.getContext("2d");
    if (!context) return;

    context.clearRect(0, 0, width, height);
    const { r, g, b } = lineColor();
    const withAlpha = (alpha: number): string => `rgb(${r} ${g} ${b} / ${alpha})`;

    context.strokeStyle = withAlpha(0.1);
    context.lineWidth = 1;
    for (let index = 1; index < 4; index += 1) {
      const y = (height / 4) * index;
      context.beginPath();
      context.moveTo(0, y);
      context.lineTo(width, y);
      context.stroke();
    }

    let minValue = series.min;
    let maxValue = series.max;
    if (series.baseline !== undefined) {
      const deviation = Math.max(
        series.baseline - series.min,
        series.max - series.baseline,
        0.001,
      );
      minValue = series.baseline - deviation;
      maxValue = series.baseline + deviation;
    }
    const span = Math.max(0.001, maxValue - minValue);

    if (series.baseline !== undefined) {
      const baselineY = height - ((series.baseline - minValue) / span) * height;
      context.strokeStyle = withAlpha(0.35);
      context.setLineDash([6, 6]);
      context.beginPath();
      context.moveTo(0, baselineY);
      context.lineTo(width, baselineY);
      context.stroke();
      context.setLineDash([]);
    }

    const values = series.values;
    if (values.length <= 1) return;

    context.strokeStyle = withAlpha(0.9);
    context.lineWidth = 2.25;
    context.lineJoin = "round";
    context.lineCap = "round";
    context.beginPath();
    values.forEach((value, index) => {
      const x = (index / (values.length - 1)) * width;
      const y = height - ((value - minValue) / span) * height;
      if (index === 0) context.moveTo(x, y);
      else context.lineTo(x, y);
    });
    context.stroke();
  }

  return {
    resize,
    draw,
    updateLabel,
    disconnect: () => themeObserver?.disconnect(),
  };
}
