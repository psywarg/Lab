// src/utils/phones/tools/stuckPixel.ts
// Decision logic for the stuck pixel fixer: defect diagnosis from the
// colours a mark was seen on, tap clustering, the Auto repair queue, and
// the flash-speed limits.

export type InspectColorId =
  | "black"
  | "white"
  | "red"
  | "green"
  | "blue"
  | "cyan"
  | "magenta"
  | "yellow"
  | "midGrey"
  | "darkGrey";

export type Channel = "red" | "green" | "blue";
export type DefectClassification =
  | "stuck-on"
  | "stuck-off"
  | "hot"
  | "dead"
  | "persistent-mark"
  | "uneven-patch"
  | "unclear";
export type DefectObservation = {
  color: InspectColorId;
  visible: boolean;
};
export type ClassificationConfidence = "strong" | "likely" | "unclear";
export type DefectMatch = {
  classification: DefectClassification;
  channels: Channel[];
  /** Test colours whose response matched this defect. */
  matchScore: number;
  /** Test colours that count for this defect (faint responses are left out). */
  scoredCount: number;
};
export type ClassificationResult = DefectMatch & {
  confidence: ClassificationConfidence;
  /** For an unclear result, the defect it came closest to. */
  closest?: DefectMatch;
};
export type DiagnosisMark = ClassificationResult & {
  x: number;
  y: number;
  observations: DefectObservation[];
};

export type DiagnosisColor = { id: InspectColorId; label: string; hex: string };

export const QUICK_DIAGNOSIS_COLORS: DiagnosisColor[] = [
  { id: "black", label: "Black", hex: "#000000" },
  { id: "white", label: "White", hex: "#ffffff" },
  { id: "red", label: "Red", hex: "#ff0000" },
  { id: "green", label: "Green", hex: "#00ff00" },
  { id: "blue", label: "Blue", hex: "#0000ff" },
];

export const DEEP_DIAGNOSIS_COLORS: DiagnosisColor[] = [
  { id: "cyan", label: "Cyan", hex: "#00ffff" },
  { id: "magenta", label: "Magenta", hex: "#ff00ff" },
  { id: "yellow", label: "Yellow", hex: "#ffff00" },
  { id: "midGrey", label: "Mid grey", hex: "#808080" },
  { id: "darkGrey", label: "Dark grey", hex: "#101010" },
];

export const ALL_DIAGNOSIS_COLORS: InspectColorId[] = [
  ...QUICK_DIAGNOSIS_COLORS,
  ...DEEP_DIAGNOSIS_COLORS,
].map((color) => color.id);

/** How strongly each test colour drives each subpixel (0 off, 1 full). */
export const TEST_COLOR_LEVELS: Record<InspectColorId, Record<Channel, number>> = {
  black: { red: 0, green: 0, blue: 0 },
  white: { red: 1, green: 1, blue: 1 },
  red: { red: 1, green: 0, blue: 0 },
  green: { red: 0, green: 1, blue: 0 },
  blue: { red: 0, green: 0, blue: 1 },
  cyan: { red: 0, green: 1, blue: 1 },
  magenta: { red: 1, green: 0, blue: 1 },
  yellow: { red: 1, green: 1, blue: 0 },
  midGrey: { red: 0.5, green: 0.5, blue: 0.5 },
  darkGrey: { red: 0.063, green: 0.063, blue: 0.063 },
};

export const CHANNELS: Channel[] = ["red", "green", "blue"];
const CHANNEL_GROUPS: Channel[][] = [
  ["red"],
  ["green"],
  ["blue"],
  ["red", "green"],
  ["red", "blue"],
  ["green", "blue"],
  ["red", "green", "blue"],
];

type DefectHypothesis = {
  classification: DefectClassification;
  channels: Channel[];
  pattern: Record<InspectColorId, boolean>;
  /** Colours where the expected response is clear enough to judge by eye. */
  scored: Record<InspectColorId, boolean>;
};

