import { expect, test, type Page } from "@playwright/test";
import { openTool } from "./helpers";

async function prepareManual(page: Page): Promise<void> {
  await openTool(page, "stuck-pixel-fixer");
  await page.locator("#pixel-warning-ack").check();
  await page.locator("#pixel-warning-button").click();
  await page.locator("#pixel-manual-tab").click();
}

/** Counts colour changes of the stage or spot over three seconds. */
async function measureChangesPerSecond(page: Page): Promise<number> {
  return page.evaluate(async () => {
    const stage = document.getElementById("pixel-stage");
    const spot = document.getElementById("pixel-spot");
    if (!stage || !spot) return -1;
    let last = `${stage.style.background}|${spot.style.background}`;
    let changes = 0;
    const start = performance.now();
    await new Promise<void>((resolve) => {
      const tick = () => {
        const current = `${stage.style.background}|${spot.style.background}`;
        if (current !== last) {
          changes += 1;
          last = current;
        }
        if (performance.now() - start < 3000) requestAnimationFrame(tick);
        else resolve();
      };
      requestAnimationFrame(tick);
    });
    return changes / 3;
  });
}

async function runAtMaxSpeed(page: Page, mode: "full" | "spot", spotPx?: number): Promise<number> {
  await page.evaluate(
    ({ mode, spotPx }) => {
      const modeInput = document.getElementById("pixel-mode") as HTMLSelectElement;
      modeInput.value = mode;
      modeInput.dispatchEvent(new Event("change", { bubbles: true }));
      if (spotPx) {
        const size = document.getElementById("pixel-size") as HTMLInputElement;
        size.value = String(spotPx);
        size.dispatchEvent(new Event("input", { bubbles: true }));
      }
      document.querySelector<HTMLButtonElement>("[data-repair-button][data-pattern-id='rgb']")?.click();
      const speed = document.getElementById("pixel-speed") as HTMLInputElement;
      speed.value = speed.max;
      speed.dispatchEvent(new Event("input", { bubbles: true }));
      document.getElementById("pixel-start")?.click();
    },
    { mode, spotPx },
  );
  await expect(page.locator("#pixel-stage")).toHaveAttribute("data-running", "true");
  if (mode === "spot") {
    // Place the spot so it is visible and flashing.
    const box = await page.locator("#pixel-stage").boundingBox();
    if (box) await page.mouse.click(box.x + box.width / 2, box.y + box.height / 2);
  }
  await page.waitForTimeout(400);
  return measureChangesPerSecond(page);
}

test("full-screen colour cycling stays at or below 3 changes per second", async ({ page }) => {
  await prepareManual(page);
  const rate = await runAtMaxSpeed(page, "full");
  expect(rate).toBeGreaterThan(0);
  expect(rate).toBeLessThanOrEqual(3.1);
});

test("H11: a 160 px spot is limited to 3 changes per second", async ({ page }) => {
  await prepareManual(page);
  const rate = await runAtMaxSpeed(page, "spot", 160);
  expect(rate).toBeGreaterThan(0);
  expect(rate).toBeLessThanOrEqual(3.1);
});

test("H11: a 140 px spot keeps the fast grade", async ({ page }) => {
  await prepareManual(page);
  const rate = await runAtMaxSpeed(page, "spot", 140);
  expect(rate).toBeGreaterThan(3.1);
});

/**
 * Runs Diagnose, marking the same stage point on the listed colours only.
 * The clock is fast-forwarded through each 10 s viewing step.
 */
async function diagnose(page: Page, seenOn: readonly string[]): Promise<void> {
  await page.clock.install();
  await openTool(page, "stuck-pixel-fixer");
  await page.locator("#pixel-auto-tab").click();
  await page.locator("#pixel-diagnose").click();
  await page.locator("#pixel-warning-ack").check();
  await page.locator("#pixel-warning-button").click();
  await page.locator("#pixel-diagnose").click();
  await expect(page.locator("#pixel-stage")).toHaveAttribute("data-diagnosing", "true");

  const stage = page.locator("#pixel-stage");
  for (;;) {
    if ((await page.locator("#pixel-diagnosis-instruct").getAttribute("data-visible")) === "true") {
      await page.locator("#pixel-diagnosis-begin").click();
    }
    await expect(page.locator("#pixel-diagnosis-countdown")).toBeVisible();
    const colour = (await stage.evaluate((el) => (el as HTMLElement).style.background)) ?? "";
    const box = await stage.boundingBox();
    if (box && seenOn.includes(colour)) await page.mouse.click(box.x + box.width / 2, box.y + box.height / 2);
    await page.clock.runFor(10_500);
    await expect(page.locator("#pixel-diagnosis-confirm")).toHaveAttribute("data-visible", "true");
    const marked = !(await page.locator("#pixel-diagnosis-confirm-marked").isHidden());
    await page.locator(marked ? "#pixel-diagnosis-confirm-next" : "#pixel-diagnosis-no-issue").click();
    if ((await stage.getAttribute("data-diagnosing")) !== "true") return;
  }
}

test("Diagnose identifies a red subpixel stuck on, and Auto runs Static Noise on it", async ({ page }) => {
  test.skip(test.info().project.name !== "desktop", "One viewport is enough for this flow");
  // A red subpixel stuck on shows wherever the colour does not already drive red fully.
  await diagnose(page, [
    "rgb(0, 0, 0)",
    "rgb(0, 255, 0)",
    "rgb(0, 0, 255)",
    "rgb(0, 255, 255)",
    "rgb(128, 128, 128)",
    "rgb(16, 16, 16)",
  ]);
  await expect(page.locator("#pixel-diagnosis-summary-title")).toContainText("Bright red subpixel");
  await expect(page.locator("#pixel-diagnosis-summary-body")).toContainText("Strong bright red subpixel fault");
  await expect(page.locator("#pixel-diagnosis-summary-body")).toContainText("Auto will run Static Noise");
  // Finishing Diagnose has just left fullscreen; the runtime ignores a new
  // fullscreen toggle within 350 ms, so let that pass before pressing Start.
  await page.clock.runFor(500);
  await page.locator("#pixel-start").click();
  await page.clock.runFor(500);
  await expect(page.locator("#pixel-stage")).toHaveAttribute("data-running", "true");
  await expect(page.locator("#pixel-stage")).toHaveAttribute("data-pattern", "static");
});

test("Diagnose calls a mark seen on every colour a surface or panel mark", async ({ page }) => {
  test.skip(test.info().project.name !== "desktop", "One viewport is enough for this flow");
  await diagnose(page, [
    "rgb(0, 0, 0)",
    "rgb(255, 255, 255)",
    "rgb(255, 0, 0)",
    "rgb(0, 255, 0)",
    "rgb(0, 0, 255)",
    "rgb(0, 255, 255)",
    "rgb(255, 0, 255)",
    "rgb(255, 255, 0)",
    "rgb(128, 128, 128)",
    "rgb(16, 16, 16)",
  ]);
  await expect(page.locator("#pixel-diagnosis-summary-title")).toContainText("Surface or panel mark");
});
