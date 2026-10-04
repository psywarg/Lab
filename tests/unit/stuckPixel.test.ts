import { describe, expect, it } from "vitest";
import {
  ALL_DIAGNOSIS_COLORS,
  CYCLE_MAX_DELAY_MS,
  CYCLE_MIN_DELAY_MS,
  NOISE_MIN_DELAY_MS,
  NOISE_REDUCED_MOTION_MIN_DELAY_MS,
  SPEED_RAW_MAX,
  SPOT_CYCLE_MIN_DELAY_MS,
  autoMarkDurationSeconds,
  buildAutoRepairQueue,
  channelList,
  classificationShortLabel,
  classifyObservations,
  clusterTaps,
  createXorshift32,
  delayFromSpeed,
  diagnosisDescription,
  formatTime,
  observationsForColors,
  pointerMatchRadius,
  speedRange,
  type DiagnosisMark,
  type InspectColorId,
  type StepTap,
} from "@/utils/phones/tools/stuckPixel";

const seenOn = (...colors: InspectColorId[]) => classifyObservations(observationsForColors(new Set(colors)));
const allBut = (...hidden: InspectColorId[]) =>
  ALL_DIAGNOSIS_COLORS.filter((color) => !hidden.includes(color));

describe("classifyObservations", () => {
  it("finds a red subpixel stuck on from where it shows", () => {
    // Visible wherever red is not already fully on.
    const result = seenOn("black", "green", "blue", "cyan", "midGrey", "darkGrey");
    expect(result).toMatchObject({ classification: "stuck-on", channels: ["red"], confidence: "strong", matchScore: 10 });
  });

  it("separates hot, dead and surface marks", () => {
    expect(seenOn(...allBut("white")).classification).toBe("hot");
    expect(seenOn(...allBut("black")).classification).toBe("dead");
    expect(seenOn(...ALL_DIAGNOSIS_COLORS).classification).toBe("persistent-mark");
    expect(seenOn("midGrey", "darkGrey").classification).toBe("uneven-patch");
  });

  it("reports unclear when no hypothesis matches well", () => {
    expect(seenOn("white", "red", "cyan", "midGrey")).toMatchObject({ classification: "unclear", confidence: "unclear" });
  });
});

describe("labels", () => {
  const mark = (overrides: Partial<DiagnosisMark>): DiagnosisMark => ({
    x: 0.5,
    y: 0.5,
    observations: [],
    classification: "stuck-on",
    channels: ["red", "green"],
    confidence: "strong",
    matchScore: 10,
    ...overrides,
  });

  it("lists channels and describes the result", () => {
    expect(channelList(["red", "green", "blue"])).toBe("red, green and blue");
    expect(classificationShortLabel(mark({}))).toBe("Bright red and green subpixels");
    expect(diagnosisDescription(mark({}), () => "Static Noise")).toBe(
      "Strong bright red and green subpixel fault. 10/10 color responses matched. Auto will run Static Noise.",
    );
  });
});

describe("clusterTaps", () => {
  const tap = (x: number, y: number, colorId: InspectColorId = "white"): StepTap => ({ x, y, colorId, matchRadiusPx: 24 });

  it("merges taps on the same spot and keeps distant ones apart", () => {
    // 1000x1000 stage: taps 10 px apart merge, 200 px apart do not.
    const clusters = clusterTaps([tap(0.5, 0.5), tap(0.51, 0.5, "black"), tap(0.7, 0.5)], 1000, 1000);
    expect(clusters).toHaveLength(2);
    expect(clusters[0]?.colors).toEqual(new Set(["white", "black"]));
    expect(clusters[0]?.x).toBeCloseTo(0.505, 6);
  });

  it("never merges beyond 56 px, however large the radii", () => {
    const big = (x: number): StepTap => ({ x, y: 0.5, colorId: "white", matchRadiusPx: 44 });
    expect(clusterTaps([big(0.5), big(0.557)], 1000, 1000)).toHaveLength(2);
    expect(clusterTaps([big(0.5), big(0.555)], 1000, 1000)).toHaveLength(1);
  });
});

describe("pointerMatchRadius", () => {
  it("scales with contact size within per-input limits", () => {
    expect(pointerMatchRadius({ width: 20, height: 20, pointerType: "touch" })).toBe(24);
    expect(pointerMatchRadius({ width: 200, height: 200, pointerType: "touch" })).toBe(44);
    expect(pointerMatchRadius({ width: 1, height: 1, pointerType: "mouse" })).toBe(10);
  });
});

describe("speedRange (H11 flash limits)", () => {
  const cycle = { isNoise: false, reducedMotion: false };

  it("caps colour cycling at 3 changes/s except for spots of 140 px or less", () => {
    expect(speedRange({ ...cycle, spotDiameter: null }).min).toBe(CYCLE_MIN_DELAY_MS);
    expect(speedRange({ ...cycle, spotDiameter: 160 }).min).toBe(CYCLE_MIN_DELAY_MS);
    expect(speedRange({ ...cycle, spotDiameter: 140 }).min).toBe(SPOT_CYCLE_MIN_DELAY_MS);
    expect(1000 / CYCLE_MIN_DELAY_MS).toBeLessThanOrEqual(3);
  });

  it("slows everything under reduced motion", () => {
    expect(speedRange({ isNoise: false, reducedMotion: true, spotDiameter: 100 }).min).toBe(CYCLE_MAX_DELAY_MS);
    expect(speedRange({ isNoise: true, reducedMotion: true, spotDiameter: null }).min).toBe(
      NOISE_REDUCED_MOTION_MIN_DELAY_MS,
    );
    expect(speedRange({ isNoise: true, reducedMotion: false, spotDiameter: null }).min).toBe(NOISE_MIN_DELAY_MS);
  });

  it("maps the slider from slowest to fastest", () => {
    const range = { min: 334, max: 1000 };
    expect(delayFromSpeed(0, range)).toBe(1000);
    expect(delayFromSpeed(SPEED_RAW_MAX, range)).toBe(334);
    expect(delayFromSpeed(SPEED_RAW_MAX / 2, range)).toBe(667);
  });
});

describe("buildAutoRepairQueue", () => {
  it("gives each mark the full duration and labels it", () => {
    const mark = { x: 0, y: 0, observations: [], classification: "dead", channels: [], confidence: "likely", matchScore: 9 } as DiagnosisMark;
    const queue = buildAutoRepairQueue([mark, mark], 300);
    expect(queue.map((item) => [item.label, item.patternId, item.durationSeconds])).toEqual([
      ["Mark 1", "static", 300],
      ["Mark 2", "static", 300],
    ]);
    expect(autoMarkDurationSeconds(queue, 1)).toBe(300);
  });
});

describe("utilities", () => {
  it("formats mm:ss", () => {
    expect(formatTime(125)).toBe("02:05");
    expect(formatTime(0)).toBe("00:00");
  });

  it("produces a repeatable non-zero sequence", () => {
    const a = createXorshift32(7);
    const b = createXorshift32(7);
    const first = [a(), a(), a()];
    expect([b(), b(), b()]).toEqual(first);
    expect(first.every((value) => value > 0 && value < 2 ** 32)).toBe(true);
  });
});
