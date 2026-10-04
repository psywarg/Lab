import { expect, test } from "@playwright/test";
import { openTool } from "./helpers";

test("every pattern renders something", async ({ page }) => {
  await openTool(page, "screen-test");
  const ids = await page.evaluate(() =>
    Array.from(document.querySelectorAll<HTMLElement>("[data-pattern-button]")).map(
      (button) => ({ id: button.dataset.patternId ?? "", kind: button.dataset.patternKind ?? "" }),
    ),
  );
  expect(ids.length).toBeGreaterThan(40);
  const empty: string[] = [];
  for (const { id, kind } of ids) {
    const rendered = await page.evaluate((patternId) => {
      document.querySelector<HTMLButtonElement>(`[data-pattern-id='${patternId}']`)?.click();
      const content = document.getElementById("screen-stage-content");
      return Boolean(content && (content.children.length > 0 || content.style.background));
    }, id);
    if (!rendered && kind !== "solid") empty.push(id);
  }
  expect(empty).toEqual([]);
});

test("M1: stripe patterns are as wide as their label says", async ({ page }) => {
  await openTool(page, "screen-test");
  const result = await page.evaluate(() => {
    const button = document.querySelector<HTMLButtonElement>("[data-pattern-id='lines-vertical']");
    button?.click();
    const canvas = document.querySelector<HTMLCanvasElement>(".pixel-exact-canvas");
    const row = canvas?.getContext("2d")?.getImageData(0, 0, 16, 1).data ?? new Uint8ClampedArray();
    let run = 1;
    const first = row[0] ?? 0;
    for (let i = 4; i < row.length && (row[i] ?? 0) === first; i += 4) run += 1;
    return { label: button?.dataset.patternMeta ?? "", run };
  });
  expect(result.label).toContain(`${result.run} device px`);
});

test("M1: diagonal lines are single device pixels with no anti-aliasing", async ({ page }) => {
  await openTool(page, "screen-test");
  const result = await page.evaluate(() => {
    document.querySelector<HTMLButtonElement>("[data-pattern-id='lines-diagonal']")?.click();
    const canvas = document.querySelector<HTMLCanvasElement>(".pixel-exact-canvas");
    const data = canvas?.getContext("2d")?.getImageData(0, 0, 8, 8).data ?? new Uint8ClampedArray();
    let white = 0;
    let grey = 0;
    for (let i = 0; i < data.length; i += 4) {
      const value = data[i] ?? 0;
      if (value === 255) white += 1;
      else if (value !== 0) grey += 1;
    }
    return { white, grey };
  });
  expect(result).toEqual({ white: 16, grey: 0 });
});

test("M2: moving patterns animate only transform", async ({ page }) => {
  await openTool(page, "screen-test");
  for (const id of ["burnin-bars", "burnin-sweep"]) {
    const properties = await page.evaluate((patternId) => {
      document.querySelector<HTMLButtonElement>(`[data-pattern-id='${patternId}']`)?.click();
      const strip = document.querySelector(".burnin-strip");
      return (strip?.getAnimations() ?? []).flatMap((animation) =>
        (animation.effect as KeyframeEffect).getKeyframes().flatMap((frame) =>
          Object.keys(frame).filter((key) => !["offset", "easing", "composite", "computedOffset"].includes(key)),
        ),
      );
    }, id);
    expect(properties.length).toBeGreaterThan(0);
    expect(new Set(properties)).toEqual(new Set(["transform"]));
  }
});

test("M3: with hidden controls, the first tap only reveals them", async ({ page, isMobile }) => {
  test.skip(!isMobile, "Tap behaviour is tested on touch viewports");
  await openTool(page, "screen-test");
  await page.locator("#screen-fullscreen").click();
  const shell = page.locator("tool-runtime-shell");
  await expect(shell).toHaveAttribute("data-fullscreen", "true");
  await expect(shell).toHaveAttribute("data-controls-visible", "false", { timeout: 5000 });
  const label = page.locator("#screen-pattern-label");
  const before = await label.textContent();
  const viewport = page.viewportSize();
  await page.touchscreen.tap((viewport?.width ?? 0) * 0.8, (viewport?.height ?? 0) * 0.3);
  await expect(shell).toHaveAttribute("data-controls-visible", "true");
  await page.waitForTimeout(300); // let any (wrongly) forwarded click land
  await expect(label).toHaveText(before ?? "");
  await page.touchscreen.tap((viewport?.width ?? 0) * 0.8, (viewport?.height ?? 0) * 0.3);
  await expect(label).not.toHaveText(before ?? "");
});
