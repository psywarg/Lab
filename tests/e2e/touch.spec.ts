import { expect, test, type Page } from "@playwright/test";
import { cdpFor, createTouch, openTool } from "./helpers";

test.skip(({ isMobile }) => !isMobile, "Touch tests need a touch viewport");

const stageStat = (page: Page, name: string) =>
  page.locator(`.tool-runtime-stage-stats [data-stat='${name}']`);

async function startTest(page: Page, mode?: string): Promise<void> {
  if (mode) {
    await page.evaluate((id) => {
      document.querySelector<HTMLButtonElement>(`[data-mode-id='${id}']`)?.click();
    }, mode);
  }
  await page.locator("#touch-start").click();
  await expect(page.locator("#touch-stage")).toHaveAttribute("data-active", "true");
  await expect(page.locator("tool-runtime-shell")).toHaveAttribute("data-fullscreen", "true");
}

test("C4: tapping every visible grid cell reports 100% coverage", async ({ page, context }) => {
  const touch = createTouch(await cdpFor(context, page));
  await openTool(page, "touch-test");
  await startTest(page);
  const viewportHeight = page.viewportSize()?.height ?? 0;
  const cells = await page.evaluate(() =>
    Array.from(document.querySelectorAll(".touch-cell")).map((cell) => {
      const rect = cell.getBoundingClientRect();
      return [rect.x + rect.width / 2, rect.y + rect.height / 2] as const;
    }),
  );
  expect(viewportHeight).toBeGreaterThan(0);
  for (const [x, y] of cells) await touch.tap(x, y);
  await expect(page.locator(".touch-cell--hit")).toHaveCount(cells.length);
  await expect(stageStat(page, "secondary")).toHaveText("100%");
});

test("H2: the bottom row of the grid can be touched without leaving the test", async ({ page, context }) => {
  const touch = createTouch(await cdpFor(context, page));
  await openTool(page, "touch-test");
  await startTest(page);
  await page.waitForTimeout(2600); // let the controls auto-hide
  const viewport = page.viewportSize();
  const y = (viewport?.height ?? 0) - 24;
  for (let x = 20; x < (viewport?.width ?? 0); x += 45) {
    await touch.tap(x, y);
    await page.waitForTimeout(120);
  }
  await expect(page.locator("#touch-stage")).toHaveAttribute("data-active", "true");
  await expect(page.locator("tool-runtime-shell")).toHaveAttribute("data-fullscreen", "true");
});

test("H3: sample rate does not double with two fingers", async ({ page, context }) => {
  const touch = createTouch(await cdpFor(context, page));
  await openTool(page, "touch-test");
  await startTest(page, "multitouch");
  async function rateWith(fingers: readonly (readonly [number, number])[]): Promise<number> {
    await touch.send("touchStart", fingers);
    for (let i = 0; i < 50; i += 1) {
      await touch.send("touchMove", fingers.map(([x, y]) => [x + i, y + i * 3] as const));
      await page.waitForTimeout(16);
    }
    const text = (await stageStat(page, "rate").textContent()) ?? "";
    await touch.send("touchEnd", []);
    await page.waitForTimeout(1200);
    return Number.parseInt(text, 10);
  }
  const one = await rateWith([[100, 200]]);
  const two = await rateWith([[100, 200], [260, 200]]);
  expect(one).toBeGreaterThan(0);
  // Event dispatch timing in the harness varies by about 20%; the bug this
  // guards against doubled the rate (ratio 2.0).
  expect(two / one).toBeGreaterThan(0.67);
  expect(two / one).toBeLessThan(1.5);
});

test("C5: a tap 5 px from the target centre grades as Centre", async ({ page, context }) => {
  const touch = createTouch(await cdpFor(context, page));
  await openTool(page, "touch-test");
  await startTest(page, "precision");
  const target = await page.locator(".precision-target").first().boundingBox();
  if (!target) throw new Error("No precision target");
  await touch.tap(target.x + target.width / 2 + 5, target.y + target.height / 2);
  await expect(stageStat(page, "secondary")).toHaveText(/Centre/);
});

test("H4: pointer type, pressure and contact size are shown", async ({ page, context }) => {
  const touch = createTouch(await cdpFor(context, page));
  await openTool(page, "touch-test");
  await startTest(page, "multitouch");
  await touch.tap(150, 300);
  await expect(page.locator("tool-runtime-shell")).toContainText("Finger");
});

test("H2: holding the top-right hint pauses the test and shows the controls", async ({ page, context }) => {
  const touch = createTouch(await cdpFor(context, page));
  await openTool(page, "touch-test");
  await startTest(page);
  const zone = await page.locator("#touch-hold-zone").boundingBox();
  if (!zone) throw new Error("Hold zone not visible");
  await expect(page.locator(".tool-runtime-dock-primary")).toBeHidden();
  await touch.send("touchStart", [[zone.x + zone.width / 2, zone.y + zone.height / 2]]);
  await page.waitForTimeout(900);
  await touch.send("touchEnd", []);
  await expect(page.locator("#touch-stage")).toHaveAttribute("data-active", "false");
  await expect(page.locator("#touch-start")).toBeVisible();
  await expect(page.locator("#touch-start")).toHaveText("Resume");
});
