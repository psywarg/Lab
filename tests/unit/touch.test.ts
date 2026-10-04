import { describe, expect, it } from "vitest";
import {
  createCoverageGrid,
  createPointerRateTracker,
  formatInputReadout,
  gradePrecision,
  gridSizeFor,
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
