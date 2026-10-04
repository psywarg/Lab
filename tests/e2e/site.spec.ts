import { expect, test } from "@playwright/test";
import { blockExternal, collectErrors } from "./helpers";

test("IMG1: content-sprite icons render", async ({ page }) => {
  test.fail(true, "Review finding IMG1: the sprite is inlined as a data: URL that <use> refuses");
  const errors = collectErrors(page);
  await blockExternal(page);
  await page.goto("/phones/tools");
  const size = await page.evaluate(() => {
    const use = document.querySelector<SVGUseElement>("use[href$='#open-card']");
    const box = use?.getBBox();
    return box ? box.width * box.height : 0;
  });
  expect(size).toBeGreaterThan(0);
  expect(errors.filter((error) => error.includes("Unsafe attempt"))).toEqual([]);
});

for (const path of ["/phones/tools/screen-test", "/phones/explainers/soc"]) {
  test(`H8: ${path} publishes a JPEG or PNG social image with matching type`, async ({ page }) => {
    test.fail(true, "Review finding H8: og:image is AVIF but labelled image/png");
    await blockExternal(page);
    await page.goto(path);
    const image = await page.locator('meta[property="og:image"]').getAttribute("content");
    const type = await page.locator('meta[property="og:image:type"]').getAttribute("content");
    expect(image).toMatch(/\.(jpe?g|png)$/);
    expect(type).toBe(image?.endsWith(".png") ? "image/png" : "image/jpeg");
  });
}
