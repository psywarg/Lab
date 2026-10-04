// src/utils/phones/tools/audio.ts

export function getAudioContextClass(): typeof AudioContext | null {
  const withPrefix = window as Window & {
    webkitAudioContext?: typeof AudioContext;
  };
  return window.AudioContext ?? withPrefix.webkitAudioContext ?? null;
}

export function onAudioContextStateChange(
  context: AudioContext,
  callback: (state: AudioContextState) => void,
): () => void {
  function handleStateChange(): void {
    callback(context.state);
  }
  context.addEventListener("statechange", handleStateChange);
  return () => context.removeEventListener("statechange", handleStateChange);
}

let silentAudioEl: HTMLAudioElement | null = null;

function createSilentWavUrl(durationSeconds: number): string {
  const sampleRate = 8000;
  const numSamples = Math.round(sampleRate * durationSeconds);
  const dataSize = numSamples;
  const buffer = new ArrayBuffer(44 + dataSize);
  const view = new DataView(buffer);
  let offset = 0;

  function writeString(value: string): void {
    for (let i = 0; i < value.length; i += 1) {
      view.setUint8(offset + i, value.charCodeAt(i));
    }
    offset += value.length;
  }

  writeString("RIFF");
  view.setUint32(offset, 36 + dataSize, true);
  offset += 4;
  writeString("WAVE");
  writeString("fmt ");
  view.setUint32(offset, 16, true);
  offset += 4;
  view.setUint16(offset, 1, true);
  offset += 2;
  view.setUint16(offset, 1, true);
  offset += 2;
  view.setUint32(offset, sampleRate, true);
  offset += 4;
  view.setUint32(offset, sampleRate, true);
  offset += 4;
  view.setUint16(offset, 1, true);
  offset += 2;
  view.setUint16(offset, 8, true);
  offset += 2;
  writeString("data");
  view.setUint32(offset, dataSize, true);
  offset += 4;
  for (let i = 0; i < dataSize; i += 1) view.setUint8(offset + i, 128);

  return URL.createObjectURL(new Blob([buffer], { type: "audio/wav" }));
}

export function promoteAudioSession(): { stop: () => void } {
  if (typeof Audio === "undefined") return { stop: () => undefined };

  if (!silentAudioEl) {
    const url = createSilentWavUrl(1);
    const el = new Audio(url);
    el.loop = true;
    el.setAttribute("playsinline", "");
    el.preload = "auto";
    silentAudioEl = el;
  }

  const el = silentAudioEl;
  void el.play().catch(() => undefined);

  return {
    stop(): void {
      el.pause();
      el.currentTime = 0;
    },
  };
}

export const SILENCE_DBFS = -100;

export function amplitudeToDbfs(amplitude: number): number {
  if (amplitude <= 0) return SILENCE_DBFS;
  return Math.max(SILENCE_DBFS, 20 * Math.log10(amplitude));
}

export function computeRmsDbfs(timeDomainData: Float32Array): number {
  let sumSquares = 0;
  for (let index = 0; index < timeDomainData.length; index += 1) {
    const sample = timeDomainData[index] ?? 0;
    sumSquares += sample * sample;
  }
  return amplitudeToDbfs(Math.sqrt(sumSquares / timeDomainData.length));
}

export function computePeakAmplitude(timeDomainData: Float32Array): number {
  let peak = 0;
  for (let index = 0; index < timeDomainData.length; index += 1) {
    const sample = Math.abs(timeDomainData[index] ?? 0);
    if (sample > peak) peak = sample;
  }
  return peak;
}

export function detectClipping(
  timeDomainData: Float32Array,
  threshold = 0.99,
  minRunLength = 3,
): boolean {
  let run = 0;
  for (let index = 0; index < timeDomainData.length; index += 1) {
    if (Math.abs(timeDomainData[index] ?? 0) >= threshold) {
      run += 1;
      if (run >= minRunLength) return true;
    } else {
      run = 0;
    }
  }
  return false;
}

export function measureNoiseFloor(analyser: AnalyserNode): number {
  const data = new Float32Array(analyser.fftSize);
  analyser.getFloatTimeDomainData(data);
  return computeRmsDbfs(data);
}

export function percentile(values: number[], fraction: number): number {
  if (values.length === 0) return SILENCE_DBFS;
  const sorted = [...values].sort((a, b) => a - b);
  const index = Math.min(
    sorted.length - 1,
    Math.max(0, Math.round((sorted.length - 1) * fraction)),
  );
  return sorted[index] ?? SILENCE_DBFS;
}

export type FrequencyBand = {
  startBin: number;
  endBin: number;
};

export function createLogBands(
  bandCount: number,
  minHz: number,
  maxHz: number,
  sampleRate: number,
  frequencyBinCount: number,
): FrequencyBand[] {
  const nyquist = sampleRate / 2;
  const hzPerBin = nyquist / frequencyBinCount;
  const top = Math.min(maxHz, nyquist);
  const bottom = Math.max(minHz, hzPerBin);
  const ratio = Math.log(top / bottom) / bandCount;
  const bands: FrequencyBand[] = [];

  for (let band = 0; band < bandCount; band += 1) {
    const startHz = bottom * Math.exp(ratio * band);
    const endHz = bottom * Math.exp(ratio * (band + 1));
    const startBin = Math.min(
      frequencyBinCount - 1,
      Math.floor(startHz / hzPerBin),
    );
    const endBin = Math.min(
      frequencyBinCount,
      Math.max(startBin + 1, Math.ceil(endHz / hzPerBin)),
    );
    bands.push({ startBin, endBin });
  }

  return bands;
}

export function averageBandLevel(
  frequencyData: Uint8Array,
  band: FrequencyBand,
): number {
  let sum = 0;
  for (let bin = band.startBin; bin < band.endBin; bin += 1) {
    sum += frequencyData[bin] ?? 0;
  }
  return sum / Math.max(1, band.endBin - band.startBin) / 255;
}

/** Volume slider range in dB. The lowest position is silence. */
export const VOLUME_MIN_DB = -60;
export const VOLUME_MAX_DB = 0;

export function volumeDbToGain(db: number): number {
  if (!Number.isFinite(db) || db <= VOLUME_MIN_DB) return 0;
  return 10 ** (Math.min(db, VOLUME_MAX_DB) / 20);
}

/** "-12 dB · 25%", where % is the signal amplitude; "Off" at the bottom. */
export function formatVolumeLabel(db: number): string {
  const gain = volumeDbToGain(db);
  if (gain === 0) return "Off";
  const percent = Math.round(gain * 100);
  return `${Math.round(db)} dB · ${percent < 1 ? "<1" : percent}%`;
}

export function rampParam(
  param: AudioParam,
  target: number,
  context: BaseAudioContext,
  seconds = 0.03,
): void {
  const now = context.currentTime;
  param.cancelScheduledValues(now);
  param.setValueAtTime(param.value, now);
  param.linearRampToValueAtTime(target, now + seconds);
}
