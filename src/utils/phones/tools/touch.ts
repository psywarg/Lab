// src/utils/phones/tools/touch.ts

import { median } from "./stats";

export type GridSize = { cols: number; rows: number };

/** Grid of roughly `targetPx` square cells, at least `minCells` per side. */
export function gridSizeFor(
  width: number,
  height: number,
  targetPx = 44,
  minCells = 6,
): GridSize {
  return {
    cols: Math.max(minCells, Math.round(width / targetPx)),
    rows: Math.max(minCells, Math.round(height / targetPx)),
  };
}

/**
 * Coverage scored on exactly the cells that are drawn, so 100% means every
 * visible cell has been touched.
 */
export type CoverageGrid = {
  readonly size: GridSize;
  readonly hitCount: number;
  /** Marks every cell the contact circle overlaps; returns newly hit cell indices. */
  mark: (x: number, y: number, radius: number, width: number, height: number) => number[];
  isHit: (col: number, row: number) => boolean;
  percent: () => number;
  /** Changes the grid size, carrying hits over by cell centre. */
  resize: (size: GridSize) => void;
  clear: () => void;
};

export function createCoverageGrid(initial: GridSize): CoverageGrid {
  let size = initial;
  let hits = new Set<number>();

  const index = (col: number, row: number): number => row * size.cols + col;
  const clampIndex = (value: number, count: number): number =>
    Math.min(count - 1, Math.max(0, value));

  return {
    get size() {
      return size;
    },
    get hitCount() {
      return hits.size;
    },
    mark(x, y, radius, width, height) {
      if (width <= 0 || height <= 0) return [];
      const cellW = width / size.cols;
      const cellH = height / size.rows;
      const r = Math.max(0, radius);
      const colMin = clampIndex(Math.floor((x - r) / cellW), size.cols);
      const colMax = clampIndex(Math.floor((x + r) / cellW), size.cols);
      const rowMin = clampIndex(Math.floor((y - r) / cellH), size.rows);
      const rowMax = clampIndex(Math.floor((y + r) / cellH), size.rows);
      const added: number[] = [];
      for (let row = rowMin; row <= rowMax; row += 1) {
        for (let col = colMin; col <= colMax; col += 1) {
          // Nearest point of this cell to the contact centre.
          const nearestX = Math.min(Math.max(x, col * cellW), (col + 1) * cellW);
          const nearestY = Math.min(Math.max(y, row * cellH), (row + 1) * cellH);
          if (Math.hypot(x - nearestX, y - nearestY) > r) continue;
          const key = index(col, row);
          if (!hits.has(key)) {
            hits.add(key);
            added.push(key);
          }
        }
      }
      return added;
    },
    isHit(col, row) {
      return hits.has(index(col, row));
    },
    percent() {
      const total = size.cols * size.rows;
      if (total === 0 || hits.size === 0) return 0;
      // Floor so 100% is only shown when every cell is really lit.
      return Math.floor((hits.size / total) * 100);
    },
    resize(next) {
      if (next.cols === size.cols && next.rows === size.rows) return;
      const previous = size;
      const carried = new Set<number>();
      hits.forEach((key) => {
        const col = key % previous.cols;
        const row = Math.floor(key / previous.cols);
        const nx = (col + 0.5) / previous.cols;
        const ny = (row + 0.5) / previous.rows;
        const newCol = clampIndex(Math.floor(nx * next.cols), next.cols);
        const newRow = clampIndex(Math.floor(ny * next.rows), next.rows);
        carried.add(newRow * next.cols + newCol);
      });
      size = next;
      hits = carried;
    },
    clear() {
      hits = new Set<number>();
    },
  };
}

export type PrecisionBand = "centre" | "on-target" | "near" | "miss";

/** Distance limits in CSS px for each band (centre dot radius 8, target radius 24). */
export const PRECISION_BAND_LIMITS = {
  centre: 8,
  onTarget: 24,
  near: 48,
} as const;

export const PRECISION_BAND_LABELS: Record<PrecisionBand, string> = {
  centre: "Centre",
  "on-target": "On target",
  near: "Near miss",
  miss: "Miss",
};

