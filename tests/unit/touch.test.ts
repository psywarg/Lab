import { describe, expect, it } from "vitest";
import {
  createCoverageGrid,
  createPointerRateTracker,
  formatInputReadout,
  gradePrecision,
  gridSizeFor,
  appendDriftTracePoint,
  classifyDriftStep,
  createDriftResult,
  createSlotAllocator,
  nearestGuideDistance,
  normalizePointerTimestamp,
  precisionSummary,
  recordDriftSample,
} from "@/utils/phones/tools/touch";

describe("gridSizeFor", () => {
  it("uses about 44 px cells with at least 6 per side", () => {
    expect(gridSizeFor(412, 839)).toEqual({ cols: 9, rows: 19 });
    expect(gridSizeFor(100, 100)).toEqual({ cols: 6, rows: 6 });
  });
});

describe("createCoverageGrid", () => {
  const width = 412;
  const height = 839;
  const size = gridSizeFor(width, height);

  it("reports 100% only after every drawn cell is touched once", () => {
    const grid = createCoverageGrid(size);
    const cellW = width / size.cols;
    const cellH = height / size.rows;
    for (let row = 0; row < size.rows; row += 1) {
      for (let col = 0; col < size.cols; col += 1) {
        if (row === size.rows - 1 && col === size.cols - 1) continue;
        grid.mark((col + 0.5) * cellW, (row + 0.5) * cellH, 0, width, height);
      }
    }
    expect(grid.percent()).toBe(99);
    grid.mark(width - 1, height - 1, 0, width, height);
    expect(grid.percent()).toBe(100);
  });

  it("marks every cell under the contact circle and nothing beyond it", () => {
    const grid = createCoverageGrid({ cols: 4, rows: 4 });
    // Contact on the shared corner of four 100 px cells.
    const added = grid.mark(200, 200, 10, 400, 400);
    expect(added.sort((a, b) => a - b)).toEqual([5, 6, 9, 10]);
    // A small contact in the middle of a cell marks only that cell.
    expect(grid.mark(50, 50, 10, 400, 400)).toEqual([0]);
  });

  it("carries hits across a resize by cell centre", () => {
    const grid = createCoverageGrid({ cols: 2, rows: 2 });
    grid.mark(10, 10, 0, 200, 200);
    grid.resize({ cols: 4, rows: 4 });
    expect(grid.isHit(1, 1)).toBe(true);
    expect(grid.hitCount).toBe(1);
  });
});

describe("gradePrecision", () => {
  it("grades by distance from the target centre", () => {
    expect(gradePrecision(0)).toBe("centre");
    expect(gradePrecision(5)).toBe("centre");
    expect(gradePrecision(8)).toBe("centre");
    expect(gradePrecision(20)).toBe("on-target");
    expect(gradePrecision(40)).toBe("near");
    expect(gradePrecision(60)).toBe("miss");
  });
});

describe("createPointerRateTracker", () => {
  it("reports the per-pointer rate, not the sum across fingers", () => {
    const tracker = createPointerRateTracker();
    for (let t = 0; t <= 500; t += 1000 / 60) {
      tracker.record(1, t);
      tracker.record(2, t + 3);
    }
    expect(tracker.rate()).toBe(60);
  });

  it("returns null until a pointer has two samples", () => {
    const tracker = createPointerRateTracker();
    expect(tracker.rate()).toBeNull();
    tracker.record(1, 0);
    expect(tracker.rate()).toBeNull();
  });
});

describe("formatInputReadout", () => {
  it("formats pointer type, real pressure and contact size", () => {
    expect(formatInputReadout({ pointerType: "touch", pressure: 0.42, width: 12, height: 14 })).toBe(
      "Finger · 42% · 12×14px",
    );
    expect(formatInputReadout({ pointerType: "touch", pressure: 0.5, width: 1, height: 1 })).toBe("Finger");
    expect(formatInputReadout({ pointerType: "mouse", pressure: 0.5, width: 1, height: 1 })).toBe("Mouse");
    expect(formatInputReadout(null)).toBe("--");
  });
});

describe("precisionSummary", () => {
  it("counts bands and averages the recorded offsets", () => {
    expect(precisionSummary(["centre", "near", null], [3, 40, null])).toBe(
      "1 Centre, 0 On target, 1 Near miss, 0 Miss, average offset 22 px",
    );
    expect(precisionSummary([null], [null])).toBe("0 Centre, 0 On target, 0 Near miss, 0 Miss");
  });
});

describe("createSlotAllocator", () => {
  it("reuses the lowest free slot", () => {
    const slots = createSlotAllocator();
    expect([slots.allocate(10), slots.allocate(11), slots.allocate(10)]).toEqual([0, 1, 0]);
    slots.release(10);
    expect(slots.allocate(12)).toBe(0);
    expect(slots.get(11)).toBe(1);
    slots.clear();
    expect(slots.get(11)).toBeUndefined();
  });
});

describe("normalizePointerTimestamp", () => {
  it("converts epoch timestamps to page time and leaves page time alone", () => {
    expect(normalizePointerTimestamp(1_700_000_000_500, 1_700_000_000_000)).toBe(500);
    expect(normalizePointerTimestamp(500, 1_700_000_000_000)).toBe(500);
  });
});

describe("drift trace", () => {
  const line = [
    { x: 0, y: 100 },
    { x: 100, y: 100 },
    { x: 200, y: 100 },
  ];
  const identity = (point: { x: number; y: number }) => point;

  it("measures distance to the guide polyline, clamped to its ends", () => {
    expect(nearestGuideDistance({ x: 50, y: 130 }, line)).toBeCloseTo(30, 6);
    expect(nearestGuideDistance({ x: 230, y: 140 }, line)).toBeCloseTo(50, 6);
    expect(nearestGuideDistance({ x: 0, y: 0 }, [])).toBe(Infinity);
  });

  it("records deviation and coverage for each sample", () => {
    const result = createDriftResult();
    recordDriftSample(result, { x: 0, y: 105 }, 0, line, identity);
    recordDriftSample(result, { x: 100, y: 110 }, 16, line, identity);
    expect(result.maxDeviation).toBe(10);
    expect(result.deviationCount).toBe(2);
    expect([...result.coveredGuideSamples].sort()).toEqual([0, 1]);
    expect(result.tracePointCount).toBe(2);
  });

  it("counts a late, long jump as a gap once the cadence is known", () => {
    const result = createDriftResult();
    let t = 0;
    for (let x = 0; x <= 80; x += 10) {
      recordDriftSample(result, { x, y: 100 }, t, line, identity);
      t += 16;
    }
    expect(classifyDriftStep(result, 10, 16)).toBe("sample");
    expect(classifyDriftStep(result, 60, 200)).toBe("gap");
    expect(classifyDriftStep(result, 2, 200)).toBe("pause");
    recordDriftSample(result, { x: 150, y: 100 }, t + 200, line, identity);
    expect(result.gapCount).toBe(1);
    expect(result.traceStrokes.length).toBe(2);
  });

  it("keeps at most the trace point limit", () => {
    const result = createDriftResult();
    for (let i = 0; i < 10; i += 1) appendDriftTracePoint(result, { x: i, y: 0 }, 4);
    expect(result.tracePointCount).toBe(4);
    expect(result.traceStrokes.flat().map((point) => point.x)).toEqual([6, 7, 8, 9]);
  });
});
