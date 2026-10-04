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
  test.fail(true, "Review finding C2: Generic Sensor path reads GravitySensor, not Accelerometer");
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
    await expect(page.locator("#evidence-gravity-state")).not.toHaveText("On target");
  } finally {
    await stream.stop();
  }
});

test("C3: a constant gyroscope bias is reported as drift", async ({ page, context }) => {
  test.fail(true, "Review finding C3: deadbands hide drift below 2.4 deg/s per axis");
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
    expect(drift).toBeGreaterThan(3);
  } finally {
    await stream.stop();
  }
});
