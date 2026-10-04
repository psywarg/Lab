// src/utils/phones/tools/wakeLock.ts

export type WakeLockHandle = {
  request: () => void;
  release: () => void;
};

export type CreateWakeLockOptions = {
  signal?: AbortSignal;
  onRelease?: () => void;
};

export function createWakeLock(
  options?: CreateWakeLockOptions,
): WakeLockHandle {
  let sentinel: WakeLockSentinel | null = null;
  let acquisition: Promise<void> | null = null;
  let acquisitionVersion = 0;
  let wanted = false;

  const isSupported = "wakeLock" in navigator;

  async function acquire(): Promise<void> {
    if (!isSupported || !wanted || sentinel || acquisition) return;

    const requestVersion = acquisitionVersion;
    const pending = (async () => {
      try {
        const nextSentinel = await navigator.wakeLock.request("screen");
        if (!wanted || requestVersion !== acquisitionVersion) {
          if (!nextSentinel.released) {
            await nextSentinel.release().catch(() => undefined);
          }
          return;
        }

        sentinel = nextSentinel;
        nextSentinel.addEventListener("release", () => {
          if (sentinel === nextSentinel) sentinel = null;
          if (wanted) options?.onRelease?.();
        });
      } catch {
        if (requestVersion === acquisitionVersion) sentinel = null;
      }
    })();

    acquisition = pending;
    await pending;
    if (acquisition === pending) acquisition = null;
    if (wanted && !sentinel && requestVersion !== acquisitionVersion)
      void acquire();
  }

  function handleVisibilityChange(): void {
    if (document.visibilityState === "visible") void acquire();
  }

  document.addEventListener("visibilitychange", handleVisibilityChange, {
    signal: options?.signal,
  });

  function request(): void {
    wanted = true;
    void acquire();
  }

  function release(): void {
    wanted = false;
    acquisitionVersion += 1;
    const current = sentinel;
    sentinel = null;
    if (current && !current.released)
      void current.release().catch(() => undefined);
  }

  return { request, release };
}