/**
 * A fault that changes a subpixel by less than this share of its range is
 * too faint to judge by eye (a dark subpixel on 6% dark grey), so that
 * colour does not count for or against the defect.
 */
export const MIN_JUDGEABLE_CHANGE = 0.25;

/**
 * On which test colours a fault would be visible. A subpixel stuck on shows
 * wherever the colour does not already drive it fully; one stuck off shows
 * wherever the colour drives it at all.
 */
/** How much a fault changes the brightest affected subpixel on each colour (0-1). */
function faultChange(channels: Channel[], stuckOn: boolean): Record<InspectColorId, number> {
  return Object.fromEntries(
    ALL_DIAGNOSIS_COLORS.map((color) => [
      color,
      Math.max(
        ...channels.map((channel) =>
          stuckOn ? 1 - TEST_COLOR_LEVELS[color][channel] : TEST_COLOR_LEVELS[color][channel],
        ),
      ),
    ]),
  ) as Record<InspectColorId, number>;
}

export function visibilityPattern(
  channels: Channel[],
  stuckOn: boolean,
): Record<InspectColorId, boolean> {
  const change = faultChange(channels, stuckOn);
  return Object.fromEntries(
    ALL_DIAGNOSIS_COLORS.map((color) => [color, change[color] > 0]),
  ) as Record<InspectColorId, boolean>;
}

/** Colours to score: no change at all, or a change of at least MIN_JUDGEABLE_CHANGE. */
function judgeableColors(channels: Channel[], stuckOn: boolean): Record<InspectColorId, boolean> {
  const change = faultChange(channels, stuckOn);
  return Object.fromEntries(
    ALL_DIAGNOSIS_COLORS.map((color) => [
      color,
      change[color] === 0 || change[color] >= MIN_JUDGEABLE_CHANGE,
    ]),
  ) as Record<InspectColorId, boolean>;
}

const EVERY_COLOR = Object.fromEntries(
  ALL_DIAGNOSIS_COLORS.map((color) => [color, true]),
) as Record<InspectColorId, boolean>;

const DEFECT_HYPOTHESES: DefectHypothesis[] = [
  ...CHANNEL_GROUPS.map((channels) => ({
    classification:
      channels.length === CHANNELS.length ? ("hot" as const) : ("stuck-on" as const),
    channels,
    pattern: visibilityPattern(channels, true),
    scored: judgeableColors(channels, true),
  })),
  ...CHANNEL_GROUPS.map((channels) => ({
    classification:
      channels.length === CHANNELS.length ? ("dead" as const) : ("stuck-off" as const),
    channels,
    pattern: visibilityPattern(channels, false),
    scored: judgeableColors(channels, false),
  })),
  {
    classification: "persistent-mark",
    channels: [],
    pattern: EVERY_COLOR,
    scored: EVERY_COLOR,
  },
  {
    classification: "uneven-patch",
    channels: [],
    pattern: Object.fromEntries(
      ALL_DIAGNOSIS_COLORS.map((color) => [
        color,
        color === "midGrey" || color === "darkGrey",
      ]),
    ) as Record<InspectColorId, boolean>,
    scored: EVERY_COLOR,
  },
];

type RankedHypothesis = {
  hypothesis: DefectHypothesis;
  matches: number;
  scoredCount: number;
  /** Scored colours whose response did not match. */
  misses: number;
};

/** Every hypothesis, fewest misses first; on equal misses, the one judged on more colours. */
function rankHypotheses(observations: DefectObservation[]): RankedHypothesis[] {
  const byColor = new Map(
    observations.map((observation) => [observation.color, observation.visible]),
  );
  return DEFECT_HYPOTHESES.map((hypothesis) => {
    const colors = ALL_DIAGNOSIS_COLORS.filter((color) => hypothesis.scored[color]);
    const matches = colors.filter(
      (color) => Boolean(byColor.get(color)) === hypothesis.pattern[color],
    ).length;
    return { hypothesis, matches, scoredCount: colors.length, misses: colors.length - matches };
  }).sort((left, right) => left.misses - right.misses || right.scoredCount - left.scoredCount);
}

