// src/utils/site/raf.ts

export type RafScheduler = {
  cancel: () => void;
  request: () => void;
};

export function createRafScheduler(callback: () => void): RafScheduler {
  let frame = 0;

  function cancel(): void {
    if (frame === 0) return;
    cancelAnimationFrame(frame);
    frame = 0;
  }

  function request(): void {
    if (frame !== 0) return;
    frame = requestAnimationFrame(() => {
      frame = 0;
      callback();
    });
  }

  return { cancel, request };
}
