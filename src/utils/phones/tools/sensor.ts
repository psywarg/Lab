// src/utils/phones/tools/sensor.ts

type SensorWatchdogOptions = {
  noDataAfter?: number;
  staleAfter?: number;
  pollInterval?: number;
  onNoData: () => void;
  onStale: () => void;
};

export type SensorWatchdog = {
  markSample: (now?: number) => void;
  start: () => void;
  stop: () => void;
};

export function createSensorWatchdog({
  noDataAfter = 2500,
  staleAfter = 1800,
  pollInterval = 250,
  onNoData,
  onStale,
}: SensorWatchdogOptions): SensorWatchdog {
  let timer = 0;
  let startedAt = 0;
  let lastSampleAt: number | null = null;
  let noDataReported = false;
  let staleReported = false;

  function check(): void {
    const now = performance.now();
    if (lastSampleAt === null) {
      if (!noDataReported && now - startedAt >= noDataAfter) {
        noDataReported = true;
        onNoData();
      }
      return;
    }

    if (!staleReported && now - lastSampleAt >= staleAfter) {
      staleReported = true;
      onStale();
    }
  }

  function stop(): void {
    if (timer !== 0) {
      window.clearInterval(timer);
      timer = 0;
    }
    startedAt = 0;
    lastSampleAt = null;
    noDataReported = false;
    staleReported = false;
  }

  function start(): void {
    stop();
    startedAt = performance.now();
    timer = window.setInterval(check, pollInterval);
  }

  function markSample(now = performance.now()): void {
    lastSampleAt = now;
    staleReported = false;
  }

  return { markSample, start, stop };
}