const toMatch = ({ hypothesis, matches, scoredCount }: RankedHypothesis): DefectMatch => ({
  classification: hypothesis.classification,
  channels: [...hypothesis.channels],
  matchScore: matches,
  scoredCount,
});

/** Above this many misses a mark is unclear; above MAX_STRONG_MISSES it is at best likely. */
const MAX_LIKELY_MISSES = 3;
const MAX_STRONG_MISSES = 1;

/**
 * Scores every defect hypothesis on the test colours where its response is
 * clear enough to judge. More than 3 misses, or a tie with more than 1
 * miss, is unclear; at most 1 miss with a clear lead is strong.
 */
export function classifyObservations(
  observations: DefectObservation[],
): ClassificationResult {
  const ranked = rankHypotheses(observations);
  const best = ranked[0];
  if (!best) {
    return { classification: "unclear", channels: [], confidence: "unclear", matchScore: 0, scoredCount: 0 };
  }
  const margin = (ranked[1]?.misses ?? Number.POSITIVE_INFINITY) - best.misses;

  if (best.misses > MAX_LIKELY_MISSES || (best.misses > MAX_STRONG_MISSES && margin === 0)) {
    return {
      classification: "unclear",
      channels: [],
      confidence: "unclear",
      matchScore: best.matches,
      scoredCount: best.scoredCount,
      closest: toMatch(best),
    };
  }

  return {
    ...toMatch(best),
    confidence: best.misses <= MAX_STRONG_MISSES && margin >= 1 ? "strong" : "likely",
  };
}

/**
 * Test colours worth asking about again for one mark: where the best
 * defect disagrees with any defect within one miss of it, the colours that
 * separate the most rivals first. Empty when the lead is clear, or when the
 * responses are too far from any defect for a few answers to settle it.
 */
export function followUpColors(observations: DefectObservation[], max = 4): InspectColorId[] {
  const ranked = rankHypotheses(observations);
  const best = ranked[0];
  if (!best || best.misses > MAX_LIKELY_MISSES) return [];
  const rivals = ranked.slice(1).filter((entry) => entry.misses <= best.misses + 1);
  return ALL_DIAGNOSIS_COLORS.map((color) => ({
    color,
    separates: best.hypothesis.scored[color]
      ? rivals.filter(
          (rival) =>
            rival.hypothesis.scored[color] &&
            rival.hypothesis.pattern[color] !== best.hypothesis.pattern[color],
        ).length
      : 0,
  }))
    .filter((entry) => entry.separates > 0)
    .sort((left, right) => right.separates - left.separates)
    .slice(0, max)
    .map((entry) => entry.color);
}

/** Observations with some colours re-answered (a follow-up answer replaces the first one). */
export function withAnswers(
  observations: DefectObservation[],
  answers: Partial<Record<InspectColorId, boolean>>,
): DefectObservation[] {
  return observations.map((observation) => ({
    ...observation,
    visible: answers[observation.color] ?? observation.visible,
  }));
}

export function observationsForColors(
  colors: Set<InspectColorId>,
): DefectObservation[] {
  return ALL_DIAGNOSIS_COLORS.map((color) => ({
    color,
    visible: colors.has(color),
  }));
}

export function channelList(channels: Channel[]): string {
  if (channels.length === 0) return "";
  if (channels.length === 1) return channels[0] ?? "";
  return `${channels.slice(0, -1).join(", ")} and ${channels.at(-1)}`;
}

export function classificationShortLabel(mark: DiagnosisMark): string {
  const channels = channelList(mark.channels);
  switch (mark.classification) {
    case "stuck-on":
      return `Bright ${channels} subpixel${mark.channels.length === 1 ? "" : "s"}`;
    case "stuck-off":
      return `Dark ${channels} subpixel${mark.channels.length === 1 ? "" : "s"}`;
    case "hot":
      return "Hot pixel";
    case "dead":
      return "Dead pixel";
    case "persistent-mark":
      return "Surface or panel mark";
    case "uneven-patch":
      return "Uneven panel patch";
    default:
      return "Unclear pattern";
  }
}