export function gradePrecision(distancePx: number): PrecisionBand {
  if (distancePx <= PRECISION_BAND_LIMITS.centre) return "centre";
  if (distancePx <= PRECISION_BAND_LIMITS.onTarget) return "on-target";
  if (distancePx <= PRECISION_BAND_LIMITS.near) return "near";
  return "miss";
}

export { median } from "./stats";

/**
 * Input sample rate per pointer. Reports the median rate across pointers so
 * two fingers moving at 60 Hz read 60 Hz, not 120 Hz.
 */
export type PointerRateTracker = {
  record: (pointerId: number, timestampMs: number) => void;
  rate: () => number | null;
  clear: () => void;
};

export function createPointerRateTracker(windowMs = 1000): PointerRateTracker {
  const samples = new Map<number, number[]>();

  function prune(list: number[], latest: number): void {
    const cutoff = latest - windowMs;
    while (list.length > 0 && (list[0] ?? 0) < cutoff) list.shift();
  }

  return {
    record(pointerId, timestampMs) {
      const list = samples.get(pointerId) ?? [];
      list.push(timestampMs);
      prune(list, timestampMs);
      samples.set(pointerId, list);
      // Drop pointers whose samples are all stale relative to this one.
      samples.forEach((other, id) => {
        const last = other[other.length - 1];
        if (id !== pointerId && (last === undefined || last < timestampMs - windowMs)) {
          samples.delete(id);
        }
      });
    },
    rate() {
      const rates: number[] = [];
      samples.forEach((list) => {
        if (list.length < 2) return;
        const span = (list[list.length - 1] ?? 0) - (list[0] ?? 0);
        if (span > 0) rates.push(((list.length - 1) / span) * 1000);
      });
      const value = median(rates);
      return value === null ? null : Math.round(value);
    },
    clear() {
      samples.clear();
    },
  };
}

export type InputDetails = {
  pointerType: string;
  pressure: number;
  width: number;
  height: number;
};

/** "Finger · 42% · 12×14px"; pressure is omitted when the device doesn't report it. */
export function formatInputReadout(input: InputDetails | null): string {
  if (!input) return "--";
  const typeLabel =
    input.pointerType === "touch"
      ? "Finger"
      : input.pointerType === "pen"
        ? "Stylus"
        : "Mouse";
  const parts = [typeLabel];
  // Browsers report 0.5 for "pressed" when the hardware has no pressure sensor.
  if (input.pointerType !== "mouse" && input.pressure > 0 && input.pressure !== 0.5) {
    parts.push(`${Math.round(input.pressure * 100)}%`);
  }
  if (input.width > 1 || input.height > 1) {
    parts.push(`${Math.round(input.width)}×${Math.round(input.height)}px`);
  }
  return parts.join(" · ");
}

/** Summary line for the precision test: band counts and mean offset. */
export function precisionSummary(
  bands: readonly (PrecisionBand | null)[],
  offsets: readonly (number | null)[],
): string {
  const present = offsets.filter((value): value is number => value !== null);
  const counts = (["centre", "on-target", "near", "miss"] as const)
    .map(
      (band) =>
        `${bands.filter((value) => value === band).length} ${PRECISION_BAND_LABELS[band]}`,
    )
    .join(", ");
  if (present.length === 0) return counts;
  const mean = present.reduce((sum, value) => sum + value, 0) / present.length;
  return `${counts}, average offset ${Math.round(mean)} px`;
}

/** Gives each active pointer the lowest free colour slot. */
export type SlotAllocator = {
  allocate: (pointerId: number) => number;
  release: (pointerId: number) => void;
  get: (pointerId: number) => number | undefined;
  clear: () => void;
};

export function createSlotAllocator(): SlotAllocator {
  const slots = new Map<number, number>();
  const used = new Set<number>();
  return {
    allocate(pointerId) {
      const existing = slots.get(pointerId);
      if (existing !== undefined) return existing;
      let slot = 0;
      while (used.has(slot)) slot += 1;
      slots.set(pointerId, slot);
      used.add(slot);
      return slot;
    },
    release(pointerId) {
      const slot = slots.get(pointerId);
      if (slot === undefined) return;
      slots.delete(pointerId);
      used.delete(slot);
    },
    get: (pointerId) => slots.get(pointerId),
    clear() {
      slots.clear();
      used.clear();
    },
  };
}

