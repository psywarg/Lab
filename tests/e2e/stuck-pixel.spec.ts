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
async function diagnose(page: Page, spots: readonly Spot[], timerSeconds?: number): Promise<void> {
  await page.clock.install();
  await openTool(page, "stuck-pixel-fixer");
  if (timerSeconds) {
    await page.evaluate((value) => {
      const timer = document.getElementById("pixel-timer") as HTMLSelectElement;
      timer.value = String(value);
      timer.dispatchEvent(new Event("change", { bubbles: true }));
    }, timerSeconds);
  }
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

/** After Diagnose: whether Start can run Auto, and the status line. */
function autoState(page: Page) {
  return {
    start: page.locator("#pixel-start"),
    state: page.locator("#pixel-state"),
  };
}

test("Diagnose calls a mark seen on every colour a surface or panel mark, and Auto skips it", async ({ page }) => {
  await diagnose(page, centre(ALL_COLOURS));
  await expect(page.locator("#pixel-diagnosis-summary-title")).toContainText("Surface or panel mark");
  await expect(page.locator("#pixel-diagnosis-summary-body")).toContainText("Auto skips it. Clean the screen");
  const { start, state } = autoState(page);
  await expect(start).toBeDisabled();
  await expect(state).toHaveText("Nothing to repair");
});

test("Diagnose: a dead pixel is reported and not flashed", async ({ page }) => {
  await diagnose(page, centre(allBut("black")));
  await expect(page.locator("#pixel-diagnosis-summary-title")).toContainText("Dead pixel");
  await expect(page.locator("#pixel-diagnosis-summary-body")).toContainText("warranty");
  const { start, state } = autoState(page);
  await expect(start).toBeDisabled();
  await expect(state).toHaveText("Nothing to repair");
});

test("Diagnose: a hot pixel is identified and Auto runs on it", async ({ page }) => {
  await diagnose(page, centre(allBut("white")));
  await expect(page.locator("#pixel-diagnosis-summary-title")).toContainText("Hot pixel");
  await page.clock.runFor(500);
  await page.locator("#pixel-start").click();
  await page.clock.runFor(500);
  await expect(page.locator("#pixel-stage")).toHaveAttribute("data-running", "true");
});

test("Diagnose: a dark green subpixel is identified and Auto runs on it", async ({ page }) => {
  // Green stuck off shows wherever green is driven (dark grey is too faint to judge).
  await diagnose(page, centre(["white", "green", "cyan", "yellow", "midGrey"]));
  await expect(page.locator("#pixel-diagnosis-summary-title")).toContainText("Dark green subpixel");
  await expect(page.locator("#pixel-start")).toBeEnabled();
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
  // Only the red subpixel is flashed; the dead pixel is listed but skipped.
  await page.clock.runFor(500);
  await page.locator("#pixel-start").click();
  await page.clock.runFor(500);
  await expect(page.locator("#pixel-detail")).toContainText("(1/1)");
});

test("Diagnose still calls a pretend spot on unrelated colours unclear, naming the closest match", async ({ page }) => {
  await diagnose(page, centre(["white", "red", "cyan"]));
  await expect(page.locator("#pixel-diagnosis-summary-title")).toContainText("Unclear pattern");
  await expect(page.locator("#pixel-diagnosis-summary-body")).toContainText("Closest match:");
});

const RED_STUCK_ON: Colour[] = ["black", "green", "blue", "cyan", "midGrey", "darkGrey"];

/** Starts Auto after Diagnose and lets the clock run past its end. */
async function runAutoToEnd(page: Page, seconds: number): Promise<void> {
  // Finishing Diagnose has just left fullscreen; the runtime ignores a new
  // fullscreen toggle within 350 ms.
  await page.clock.runFor(500);
  await page.locator("#pixel-start").click();
  await page.clock.runFor(500);
  await expect(page.locator("#pixel-stage")).toHaveAttribute("data-running", "true");
  // The run ends when its 250 ms check sees Date.now() past the end time.
  await page.clock.fastForward(seconds * 1000 + 1000);
  await page.clock.runFor(500);
}

test("After Auto, a mark reported gone ends the check", async ({ page }) => {
  await diagnose(page, centre(RED_STUCK_ON), 60);
  await runAutoToEnd(page, 60);
  const check = page.locator("#pixel-check");
  await expect(check).toHaveAttribute("data-visible", "true");
  await expect(page.locator("#pixel-check-title")).toHaveText("Is mark #1 still visible?");
  // A red subpixel stuck on is clearest on black.
  await expect(page.locator("#pixel-stage")).toHaveCSS("background-color", "rgb(0, 0, 0)");
  await page.locator("#pixel-check-gone").click();
  await expect(page.locator("#pixel-check-title")).toHaveText("The mark is gone");
  await expect(page.locator("#pixel-check-longer")).toBeHidden();
  await page.locator("#pixel-check-done").click();
  await expect(check).toHaveAttribute("data-visible", "false");
});

test("After Auto, a mark still visible offers a longer round, then a warranty note", async ({ page }) => {
  await diagnose(page, centre(RED_STUCK_ON), 60);
  await runAutoToEnd(page, 60);
  await page.locator("#pixel-check-still").click();
  await expect(page.locator("#pixel-check-title")).toHaveText("Mark #1 is still visible");
  await expect(page.locator("#pixel-check-done")).toHaveText("Not now");
  // The user decides: nothing starts until a length is chosen.
  await expect(page.locator("#pixel-stage")).toHaveAttribute("data-running", "false");
  await page.locator("[data-longer-minutes='10']").click();
  await expect(page.locator("#pixel-stage")).toHaveAttribute("data-running", "true");
  await expect(page.locator("#pixel-countdown")).toHaveText(/^(10:00|09:\d\d)$/);
  await page.clock.fastForward(601_000);
  await page.clock.runFor(500);
  await expect(page.locator("#pixel-check")).toHaveAttribute("data-visible", "true");
  await page.locator("#pixel-check-still").click();
  await expect(page.locator("#pixel-check-body")).toContainText("warranty");
  await expect(page.locator("#pixel-check-longer")).toBeHidden();
  await expect(page.locator("#pixel-check-done")).toHaveText("Done");
});

test("After Auto with two marks, only the flashed one is checked", async ({ page }) => {
  await diagnose(
    page,
    [
      { x: 0.25, y: 0.3, seenOn: RED_STUCK_ON },
      { x: 0.75, y: 0.7, seenOn: allBut("black") },
    ],
    60,
  );
  await runAutoToEnd(page, 60);
  await expect(page.locator("#pixel-check-progress")).toHaveText("1/1");
  await page.locator("#pixel-check-still").click();
  await expect(page.locator("#pixel-check-title")).toHaveText(/^Mark #\d is still visible$/);
});

test("Start during the result check closes it and runs the first round again", async ({ page }) => {
  await diagnose(page, centre(RED_STUCK_ON), 60);
  await runAutoToEnd(page, 60);
  await expect(page.locator("#pixel-check")).toHaveAttribute("data-visible", "true");
  await page.locator("#pixel-start").click();
  await page.clock.runFor(500);
  await expect(page.locator("#pixel-check")).toHaveAttribute("data-visible", "false");
  await expect(page.locator("#pixel-stage")).toHaveAttribute("data-running", "true");
  await expect(page.locator("#pixel-countdown")).toHaveText(/^0[01]:\d\d$/);
});

test("Switching to Manual during the result check closes it", async ({ page }) => {
  await diagnose(page, centre(RED_STUCK_ON), 60);
  await runAutoToEnd(page, 60);
  await expect(page.locator("#pixel-check")).toHaveAttribute("data-visible", "true");
  // The workflow tabs are only shown outside fullscreen.
  await page.locator("#pixel-fullscreen").click();
  await page.clock.runFor(500);
  await expect(page.locator("#pixel-test-shell")).toHaveAttribute("data-fullscreen", "false");
  await page.locator("#pixel-manual-tab").click();
  await expect(page.locator("#pixel-test-shell")).toHaveAttribute("data-workflow", "manual");
  await expect(page.locator("#pixel-check")).toHaveAttribute("data-visible", "false");
});

test("Leaving Auto during a longer round drops it: back in Auto, Start runs the first round", async ({ page }) => {
  await diagnose(page, centre(RED_STUCK_ON), 60);
  await runAutoToEnd(page, 60);
  await page.locator("#pixel-check-still").click();
  await page.locator("[data-longer-minutes='10']").click();
  await expect(page.locator("#pixel-countdown")).toHaveText(/^(10:00|09:\d\d)$/);
  // The workflow tabs are only shown outside fullscreen.
  await page.locator("#pixel-fullscreen").dispatchEvent("click");
  await page.clock.runFor(500);
  await expect(page.locator("#pixel-test-shell")).toHaveAttribute("data-fullscreen", "false");
  await page.locator("#pixel-manual-tab").click();
  await page.locator("#pixel-auto-tab").click();
  await expect(page.locator("#pixel-test-shell")).toHaveAttribute("data-workflow", "auto");
  await page.locator("#pixel-start").click();
  await page.clock.runFor(500);
  await expect(page.locator("#pixel-stage")).toHaveAttribute("data-running", "true");
  await expect(page.locator("#pixel-countdown")).toHaveText(/^0[01]:\d\d$/);
});

test("Changing the timer while Auto is paused restarts it at the new time", async ({ page }) => {
  await diagnose(page, centre(RED_STUCK_ON), 60);
  // The runtime ignores a fullscreen toggle within 350 ms of the last one.
  await page.clock.runFor(500);
  await page.locator("#pixel-start").click();
  await page.clock.runFor(500);
  await expect(page.locator("#pixel-stage")).toHaveAttribute("data-running", "true");
  // Leaving fullscreen pauses the run and shows the controls.
  await page.locator("#pixel-fullscreen").dispatchEvent("click");
  await page.clock.runFor(500);
  await expect(page.locator("#pixel-stage")).toHaveAttribute("data-running", "false");
  await page.locator("#pixel-timer").selectOption("300", { force: true });
  await page.locator("#pixel-start").click();
  await page.clock.runFor(500);
  await expect(page.locator("#pixel-stage")).toHaveAttribute("data-running", "true");
  await expect(page.locator("#pixel-countdown")).toHaveText(/^(05:00|04:5\d)$/);
});

test("Changing the timer during a paused longer round restarts the first round", async ({ page }) => {
  await diagnose(page, centre(RED_STUCK_ON), 60);
  await runAutoToEnd(page, 60);
  await page.locator("#pixel-check-still").click();
  await page.locator("[data-longer-minutes='10']").click();
  await expect(page.locator("#pixel-countdown")).toHaveText(/^(10:00|09:\d\d)$/);
  await page.locator("#pixel-fullscreen").dispatchEvent("click");
  await page.clock.runFor(500);
  await page.locator("#pixel-timer").selectOption("60", { force: true });
  await page.locator("#pixel-start").click();
  await page.clock.runFor(500);
  await expect(page.locator("#pixel-countdown")).toHaveText(/^(01:00|00:5\d)$/);
  await page.clock.fastForward(61_000);
  await page.clock.runFor(500);
  await expect(page.locator("#pixel-check")).toHaveAttribute("data-visible", "true");
  await page.locator("#pixel-check-still").click();
  // A fresh first round, so a longer round is offered again.
  await expect(page.locator("#pixel-check-longer")).toBeVisible();
});

// The check paints the stage the mark's check colour: black for a stuck-on
// subpixel, green for a dark green one. Auto always runs in spot mode, whose
// idle stage is black.
const CHECK_CASES = [
  { name: "a bright red subpixel (checked on black)", seenOn: RED_STUCK_ON, checkColour: COLOURS.black },
  { name: "a dark green subpixel (checked on green)", seenOn: ["white", "green", "cyan", "yellow", "midGrey"] as Colour[], checkColour: COLOURS.green },
] as const;

for (const closeBy of ["a timer change", "switching to Manual"] as const) {
  for (const mark of CHECK_CASES) {
    test(`Closing the result check for ${mark.name} by ${closeBy} restores the idle stage`, async ({ page }) => {
      await diagnose(page, centre(mark.seenOn), 60);
      await runAutoToEnd(page, 60);
      await expect(page.locator("#pixel-check")).toHaveAttribute("data-visible", "true");
      await expect(page.locator("#pixel-state")).toHaveText("Check");
      expect(await page.locator("#pixel-stage").evaluate((stage) => stage.style.background)).toBe(mark.checkColour);
      await expect(page.locator(".pixel-auto-marker.is-highlighted")).toHaveCount(1);
      // The workflow tabs and timer are only shown outside fullscreen.
      await page.locator("#pixel-fullscreen").dispatchEvent("click");
      await page.clock.runFor(500);
      if (closeBy === "a timer change") await page.locator("#pixel-timer").selectOption("300", { force: true });
      else await page.locator("#pixel-manual-tab").click();
      await page.clock.runFor(500);
      await expect(page.locator("#pixel-check")).toHaveAttribute("data-visible", "false");
      await expect(page.locator("#pixel-state")).toHaveText("Ready");
      expect(await page.locator("#pixel-stage").evaluate((stage) => stage.style.background)).toBe(COLOURS.black);
      await expect(page.locator(".pixel-auto-marker.is-highlighted")).toHaveCount(0);
    });
  }
}
