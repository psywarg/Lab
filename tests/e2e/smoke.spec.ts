import { expect, test } from "@playwright/test";
import { TOOLS, collectErrors, openTool } from "./helpers";

for (const tool of TOOLS) {
  test(`${tool}: loads without errors or horizontal overflow`, async ({ page }) => {
    const errors = collectErrors(page);
    await openTool(page, tool);
    await expect(page.locator("tool-runtime-shell")).toBeVisible();
    const overflow = await page.evaluate(
      () => document.documentElement.scrollWidth - window.innerWidth,
    );
    expect(overflow).toBeLessThanOrEqual(0);
    expect(errors).toEqual([]);
  });
}

for (const tool of ["screen-test", "touch-test", "accelerometer-test", "gyroscope-test"]) {
  test(`${tool}: fullscreen opens over the viewport and closes again`, async ({ page }) => {
    await openTool(page, tool);
    const button = page.locator("[data-tool-runtime-fullscreen]");
    await button.click();
    const shell = page.locator("tool-runtime-shell");
    await expect(shell).toHaveAttribute("data-fullscreen", "true");
    const box = await shell.boundingBox();
    const viewport = page.viewportSize();
    expect(box).toMatchObject({ x: 0, y: 0, width: viewport?.width, height: viewport?.height });
    await page.evaluate(() => document.exitFullscreen());
    await expect(shell).toHaveAttribute("data-fullscreen", "false");
  });
}
