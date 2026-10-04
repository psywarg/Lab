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
  test.fail(true, "Review finding M1: stripes labelled 1 device px are drawn 2 px wide");
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