const REPAIRABLE: readonly DefectClassification[] = ["stuck-on", "stuck-off", "hot"];

/**
 * Faults pixel flashing may help: a subpixel or whole pixel stuck in one
 * state. Dead pixels, surface marks, uneven patches and unclear results are
 * explained but not flashed.
 */
export function isRepairable(mark: Pick<DiagnosisMark, "classification">): boolean {
  return REPAIRABLE.includes(mark.classification);
}

/** Patterns Auto runs for a mark: Static Noise for a repairable fault, nothing otherwise. */
export function autoPatternIdsForMark(mark: DiagnosisMark): string[] {
  return isRepairable(mark) ? ["static"] : [];
}

export function diagnosisDescription(
  mark: DiagnosisMark,
  patternLabel: (patternId: string) => string,
): string {
  const confidence = mark.confidence === "strong" ? "Strong" : "Likely";
  const match = `${mark.matchScore}/${mark.scoredCount} color responses matched`;
  const patterns = autoPatternIdsForMark(mark).map(patternLabel).join(", then ");

  switch (mark.classification) {
    case "stuck-on":
      return `${confidence} bright ${channelList(mark.channels)} subpixel fault. ${match}. Auto will run ${patterns}.`;
    case "stuck-off":
      return `${confidence} dark ${channelList(mark.channels)} subpixel fault. ${match}. Auto will run ${patterns}.`;
    case "hot":
      return `${confidence} hot pixel with all three subpixels staying on. ${match}. Auto will run ${patterns}.`;
    case "dead":
      return `${confidence} dead pixel with all three subpixels staying off. ${match}. Software can't revive a pixel that stays off, so Auto skips it. If the phone is under warranty, ask the manufacturer about its dead-pixel policy.`;
    case "persistent-mark":
      return `${confidence} surface or panel mark rather than a pixel response. ${match}. Auto skips it. Clean the screen and diagnose again.`;
    case "uneven-patch":
      return `${confidence} uneven panel patch visible mainly on grey. ${match}. Pixel flashing doesn't fix panel patches, so Auto skips it.`;
    default: {
      const closest = mark.closest
        ? ` Closest match: ${classificationShortLabel({ ...mark, ...mark.closest }).toLowerCase()} (${mark.closest.matchScore}/${mark.closest.scoredCount}).`
        : "";
      return `The marked responses did not match one defect pattern closely enough.${closest} Auto skips it. Diagnose again, or try Manual Override.`;
    }
  }
}

// --- Taps -----------------------------------------------------------------

export type StepTap = {
  x: number;
  y: number;
  colorId: InspectColorId;
  matchRadiusPx: number;
};

type PointerLike = Pick<PointerEvent, "width" | "height" | "pointerType">;

/** How far a tap may be from a mark and still count, by input type. */
export function pointerMatchRadius(event: PointerLike): number {
  const contactRadius = Math.max(event.width, event.height) / 2;
  const minimum = event.pointerType === "touch" ? 24 : event.pointerType === "pen" ? 12 : 10;
  const maximum = event.pointerType === "touch" ? 44 : event.pointerType === "pen" ? 24 : 16;
  const positioningAllowance =
    event.pointerType === "touch" ? 14 : event.pointerType === "pen" ? 8 : 6;
  return Math.min(maximum, Math.max(minimum, contactRadius + positioningAllowance));
}

/**
 * Groups taps (in 0-1 stage coordinates) into marks. A tap joins the
 * nearest mark within both radii combined, capped at 56 px.
 */
