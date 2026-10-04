import { expect, test } from "@playwright/test";
import { blockExternal, collectErrors } from "./helpers";

for (const [path, icon] of [
  ["/phones/tools", "open-card"],
  ["/phones/explainers/soc", "calendar"],
] as const) {
  test(`IMG1: the ${icon} sprite icon renders on ${path}`, async ({ page }) => {
    const errors = collectErrors(page);
    await blockExternal(page);
    await page.goto(path);
    const size = await page.evaluate((id) => {
      const use = document.querySelector<SVGUseElement>(`use[href$='#${id}']`);
      const box = use?.getBBox();
      return box ? box.width * box.height : 0;
    }, icon);
    expect(size).toBeGreaterThan(0);
    expect(errors.filter((error) => error.includes("Unsafe attempt"))).toEqual([]);
  });
}

test("IMG3: the first card image on listing pages loads eagerly", async ({ page }) => {
  await blockExternal(page);
  for (const path of ["/phones", "/phones/explainers"]) {
    await page.goto(path);
    const first = page.locator("main a img").first();
    await expect(first).toHaveAttribute("loading", "eager");
    await expect(first).toHaveAttribute("fetchpriority", "high");
  }
});

test("IMG9: the 404 page has no duplicate element IDs", async ({ page }) => {
  await blockExternal(page);
  await page.goto("/this-page-does-not-exist");
  const duplicates = await page.evaluate(() => {
    const counts = new Map<string, number>();
    document.querySelectorAll("[id]").forEach((el) => counts.set(el.id, (counts.get(el.id) ?? 0) + 1));
    return [...counts].filter(([, count]) => count > 1).map(([id]) => id);
  });
  expect(duplicates).toEqual([]);
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
