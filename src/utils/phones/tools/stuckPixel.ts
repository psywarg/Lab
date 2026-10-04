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
export type ClassificationResult = {
  classification: DefectClassification;
  channels: Channel[];
  confidence: ClassificationConfidence;
  matchScore: number;
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
};

/**
 * On which test colours a fault would be visible. A subpixel stuck on shows
 * wherever the colour does not already drive it fully; one stuck off shows
 * wherever the colour drives it at all.
 */
export function visibilityPattern(
  channels: Channel[],
  stuckOn: boolean,
): Record<InspectColorId, boolean> {
  return Object.fromEntries(
    ALL_DIAGNOSIS_COLORS.map((color) => {
      const visible = channels.some((channel) =>
        stuckOn
          ? TEST_COLOR_LEVELS[color][channel] < 1
          : TEST_COLOR_LEVELS[color][channel] > 0,
      );
      return [color, visible];
    }),
  ) as Record<InspectColorId, boolean>;
}

const DEFECT_HYPOTHESES: DefectHypothesis[] = [
  ...CHANNEL_GROUPS.map((channels) => ({
    classification:
      channels.length === CHANNELS.length ? ("hot" as const) : ("stuck-on" as const),
    channels,
    pattern: visibilityPattern(channels, true),
  })),
  ...CHANNEL_GROUPS.map((channels) => ({
    classification:
      channels.length === CHANNELS.length ? ("dead" as const) : ("stuck-off" as const),
    channels,
    pattern: visibilityPattern(channels, false),
  })),
  {
    classification: "persistent-mark",
    channels: [],
    pattern: Object.fromEntries(
      ALL_DIAGNOSIS_COLORS.map((color) => [color, true]),
    ) as Record<InspectColorId, boolean>,
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
  },
];

/**
 * Scores every defect hypothesis by how many of the 10 test colours match
 * what was seen. Below 7 matches, or a tie below 9, the result is unclear.
 */
export function classifyObservations(
  observations: DefectObservation[],
): ClassificationResult {
  const byColor = new Map(
    observations.map((observation) => [observation.color, observation.visible]),
  );
  const scored = DEFECT_HYPOTHESES.map((hypothesis) => ({
    hypothesis,
    score: ALL_DIAGNOSIS_COLORS.reduce(
      (score, color) =>
        score + (Boolean(byColor.get(color)) === hypothesis.pattern[color] ? 1 : 0),
      0,
    ),
  })).sort((left, right) => right.score - left.score);
  const best = scored[0];
  const runnerUp = scored[1];
  const margin = (best?.score ?? 0) - (runnerUp?.score ?? 0);

  if (!best || best.score < 7 || (best.score < 9 && margin === 0)) {
    return {
      classification: "unclear",
      channels: [],
      confidence: "unclear",
      matchScore: best?.score ?? 0,
    };
  }

  return {
    classification: best.hypothesis.classification,
    channels: [...best.hypothesis.channels],
    confidence: best.score >= 9 && margin >= 1 ? "strong" : "likely",
    matchScore: best.score,
  };
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

/** Patterns Auto runs for a mark. Every defect type currently gets Static Noise. */
export function autoPatternIdsForMark(_mark: DiagnosisMark): string[] {
  return ["static"];
}

export function diagnosisDescription(
  mark: DiagnosisMark,
  patternLabel: (patternId: string) => string,
): string {
  const confidence = mark.confidence === "strong" ? "Strong" : "Likely";
  const match = `${mark.matchScore}/10 color responses matched`;
  const patterns = autoPatternIdsForMark(mark).map(patternLabel).join(", then ");

  switch (mark.classification) {
    case "stuck-on":
      return `${confidence} bright ${channelList(mark.channels)} subpixel fault. ${match}. Auto will run ${patterns}.`;
    case "stuck-off":
      return `${confidence} dark ${channelList(mark.channels)} subpixel fault. ${match}. Auto will run ${patterns}.`;
    case "hot":
      return `${confidence} hot pixel with all three subpixels staying on. ${match}. Auto will run ${patterns}.`;
    case "dead":
      return `${confidence} dead pixel with all three subpixels staying off. ${match}. Software repair is unlikely to help, so Auto only makes one Static Noise attempt.`;
    case "persistent-mark":
      return `${confidence} surface or panel mark rather than a pixel response. ${match}. Clean the screen and diagnose again. Auto only makes one Static Noise attempt.`;
    case "uneven-patch":
      return `${confidence} uneven panel patch visible mainly on grey. ${match}. This is unlikely to respond to pixel cycling, so Auto only makes one Static Noise attempt.`;
    default:
      return `The marked responses did not match one defect pattern closely enough. Auto will run Static Noise once. Diagnose again if the same point remains visible.`;
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
