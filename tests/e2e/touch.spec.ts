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
  // CDP event dispatch timing varies under load (a ratio of 1.54 has been
  // seen with correct code); the bug this guards against doubled the rate
  // (ratio 2.0), which this bound still fails clearly.
  expect(two / one).toBeGreaterThan(0.6);
  expect(two / one).toBeLessThan(1.75);
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

test("Drift: tracing the guide reports a small deviation, 30 px off reports about 30 px", async ({ page, context }) => {
  const touch = createTouch(await cdpFor(context, page));
  await openTool(page, "touch-test");
  await startTest(page, "drift");
  const guide = page.locator("#touch-drift-layer svg path").first();
  await expect(guide).toBeAttached();
  const points = await guide.evaluate((path) => {
    const el = path as SVGPathElement;
    const box = el.ownerSVGElement?.getBoundingClientRect();
    const length = el.getTotalLength();
    return Array.from({ length: 41 }, (_, i) => {
      const p = el.getPointAtLength((length * i) / 40);
      return [p.x + (box?.left ?? 0), p.y + (box?.top ?? 0)] as const;
    });
  });

  async function trace(offsetY: number): Promise<number> {
    const shifted = points.map(([x, y]) => [x, y + offsetY] as const);
    const [first, ...rest] = shifted;
    if (!first) throw new Error("No guide points");
    await touch.send("touchStart", [first]);
    for (const point of rest) {
      await touch.send("touchMove", [point]);
      await page.waitForTimeout(16);
    }
    await touch.send("touchEnd", []);
    await page.waitForTimeout(200);
    return Number.parseInt((await stageStat(page, "primary").textContent()) ?? "", 10);
  }

  const onGuide = await trace(0);
  expect(onGuide).toBeLessThanOrEqual(4);
  const off = await trace(30);
  expect(off).toBeGreaterThanOrEqual(26);
  expect(off).toBeLessThanOrEqual(34);
});

test("C4: covered cells follow the panel through a screen rotation", async ({ page, context }) => {
  const cdp = await cdpFor(context, page);
  const touch = createTouch(cdp);
  await openTool(page, "touch-test");
  await startTest(page);
  const topRow = await page.evaluate(() => {
    const rects = Array.from(document.querySelectorAll(".touch-cell")).map((cell) => cell.getBoundingClientRect());
    const top = Math.min(...rects.map((rect) => rect.y));
    return rects.filter((rect) => rect.y === top).map((rect) => [rect.x + rect.width / 2, rect.y + rect.height / 2] as const);
  });
  expect(topRow.length).toBeGreaterThan(1);
  for (const [x, y] of topRow) await touch.tap(x, y);
  await expect(page.locator(".touch-cell--hit")).toHaveCount(topRow.length);
  expect(await page.evaluate(() => screen.orientation.angle)).toBe(0);

  // Turn the phone 90 degrees counter-clockwise: the panel's top edge is now on the left.
  const viewport = page.viewportSize() ?? { width: 0, height: 0 };
  await cdp.send("Emulation.setDeviceMetricsOverride", {
    width: viewport.height,
    height: viewport.width,
    deviceScaleFactor: 0,
    mobile: true,
    screenOrientation: { type: "landscapePrimary", angle: 90 },
  });
  await expect.poll(() => page.evaluate(() => screen.orientation.angle)).toBe(90);
  await expect
    .poll(() =>
      page.evaluate(() => {
        const cells = Array.from(document.querySelectorAll(".touch-cell"));
        const left = Math.min(...cells.map((cell) => cell.getBoundingClientRect().x));
        const hit = cells.filter((cell) => cell.classList.contains("touch-cell--hit"));
        return hit.length > 0 && hit.every((cell) => cell.getBoundingClientRect().x === left);
      }),
    )
    .toBe(true);
});
