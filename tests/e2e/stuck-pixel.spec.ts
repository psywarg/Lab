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

const COLOURS = {
  black: "rgb(0, 0, 0)",
  white: "rgb(255, 255, 255)",
  red: "rgb(255, 0, 0)",
  green: "rgb(0, 255, 0)",
  blue: "rgb(0, 0, 255)",
  cyan: "rgb(0, 255, 255)",
  magenta: "rgb(255, 0, 255)",
  yellow: "rgb(255, 255, 0)",
  midGrey: "rgb(128, 128, 128)",
  darkGrey: "rgb(16, 16, 16)",
} as const;
type Colour = keyof typeof COLOURS;
const ALL_COLOURS = Object.keys(COLOURS) as Colour[];
const allBut = (...hidden: Colour[]) => ALL_COLOURS.filter((colour) => !hidden.includes(colour));

/**
 * A spot to mark during Diagnose: where it is (0-1 of the stage), the
 * colours it is tapped on, and how follow-up questions are answered
 * (by default, visible exactly where it was tapped).
 */
type Spot = { x: number; y: number; seenOn: readonly Colour[]; answers?: Partial<Record<Colour, boolean>> };

/**
 * Runs Diagnose, tapping each spot on its colours and answering any
 * follow-up questions. The clock is fast-forwarded through each 10 s step.
 */
async function diagnose(page: Page, spots: readonly Spot[]): Promise<void> {
  await page.clock.install();
  await openTool(page, "stuck-pixel-fixer");
  await page.locator("#pixel-auto-tab").click();
  await page.locator("#pixel-diagnose").click();
  await page.locator("#pixel-warning-ack").check();
  await page.locator("#pixel-warning-button").click();
  await page.locator("#pixel-diagnose").click();
  await expect(page.locator("#pixel-stage")).toHaveAttribute("data-diagnosing", "true");

  const stage = page.locator("#pixel-stage");
  const colourOf = async () => {
    const background = await stage.evaluate((el) => (el as HTMLElement).style.background);
    return ALL_COLOURS.find((colour) => COLOURS[colour] === background);
  };
  for (;;) {
    if ((await page.locator("#pixel-diagnosis-instruct").getAttribute("data-visible")) === "true") {
      await page.locator("#pixel-diagnosis-begin").click();
    }
    await expect(page.locator("#pixel-diagnosis-countdown")).toBeVisible();
    const colour = await colourOf();
    const box = await stage.boundingBox();
    for (const spot of spots) {
      if (box && colour && spot.seenOn.includes(colour)) {
        await page.mouse.click(box.x + box.width * spot.x, box.y + box.height * spot.y);
      }
    }
    await page.clock.runFor(10_500);
    await expect(page.locator("#pixel-diagnosis-confirm")).toHaveAttribute("data-visible", "true");
    const marked = !(await page.locator("#pixel-diagnosis-confirm-marked").isHidden());
    await page.locator(marked ? "#pixel-diagnosis-confirm-next" : "#pixel-diagnosis-no-issue").click();
    if ((await page.locator("#pixel-diagnosis-instruct").getAttribute("data-visible")) === "true") continue;
    // Follow-up questions: find the ringed spot, then answer for that spot.
    while ((await page.locator("#pixel-followup").getAttribute("data-visible")) === "true") {
      const ring = await stage.locator(".pixel-auto-marker.is-highlighted").evaluate((el) => ({
        x: Number.parseFloat((el as HTMLElement).style.left) / 100,
        y: Number.parseFloat((el as HTMLElement).style.top) / 100,
      }));
      const spot = [...spots].sort(
        (a, b) => Math.hypot(a.x - ring.x, a.y - ring.y) - Math.hypot(b.x - ring.x, b.y - ring.y),
      )[0];
      const asked = await colourOf();
      if (!spot || !asked) throw new Error("Follow-up without a spot or colour");
      followUpsAsked.push(asked);
      const visible = spot.answers?.[asked] ?? spot.seenOn.includes(asked);
      await page.locator(visible ? "#pixel-followup-yes" : "#pixel-followup-no").click();
    }
    if ((await stage.getAttribute("data-diagnosing")) !== "true") return;
  }
}
let followUpsAsked: Colour[] = [];
test.beforeEach(() => {
  followUpsAsked = [];
});

