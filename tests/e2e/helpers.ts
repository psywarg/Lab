import type { BrowserContext, CDPSession, Page } from "@playwright/test";

export const TOOLS = [
  "screen-test",
  "stuck-pixel-fixer",
  "touch-test",
  "speaker-test",
  "mic-test",
  "accelerometer-test",
  "gyroscope-test",
] as const;

/** Blocks every request that leaves the test server (analytics, Turnstile). */
export async function blockExternal(page: Page): Promise<void> {
  await page.route("**/*", (route) => {
    const url = route.request().url();
    return url.startsWith("http://127.0.0.1") ? route.continue() : route.abort();
  });
}

/** Collects page errors and console errors, ignoring blocked external fetches. */
export function collectErrors(page: Page): string[] {
  const errors: string[] = [];
  page.on("pageerror", (error) => errors.push(`pageerror: ${error.message}`));
  page.on("console", (message) => {
    if (message.type() !== "error") return;
    const text = message.text();
    if (text.includes("Failed to fetch") || text.includes("ERR_FAILED")) return;
    errors.push(`console: ${text}`);
  });
  return errors;
}

export async function openTool(page: Page, tool: string): Promise<void> {
  await blockExternal(page);
  await page.goto(`/phones/tools/${tool}`);
  await page.waitForLoadState("load");
}

type TouchPoint = readonly [x: number, y: number];

/** Real touch input through the Chrome DevTools Protocol. */
export function createTouch(cdp: CDPSession) {
  const send = (
    type: "touchStart" | "touchMove" | "touchEnd",
    points: readonly TouchPoint[],
  ) =>
    cdp.send("Input.dispatchTouchEvent", {
      type,
      touchPoints: points.map(([x, y], index) => ({ x, y, id: index + 1 })),
    });
  return {
    send,
    async tap(x: number, y: number): Promise<void> {
      await send("touchStart", [[x, y]]);
      await send("touchEnd", []);
    },
  };
}

export async function cdpFor(
  context: BrowserContext,
  page: Page,
): Promise<CDPSession> {
  return context.newCDPSession(page);
}

type SensorType =
  | "accelerometer"
  | "gravity"
  | "linear-acceleration"
  | "gyroscope";

export async function enableSensors(
  cdp: CDPSession,
  types: readonly SensorType[],
): Promise<void> {
  for (const type of types) {
    await cdp.send("Emulation.setSensorOverrideEnabled", { enabled: true, type });
  }
}

export function setSensor(
  cdp: CDPSession,
  type: SensorType,
  x: number,
  y: number,
  z: number,
) {
  return cdp.send("Emulation.setSensorOverrideReadings", {
    type,
    reading: { xyz: { x, y, z } },
  });
}

/**
 * Virtual sensors only emit a reading when a new value is set, so tests feed
 * a continuous stream (about 60 Hz) while assertions run.
 */
export function streamSensors(
  feed: () => Promise<unknown>,
  intervalMs = 16,
): { stop: () => Promise<void> } {
  let running = true;
  const loop = (async () => {
    while (running) {
      await feed();
      await new Promise((resolve) => setTimeout(resolve, intervalMs));
    }
  })();
  return {
    async stop() {
      running = false;
      await loop;
    },
  };
}

export const jitter = (scale: number): number => (Math.random() - 0.5) * scale;
