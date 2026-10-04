import { expect, test } from "@playwright/test";
import {
  cdpFor,
  enableSensors,
  jitter,
  openTool,
  setSensor,
  streamSensors,
} from "./helpers";

const G = 9.80665;
const DEG = Math.PI / 180;

test("C2: the accelerometer readout reflects the raw sensor", async ({ page, context }) => {
  const cdp = await cdpFor(context, page);
  await enableSensors(cdp, ["accelerometer", "gravity", "linear-acceleration"]);
  // A faulty accelerometer: 1.30 g at rest with about 0.1 g of noise.
  const stream = streamSensors(async () => {
    const n = jitter(2);
    await setSensor(cdp, "accelerometer", n, n, 12.75 + n);
    await setSensor(cdp, "gravity", 0, 0, G);
    await setSensor(cdp, "linear-acceleration", n, n, 2.94 + n);
  });
  try {
    await openTool(page, "accelerometer-test");
    await page.locator("#accel-start").click();
    await expect(page.locator("#accel-run-status")).toHaveText("Live", { timeout: 10_000 });
    await page.waitForTimeout(2500);
    const total = Number.parseFloat((await page.locator("#total-g").textContent()) ?? "0");
    expect(total).toBeGreaterThan(1.2);
    await expect(page.locator("#evidence-gravity-state")).toHaveText("High offset");
  } finally {
    await stream.stop();
  }
});

test("C2: the optional linear sensor still drives shake detection", async ({ page, context }) => {
  const cdp = await cdpFor(context, page);
  await enableSensors(cdp, ["accelerometer", "linear-acceleration"]);
  // The raw reading stays at 1 g; only the linear sensor reports the shake.
  let tick = 0;
  const stream = streamSensors(async () => {
    tick += 1;
    await setSensor(cdp, "accelerometer", 0, 0, G);
    await setSensor(cdp, "linear-acceleration", tick % 40 < 3 ? 1.2 * G : 0, 0, 0);
  });
  try {
    await openTool(page, "accelerometer-test");
    await page.evaluate(() => document.querySelector<HTMLButtonElement>("[data-accel-check='shake']")?.click());
    await page.locator("#accel-start").click();
    await expect(page.locator("#accel-run-status")).toHaveText("Live", { timeout: 10_000 });
    await expect
      .poll(async () => Number.parseInt((await page.locator("#shake-count").textContent()) ?? "0", 10), {
        timeout: 5000,
      })
      .toBeGreaterThan(1);
  } finally {
    await stream.stop();
  }
});

test("C3: a constant gyroscope bias is reported as drift", async ({ page, context }) => {
  const cdp = await cdpFor(context, page);
  await enableSensors(cdp, ["gyroscope"]);
  const perAxis = 4 / Math.sqrt(3); // 4 deg/s resting bias overall
  const stream = streamSensors(() =>
    setSensor(
      cdp,
      "gyroscope",
      (perAxis + jitter(0.2)) * DEG,
      (perAxis + jitter(0.2)) * DEG,
      (perAxis + jitter(0.2)) * DEG,
    ),
  );
  try {
    await openTool(page, "gyroscope-test");
    await page.locator("#gyro-start").click();
    await page.waitForTimeout(1500);
    await page.evaluate(() => document.querySelector<HTMLButtonElement>("[data-gyro-check='drift']")?.click());
    await page.waitForTimeout(2500);
    const drift = Number.parseFloat((await page.locator("#gyro-run-drift").textContent()) ?? "0");
    expect(drift).toBeGreaterThan(3.5);
    expect(drift).toBeLessThan(4.5);
    await expect(page.locator("#gyro-drift-state")).toHaveText("Minor drift");
  } finally {
    await stream.stop();
  }
});

test("C3: zero-rate capture accepts a large steady offset and removes it", async ({ page, context }) => {
  const cdp = await cdpFor(context, page);
  await enableSensors(cdp, ["gyroscope"]);
  // 8 deg/s on X: above the old 6 deg/s rejection limit, but steady.
  const stream = streamSensors(() =>
    setSensor(cdp, "gyroscope", (8 + jitter(0.2)) * DEG, jitter(0.2) * DEG, jitter(0.2) * DEG),
  );
  try {
    await openTool(page, "gyroscope-test");
    await page.locator("#gyro-start").click();
    await page.evaluate(() => document.querySelector<HTMLButtonElement>("[data-gyro-check='drift']")?.click());
    await expect(page.locator("#gyro-drift-state")).toHaveText("High drift", { timeout: 5000 });
    await expect(page.locator("#noise-state")).toHaveText("Steady");
    await expect(page.locator("#gyro-capture-bias")).toBeEnabled();
    await page.evaluate(() => document.querySelector<HTMLButtonElement>("#gyro-capture-bias")?.click());
    await expect(page.locator("#bias-state")).toHaveText("High offset -- adjusts this page only", {
      timeout: 6000,
    });
    expect(Number.parseFloat((await page.locator("#bias-score").textContent()) ?? "0")).toBeCloseTo(8, 0);
    await expect(page.locator("#gyro-drift-state")).toHaveText("Calm", { timeout: 5000 });
  } finally {
    await stream.stop();
  }
});