/** Some browsers report event timestamps as epoch time, not page time. */
export function normalizePointerTimestamp(timestamp: number, timeOrigin: number): number {
  return timestamp > timeOrigin ? timestamp - timeOrigin : timestamp;
}

// --- Drift trace ------------------------------------------------------------

export type Point = { x: number; y: number };

export type DriftResult = {
  traceStrokes: Point[][];
  tracePointCount: number;
  lastPoint: Point | null;
  lastTime: number;
  sampleIntervals: number[];
  sampleSteps: number[];
  maxDeviation: number;
  deviationSum: number;
  deviationCount: number;
  coveredGuideSamples: Set<number>;
  gapCount: number;
};

export const DRIFT_TRACE_POINT_LIMIT = 720;
export const DRIFT_COVERAGE_TOLERANCE_PX = 24;
const DRIFT_BASELINE_SAMPLE_LIMIT = 24;
const DRIFT_BASELINE_WARMUP = 6;
const DRIFT_GAP_MIN_INTERVAL_MS = 50;
const DRIFT_GAP_INTERVAL_MULTIPLIER = 3;
const DRIFT_GAP_MAD_MULTIPLIER = 6;
const DRIFT_GAP_MIN_STEP_PX = 8;
const DRIFT_GAP_STEP_MULTIPLIER = 2;

export function createDriftResult(): DriftResult {
  return {
    traceStrokes: [],
    tracePointCount: 0,
    lastPoint: null,
    lastTime: 0,
    sampleIntervals: [],
    sampleSteps: [],
    maxDeviation: 0,
    deviationSum: 0,
    deviationCount: 0,
    coveredGuideSamples: new Set<number>(),
    gapCount: 0,
  };
}

/** Shortest distance from `point` to the polyline through `guide`. */
export function nearestGuideDistance(point: Point, guide: readonly Point[]): number {
  let nearest = Infinity;
  for (let index = 1; index < guide.length; index += 1) {
    const start = guide[index - 1];
    const end = guide[index];
    if (!start || !end) continue;
    const segmentX = end.x - start.x;
    const segmentY = end.y - start.y;
    const lengthSquared = segmentX ** 2 + segmentY ** 2;
    const projection =
      lengthSquared === 0
        ? 0
        : Math.max(
            0,
            Math.min(
              1,
              ((point.x - start.x) * segmentX + (point.y - start.y) * segmentY) /
                lengthSquared,
            ),
          );
    const nearestX = start.x + projection * segmentX;
    const nearestY = start.y + projection * segmentY;
    const distance = Math.hypot(point.x - nearestX, point.y - nearestY);
    if (distance < nearest) nearest = distance;
  }
  return nearest;
}

export function recordDriftCoverage(
  result: DriftResult,
  point: Point,
  guide: readonly Point[],
  tolerancePx = DRIFT_COVERAGE_TOLERANCE_PX,
): void {
  guide.forEach((guidePoint, index) => {
    if (Math.hypot(point.x - guidePoint.x, point.y - guidePoint.y) <= tolerancePx) {
      result.coveredGuideSamples.add(index);
    }
  });
}

export function resetDriftCadence(result: DriftResult): void {
  result.sampleIntervals.length = 0;
  result.sampleSteps.length = 0;
}

export function startDriftTraceStroke(result: DriftResult): void {
  const lastStroke = result.traceStrokes[result.traceStrokes.length - 1];
  if (lastStroke?.length === 0) return;
  result.traceStrokes.push([]);
}

/**
 * Adds a point (0-1 stage coordinates) to the trace, dropping the oldest
 * points once there are more than `limit`.
 */
