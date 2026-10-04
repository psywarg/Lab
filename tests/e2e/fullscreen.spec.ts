import { expect, test } from "@playwright/test";
import { openTool } from "./helpers";

test.describe("fullscreen fallback without the Fullscreen API", () => {
  test.beforeEach(async ({ page }) => {
    await page.addInitScript(() => {
      Object.defineProperty(Element.prototype, "requestFullscreen", { value: undefined });
      Object.defineProperty(Element.prototype, "webkitRequestFullscreen", { value: undefined });
    });
  });

  test("C1: expanded shell covers the viewport and the exit button is reachable", async ({ page }) => {
    test.fail(true, "Review finding C1: .is-expanded stays in page flow");
    await openTool(page, "screen-test");
    await page.evaluate(() => window.scrollTo(0, 250));
    await page.locator("#screen-fullscreen").click();
    const shell = page.locator("tool-runtime-shell");
    await expect(shell).toHaveClass(/is-expanded/);
    const viewport = page.viewportSize();
    expect(await shell.boundingBox()).toMatchObject({ x: 0, y: 0, width: viewport?.width, height: viewport?.height });
    await expect(page.locator("#screen-fullscreen")).toBeInViewport();
  });
});

test("H1: in fullscreen nothing covers the exit button", async ({ page }, testInfo) => {
  test.fail(testInfo.project.name !== "desktop", "Review finding H1: Reset overlaps the exit button on phones");
  await openTool(page, "gyroscope-test");
  await page.locator("#gyro-fullscreen").click();
  await expect(page.locator("tool-runtime-shell")).toHaveAttribute("data-fullscreen", "true");
  const covered = await page.evaluate(() => {
    const button = document.getElementById("gyro-fullscreen");
    if (!button) return "missing";
    const rect = button.getBoundingClientRect();
    const hit = document.elementFromPoint(rect.left + rect.width * 0.25, rect.top + rect.height / 2);
    return button.contains(hit) ? "" : (hit?.id || hit?.className?.toString() || "unknown");
  });
  expect(covered).toBe("");
});