export function clusterTaps(
  taps: StepTap[],
  width: number,
  height: number,
): { x: number; y: number; colors: Set<InspectColorId> }[] {
  const clusters: {
    x: number;
    y: number;
    count: number;
    markRadiusPx: number;
    colors: Set<InspectColorId>;
  }[] = [];

  taps.forEach((tap) => {
    let nearestIndex = -1;
    let nearestDistancePx = Number.POSITIVE_INFINITY;
    clusters.forEach((cluster, clusterIndex) => {
      const distancePx = Math.hypot((cluster.x - tap.x) * width, (cluster.y - tap.y) * height);
      const matchDistancePx = Math.min(56, cluster.markRadiusPx + tap.matchRadiusPx);
      if (distancePx <= matchDistancePx && distancePx < nearestDistancePx) {
        nearestIndex = clusterIndex;
        nearestDistancePx = distancePx;
      }
    });

    const cluster = clusters[nearestIndex];
    if (!cluster) {
      clusters.push({
        x: tap.x,
        y: tap.y,
        count: 1,
        markRadiusPx: tap.matchRadiusPx,
        colors: new Set([tap.colorId]),
      });
      return;
    }
    cluster.x = (cluster.x * cluster.count + tap.x) / (cluster.count + 1);
    cluster.y = (cluster.y * cluster.count + tap.y) / (cluster.count + 1);
    cluster.count += 1;
    cluster.markRadiusPx = Math.max(cluster.markRadiusPx, tap.matchRadiusPx);
    cluster.colors.add(tap.colorId);
  });

  return clusters.map(({ x, y, colors }) => ({ x, y, colors }));
}

// --- Auto repair queue ----------------------------------------------------

export type AutoRepairItem = {
  durationSeconds: number;
  label: string;
  markIndex: number;
  phaseIndex: number;
  phaseCount: number;
  patternId: string;
  result: DiagnosisMark;
};

/** One phase per pattern per mark; the last phase takes any rounding remainder. */
export function buildAutoRepairQueue(
  marks: DiagnosisMark[],
  defaultDurationSeconds: number,
): AutoRepairItem[] {
  return marks.flatMap((result, markIndex) => {
    const patternIds = autoPatternIdsForMark(result);
    const baseDuration = Math.floor(defaultDurationSeconds / patternIds.length);
    return patternIds.map((patternId, phaseIndex) => ({
      durationSeconds:
        phaseIndex === patternIds.length - 1
          ? defaultDurationSeconds - baseDuration * phaseIndex
          : baseDuration,
      label: `Mark ${markIndex + 1}`,
      markIndex,
      phaseIndex,
      phaseCount: patternIds.length,
      patternId,
      result,
    }));
  });
}

// --- Checking the result ---------------------------------------------------

/**
 * The test colour that shows a mark most clearly, for checking after a run:
 * black for a subpixel or pixel stuck on, the subpixel's own colour (or
 * white for several) for one stuck off. Falls back to a colour the mark was
 * actually seen on during Diagnose.
 */
export function checkColorForMark(mark: DiagnosisMark): InspectColorId {
  const seen = mark.observations.filter((observation) => observation.visible).map((observation) => observation.color);
  const preferred: InspectColorId | undefined =
    mark.classification === "stuck-on" || mark.classification === "hot"
      ? "black"
      : mark.classification === "stuck-off" && mark.channels.length === 1
        ? mark.channels[0]
        : mark.classification === "stuck-off"
          ? "white"
          : undefined;
  if (preferred && (seen.length === 0 || seen.includes(preferred))) return preferred;
  return seen[0] ?? preferred ?? "white";
}

export type CheckOutcome = "fixed" | "persists";

/** Mark indexes by outcome, in mark order. */
export function summarizeCheck(results: ReadonlyMap<number, CheckOutcome>): { fixed: number[]; persists: number[] } {
  const ordered = [...results].sort(([left], [right]) => left - right);
  return {
    fixed: ordered.filter(([, outcome]) => outcome === "fixed").map(([index]) => index),
    persists: ordered.filter(([, outcome]) => outcome === "persists").map(([index]) => index),
  };
}

