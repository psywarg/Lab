// src/utils/phones/tools/speaker.ts
// Signal generation and routing rules for the speaker test.

export type SpeakerChannel = "stereo" | "mono" | "left" | "right";
export type NoiseSignal = "pink" | "white" | "brown";

/**
 * Fills `channel` with noise. White is uniform; brown is integrated white
 * (bass-heavy); pink uses Paul Kellet's filter (equal energy per octave).
 */
export function fillNoise(
  channel: Float32Array,
  type: NoiseSignal,
  random: () => number = Math.random,
): void {
  const length = channel.length;
  if (type === "white") {
    for (let index = 0; index < length; index += 1) {
      channel[index] = random() * 2 - 1;
    }
    return;
  }

  if (type === "brown") {
    let lastOut = 0;
    for (let index = 0; index < length; index += 1) {
      const white = random() * 2 - 1;
      lastOut = (lastOut + 0.02 * white) / 1.02;
      channel[index] = lastOut * 3.5;
    }
    return;
  }

  let b0 = 0;
  let b1 = 0;
  let b2 = 0;
  let b3 = 0;
  let b4 = 0;
  let b5 = 0;
  let b6 = 0;
  for (let index = 0; index < length; index += 1) {
    const white = random() * 2 - 1;
    b0 = 0.99886 * b0 + white * 0.0555179;
    b1 = 0.99332 * b1 + white * 0.0750759;
    b2 = 0.969 * b2 + white * 0.153852;
    b3 = 0.8665 * b3 + white * 0.3104856;
    b4 = 0.55 * b4 + white * 0.5329522;
    b5 = -0.7616 * b5 - white * 0.016898;
    channel[index] = (b0 + b1 + b2 + b3 + b4 + b5 + b6 + white * 0.5362) * 0.11;
    b6 = white * 0.115926;
  }
}

/** StereoPanner position for a fixed channel; stereo alternates elsewhere. */
export function panForChannel(channel: SpeakerChannel): number {
  if (channel === "left") return -1;
  if (channel === "right") return 1;
  return 0;
}

/**
 * Gain to apply before the panner. Its equal-power law plays a centred mono
 * source 3 dB lower on each side than a fully panned one, so Mono gets the
 * 3 dB back.
 */
export function channelGain(gain: number, channel: SpeakerChannel, hasPanner: boolean): number {
  return hasPanner && channel === "mono" ? gain * Math.SQRT2 : gain;
}

/** `count` frequencies spaced evenly on a log scale from `min` to `max` Hz. */
export function hearingSteps(min = 20, max = 20000, count = 20): number[] {
  return Array.from({ length: count }, (_, index) =>
    Math.round(min * (max / min) ** (index / (count - 1))),
  );
}

/** Milliseconds as "m:ss", rounded up. */
export function formatClock(ms: number): string {
  const totalSeconds = Math.max(0, Math.ceil(ms / 1000));
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;
  return `${minutes}:${String(seconds).padStart(2, "0")}`;
}
