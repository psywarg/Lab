import { expect, test } from "@playwright/test";
import { TOOLS, openTool } from "./helpers";

// Single-select sidebars. The mic test has none, and the stuck pixel
// fixer's colour groups are multi-select (tested below).
const SINGLE_SELECT = TOOLS.filter((tool) => tool !== "mic-test" && tool !== "stuck-pixel-fixer");

for (const tool of SINGLE_SELECT) {
  test(`L5: ${tool} marks exactly the clicked sidebar item as pressed`, async ({ page }) => {
    await openTool(page, tool);
    const groups = await page.locator("[data-tool-sidebar-item-group]").count();
    expect(groups).toBeGreaterThan(0);
    for (let g = 0; g < groups; g += 1) {
      const items = page.locator("[data-tool-sidebar-item-group]").nth(g).locator("[data-tool-sidebar-item]");
      const count = await items.count();
      for (let i = count - 1; i >= 0; i -= 1) {
        await items.nth(i).evaluate((el) => (el as HTMLButtonElement).click());
        const pressed = await items.evaluateAll((els) => els.map((el) => el.getAttribute("aria-pressed")));
        expect(pressed, `${tool} group ${g} item ${i}`).toEqual(
          pressed.map((_, index) => (index === i ? "true" : "false")),
        );
      }
    }
  });
}

test("L5: stuck pixel colour groups stay multi-select", async ({ page }) => {
  await openTool(page, "stuck-pixel-fixer");
  await page.evaluate(() => document.querySelector<HTMLButtonElement>("[data-workflow-tab='manual']")?.click());
  const pattern = (id: string) => page.locator(`[data-repair-button][data-pattern-id='${id}']`);
  const ids = await page
    .locator("[data-repair-button]:not([data-pattern-kind='noise'])")
    .evaluateAll((els) => els.map((el) => (el as HTMLElement).dataset.patternId ?? ""));
  expect(ids.length).toBeGreaterThan(1);
  const [first, second] = ids;
  for (const id of [first, second]) {
    await pattern(id ?? "").evaluate((el) => (el as HTMLButtonElement).click());
  }
  await expect(pattern(first ?? "")).toHaveAttribute("aria-pressed", "true");
  await expect(pattern(second ?? "")).toHaveAttribute("aria-pressed", "true");
});
