import { describe, expect, it } from "vitest";
import { strokeWaveform } from "@/utils/phones/tools/audio";
import { finiteNumber } from "@/utils/phones/tools/motion";
import {
  SHOW_CONTROLS_EVENT,
  isFullscreenActive,
  showRuntimeControls,
} from "@/utils/phones/tools/runtimeShell";
import { median } from "@/utils/phones/tools/stats";

describe("median", () => {
  it("handles odd, even and empty lists without changing the input", () => {
    const values = [5, 1, 3];
    expect(median(values)).toBe(3);
    expect(values).toEqual([5, 1, 3]);
    expect(median([4, 1, 3, 2])).toBe(2.5);
    expect(median([])).toBeNull();
  });
});

describe("finiteNumber", () => {
  it("keeps finite numbers and drops the rest", () => {
    expect(finiteNumber(0)).toBe(0);
    expect(finiteNumber(-9.8)).toBe(-9.8);
    expect(finiteNumber(Number.NaN)).toBeNull();
    expect(finiteNumber(Number.POSITIVE_INFINITY)).toBeNull();
    expect(finiteNumber(null)).toBeNull();
    expect(finiteNumber(undefined)).toBeNull();
  });
});

describe("runtime shell helpers", () => {
  it("dispatches a bubbling show-controls event", () => {
    const target = new EventTarget();
    const seen: Event[] = [];
    target.addEventListener(SHOW_CONTROLS_EVENT, (event) => seen.push(event));
    showRuntimeControls(target as unknown as Element);
    showRuntimeControls(null);
    expect(seen).toHaveLength(1);
    expect(seen[0]?.bubbles).toBe(true);
  });

  it("reads the shell's fullscreen flag", () => {
    const shell = (fullscreen?: string) => ({ dataset: { fullscreen } }) as unknown as HTMLElement;
    expect(isFullscreenActive(shell("true"))).toBe(true);
    expect(isFullscreenActive(shell("false"))).toBe(false);
    expect(isFullscreenActive(null)).toBe(false);
  });
});

describe("strokeWaveform", () => {
  function recorder() {
    const points: [string, number, number][] = [];
    let strokes = 0;
    return {
      points,
      strokes: () => strokes,
      context: {
        beginPath: () => undefined,
        moveTo: (x: number, y: number) => points.push(["move", x, y]),
        lineTo: (x: number, y: number) => points.push(["line", x, y]),
        stroke: () => {
          strokes += 1;
        },
      },
    };
  }

  it("spans the width and maps -1..1 to bottom..top", () => {
    const r = recorder();
    strokeWaveform(r.context, 3, (i) => [1, 0, -1][i] ?? 0, 100, 50);
    expect(r.points).toEqual([
      ["move", 0, 0],
      ["line", 50, 25],
      ["line", 100, 50],
    ]);
    expect(r.strokes()).toBe(1);
  });

  it("draws nothing for fewer than two samples", () => {
    const r = recorder();
    strokeWaveform(r.context, 1, () => 0, 100, 50);
    expect(r.points).toEqual([]);
    expect(r.strokes()).toBe(0);
  });
});
