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
