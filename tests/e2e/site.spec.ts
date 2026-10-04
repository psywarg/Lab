import { readdirSync } from "node:fs";
import { join } from "node:path";
import { expect, test } from "@playwright/test";
import sharp from "sharp";
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

test("H8: every page publishes a 1200x630 JPEG social image with matching tags", async ({ page }, testInfo) => {
  test.skip(testInfo.project.name !== "desktop", "Checks build output; one viewport is enough");
  const pages = readdirSync("dist", { recursive: true, encoding: "utf8" })
    .filter((file) => file.endsWith(".html"))
    .map((file) => `/${file.replace(/\\/g, "/").replace(/\.html$/, "")}`);
  expect(pages.length).toBeGreaterThan(10);
  await blockExternal(page);
  for (const path of pages) {
    await page.goto(path);
    const meta = (property: string) =>
      page.locator(`meta[property="og:image${property}"]`).getAttribute("content");
    const url = new URL((await meta("")) ?? "");
    expect(await meta(":type"), path).toBe("image/jpeg");
    expect(await meta(":width"), path).toBe("1200");
    expect(await meta(":height"), path).toBe("630");
    const info = await sharp(join("dist", url.pathname)).metadata();
    expect([info.format, info.width, info.height], path).toEqual(["jpeg", 1200, 630]);
  }
});