/** "#2", "#2 and #3", "#1, #2 and #4". */
export function markNumberList(markIndexes: readonly number[]): string {
  const numbers = markIndexes.map((index) => `#${index + 1}`);
  if (numbers.length <= 1) return numbers.join("");
  return `${numbers.slice(0, -1).join(", ")} and ${numbers.at(-1)}`;
}

/** Lengths offered for a second, longer round on marks still visible. */
export const LONGER_ROUND_MINUTES = [10, 20] as const;

export function autoMarkDurationSeconds(queue: AutoRepairItem[], markIndex: number): number {
  return queue
    .filter((item) => item.markIndex === markIndex)
    .reduce((total, item) => total + item.durationSeconds, 0);
}

// --- Flash speed ------------------------------------------------------------

export const SPEED_RAW_MAX = 500;
export const CYCLE_MIN_DELAY_MS = 334;
export const CYCLE_MAX_DELAY_MS = 1000;
export const NOISE_MIN_DELAY_MS = 33;
export const NOISE_REDUCED_MOTION_MIN_DELAY_MS = 66;
export const NOISE_MAX_DELAY_MS = 100;
// Spots up to this diameter may cycle faster than 3 changes per second.
// WCAG 2.3.1 allows faster flashing only below 0.006 sr (25% of a 10°
// field). At 30 cm that is about a 23 mm square, or a circle about 26 mm
// across: ~165 CSS px on a phone (~6.3 CSS px/mm) and ~141 CSS px on a
// tablet at 35 cm (~4.6 CSS px/mm). This is an estimate from assumed
// viewing distances, not a flash-analyser measurement.
export const SPOT_SMALL_DIAMETER_PX = 140;
export const SPOT_CYCLE_MIN_DELAY_MS = 100;

export type SpeedContext = {
  isNoise: boolean;
  reducedMotion: boolean;
  /** Spot diameter in CSS px, or null for full screen. */
  spotDiameter: number | null;
};

/**
 * Allowed delay range between changes. Colour cycling is capped at 3/s
 * (334 ms) unless a small spot is used; reduced motion slows both.
 */
export function speedRange({ isNoise, reducedMotion, spotDiameter }: SpeedContext): {
  min: number;
  max: number;
} {
  if (isNoise) {
    return {
      min: reducedMotion ? NOISE_REDUCED_MOTION_MIN_DELAY_MS : NOISE_MIN_DELAY_MS,
      max: NOISE_MAX_DELAY_MS,
    };
  }
  const isSmallSpot = spotDiameter !== null && spotDiameter <= SPOT_SMALL_DIAMETER_PX;
  const cycleMin = isSmallSpot ? SPOT_CYCLE_MIN_DELAY_MS : CYCLE_MIN_DELAY_MS;
  return {
    min: reducedMotion ? CYCLE_MAX_DELAY_MS : cycleMin,
    max: CYCLE_MAX_DELAY_MS,
  };
}

/** Maps the speed slider (0 slow to SPEED_RAW_MAX fast) onto the range. */
export function delayFromSpeed(raw: number, range: { min: number; max: number }): number {
  const fraction = raw / SPEED_RAW_MAX;
  return Math.round(range.max - fraction * (range.max - range.min));
}

export function defaultDelayMs(isNoise: boolean): number {
  return isNoise ? NOISE_MAX_DELAY_MS : CYCLE_MAX_DELAY_MS;
}

// --- Misc -----------------------------------------------------------------

/** Fast deterministic noise source (xorshift32). */
export function createXorshift32(seed = 0x2f6e2b1d): () => number {
  let state = seed;
  return () => {
    state ^= state << 13;
    state ^= state >>> 17;
    state ^= state << 5;
    return state >>> 0;
  };
}

/** Seconds as "mm:ss". */
export function formatTime(seconds: number): string {
  const mins = Math.floor(seconds / 60)
    .toString()
    .padStart(2, "0");
  const secs = Math.max(0, seconds % 60)
    .toString()
    .padStart(2, "0");
  return `${mins}:${secs}`;
}