/** Shows the summary for one mark by choosing it in the mark picker. */
async function summaryFor(page: Page, markIndex: number) {
  await page.locator("#pixel-auto-mark").selectOption(String(markIndex));
  return {
    title: page.locator("#pixel-diagnosis-summary-title"),
    body: page.locator("#pixel-diagnosis-summary-body"),
  };
}

const centre = (seenOn: readonly Colour[], answers?: Spot["answers"]): Spot[] => [{ x: 0.5, y: 0.5, seenOn, answers }];

test("Diagnose identifies a red subpixel stuck on, and Auto runs Static Noise on it", async ({ page }) => {
  // A red subpixel stuck on shows wherever the colour does not already drive red fully.
  await diagnose(page, centre(["black", "green", "blue", "cyan", "midGrey", "darkGrey"]));
  await expect(page.locator("#pixel-diagnosis-summary-title")).toContainText("Bright red subpixel");
  await expect(page.locator("#pixel-diagnosis-summary-body")).toContainText("Strong bright red subpixel fault");
  await expect(page.locator("#pixel-diagnosis-summary-body")).toContainText("Auto will run Static Noise");
  expect(followUpsAsked).toEqual([]);
  // Finishing Diagnose has just left fullscreen; the runtime ignores a new
  // fullscreen toggle within 350 ms, so let that pass before pressing Start.
  await page.clock.runFor(500);
  await page.locator("#pixel-start").click();
  await page.clock.runFor(500);
  await expect(page.locator("#pixel-stage")).toHaveAttribute("data-running", "true");
  await expect(page.locator("#pixel-stage")).toHaveAttribute("data-pattern", "static");
});

test("Diagnose calls a mark seen on every colour a surface or panel mark", async ({ page }) => {
  await diagnose(page, centre(ALL_COLOURS));
  await expect(page.locator("#pixel-diagnosis-summary-title")).toContainText("Surface or panel mark");
});

test("Diagnose: a dark subpixel missed on dark grey is still identified", async ({ page }) => {
  // Red stuck off shows wherever red is driven; on 6% dark grey it is too faint to see.
  await diagnose(page, centre(["white", "red", "magenta", "yellow", "midGrey"]));
  await expect(page.locator("#pixel-diagnosis-summary-title")).toContainText("Dark red subpixel");
  await expect(page.locator("#pixel-diagnosis-summary-body")).toContainText("Strong dark red subpixel fault. 9/9");
});

test("Diagnose: a follow-up question corrects a misjudged colour", async ({ page }) => {
  // A hot pixel (seen on everything but white), but yellow was missed during the colour steps.
  await diagnose(page, centre(allBut("white", "yellow"), { yellow: true }));
  expect(followUpsAsked).toContain("yellow");
  await expect(page.locator("#pixel-diagnosis-summary-title")).toContainText("Hot pixel");
});

test("Diagnose classifies two marks on the screen independently", async ({ page }) => {
  await diagnose(page, [
    // Red subpixel stuck on, upper left.
    { x: 0.25, y: 0.3, seenOn: ["black", "green", "blue", "cyan", "midGrey", "darkGrey"] },
    // Dead pixel (seen on everything but black), lower right.
    { x: 0.75, y: 0.7, seenOn: allBut("black") },
  ]);
  await expect(page.locator("#pixel-diagnosis-summary-count")).toHaveText("2/2 identified");
  const labels = [];
  for (const index of [0, 1]) labels.push(await (await summaryFor(page, index)).title.textContent());
  expect(labels.map((label) => label?.replace(/^#\d+ /, "")).sort()).toEqual(["Bright red subpixel", "Dead pixel"]);
});

test("Diagnose still calls a pretend spot on unrelated colours unclear, naming the closest match", async ({ page }) => {
  await diagnose(page, centre(["white", "red", "cyan"]));
  await expect(page.locator("#pixel-diagnosis-summary-title")).toContainText("Unclear pattern");
  await expect(page.locator("#pixel-diagnosis-summary-body")).toContainText("Closest match:");
});