export function appendDriftTracePoint(
  result: DriftResult,
  normalized: Point,
  limit = DRIFT_TRACE_POINT_LIMIT,
): void {
  let stroke = result.traceStrokes[result.traceStrokes.length - 1];
  if (!stroke) {
    stroke = [];
    result.traceStrokes.push(stroke);
  }
  stroke.push(normalized);
  result.tracePointCount += 1;

  while (result.tracePointCount > limit) {
    while (result.traceStrokes.length > 1 && result.traceStrokes[0]?.length === 0) {
      result.traceStrokes.shift();
    }
    const oldestStroke = result.traceStrokes[0];
    if (!oldestStroke || oldestStroke.length === 0) {
      result.tracePointCount = 0;
      break;
    }
    oldestStroke.shift();
    result.tracePointCount -= 1;
    if (oldestStroke.length === 0 && result.traceStrokes.length > 1) {
      result.traceStrokes.shift();
    }
  }
}

export type DriftStep = "gap" | "pause" | "sample";

/**
 * Classifies the step from the last sample. Once the cadence baseline has
 * warmed up, a step that is both late and long is a missed-input gap; late
 * but short is the finger resting; anything else is a normal sample.
 */
export function classifyDriftStep(result: DriftResult, jump: number, elapsed: number): DriftStep {
  const baselineInterval = median(result.sampleIntervals);
  const baselineStep = median(result.sampleSteps);
  const hasBaseline =
    result.sampleIntervals.length >= DRIFT_BASELINE_WARMUP &&
    result.sampleSteps.length >= DRIFT_BASELINE_WARMUP &&
    baselineInterval !== null &&
    baselineStep !== null;
  const intervalMad =
    baselineInterval === null
      ? 0
      : (median(result.sampleIntervals.map((sample) => Math.abs(sample - baselineInterval))) ?? 0);
  const gapInterval = Math.max(
    DRIFT_GAP_MIN_INTERVAL_MS,
    (baselineInterval ?? 0) * DRIFT_GAP_INTERVAL_MULTIPLIER,
    (baselineInterval ?? 0) + intervalMad * DRIFT_GAP_MAD_MULTIPLIER,
  );
  const gapStep = Math.max(DRIFT_GAP_MIN_STEP_PX, (baselineStep ?? 0) * DRIFT_GAP_STEP_MULTIPLIER);
  if (hasBaseline && elapsed >= gapInterval && jump >= gapStep) return "gap";
  if (hasBaseline && elapsed >= gapInterval && jump < gapStep) return "pause";
  return "sample";
}

function pushLimited(list: number[], value: number): void {
  list.push(value);
  if (list.length > DRIFT_BASELINE_SAMPLE_LIMIT) list.shift();
}

/**
 * Records one input point against the guide: deviation, coverage, gap
 * detection and cadence. `toTrace` converts a stage point to 0-1 trace
 * coordinates, or returns null when the stage has no size.
 */
export function recordDriftSample(
  result: DriftResult,
  point: Point,
  timestamp: number,
  guide: readonly Point[],
  toTrace: (point: Point) => Point | null,
): void {
  const distance = nearestGuideDistance(point, guide);
  if (!Number.isFinite(distance)) return;
  result.maxDeviation = Math.max(result.maxDeviation, distance);
  result.deviationSum += distance;
  result.deviationCount += 1;
  recordDriftCoverage(result, point, guide);

  const appendTrace = () => {
    const traced = toTrace(point);
    if (traced) appendDriftTracePoint(result, traced);
  };

  if (result.lastPoint) {
    const jump = Math.hypot(point.x - result.lastPoint.x, point.y - result.lastPoint.y);
    const elapsed = timestamp - result.lastTime;
    if (elapsed <= 0) {
      appendTrace();
      return;
    }
    const step = classifyDriftStep(result, jump, elapsed);
    if (step === "gap") {
      result.gapCount += 1;
      startDriftTraceStroke(result);
    } else if (step === "pause") {
      resetDriftCadence(result);
    } else {
      pushLimited(result.sampleIntervals, elapsed);
      if (jump > 0) pushLimited(result.sampleSteps, jump);
    }
  }
  result.lastPoint = point;
  result.lastTime = timestamp;
  appendTrace();
}
