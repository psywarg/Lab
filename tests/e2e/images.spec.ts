import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { expect, test } from "@playwright/test";
import { blockExternal } from "./helpers";

const PAGES = ["/", "/phones", "/phones/tools", "/phones/explainers", "/phones/explainers/soc"];
const VIEWPORTS = [
  { width: 360, height: 800, deviceScaleFactor: 3, isMobile: true },
  { width: 412, height: 915, deviceScaleFactor: 2.625, isMobile: true },
  { width: 1024, height: 768, deviceScaleFactor: 1, isMobile: false },
  { width: 1366, height: 900, deviceScaleFactor: 1, isMobile: false },
  { width: 1920, height: 1080, deviceScaleFactor: 1, isMobile: false },
];

for (const viewport of VIEWPORTS) {
  test(`IMG2: content images download 0.95 to 1.3x the displayed size at ${viewport.width}@${viewport.deviceScaleFactor}x`, async ({ browser }, testInfo) => {
    test.skip(testInfo.project.name !== "desktop", "Sets its own viewports");
    const { width, height, deviceScaleFactor, isMobile } = viewport;
    const context = await browser.newContext({ viewport: { width, height }, deviceScaleFactor, isMobile, hasTouch: isMobile });
    const page = await context.newPage();
    await blockExternal(page);
    for (const path of PAGES) {
      await page.goto(path);
      const images = page.locator("picture img");
      const count = await images.count();
      expect(count, path).toBeGreaterThan(0);
      for (let index = 0; index < count; index += 1) {
        const image = images.nth(index);
        if (!(await image.isVisible())) continue;
        await image.scrollIntoViewIfNeeded();
        await expect.poll(() => image.evaluate((img: HTMLImageElement) => img.complete && img.currentSrc !== "")).toBe(true);
        const result = await image.evaluate((img: HTMLImageElement) => {
          const source = img.parentElement?.querySelector<HTMLSourceElement>("source");
          const candidates = (source?.srcset || img.srcset).split(",").map((entry) => {
            const [url = "", descriptor = ""] = entry.trim().split(/\s+/);
            return { url, width: Number.parseInt(descriptor, 10) };
          });
          const current = new URL(img.currentSrc).pathname;
          const downloaded = candidates.find((candidate) => candidate.url === current)?.width ?? 0;
          const box = img.getBoundingClientRect();
          // object-fit: cover draws the image at the box height when the box
          // is narrower than the image, so that is the width shown.
          const aspect = Number(img.getAttribute("width")) / Number(img.getAttribute("height"));
          const cover = getComputedStyle(img).objectFit === "cover" && box.width / box.height < aspect;
          const shown = (cover ? box.height * aspect : box.width) * devicePixelRatio;
          const widths = candidates.map((candidate) => candidate.width);
          return {
            current,
            ratio: downloaded / shown,
            atCeiling: downloaded === Math.max(...widths),
            atFloor: downloaded === Math.min(...widths),
          };
        });
        const label = `${path} #${index} ${result.current} ratio ${result.ratio.toFixed(2)}`;
        // Below 0.95 only when the 1200 px master is the largest variant;
        // above 1.3 only when the smallest variant is still too big.
        if (!result.atCeiling) expect(result.ratio, label).toBeGreaterThanOrEqual(0.95);
        if (!result.atFloor) expect(result.ratio, label).toBeLessThanOrEqual(1.3);
      }
    }
    await context.close();
  });
}

test("IMG5: content images ship AVIF with a WebP fallback and no PNG or JPEG variants", () => {
  test.skip(test.info().project.name !== "desktop", "Checks build output; one viewport is enough");
  const pages = readdirSync("dist", { recursive: true, encoding: "utf8" }).filter((file) => file.endsWith(".html"));
  let pictures = 0;
  for (const file of pages) {
    const html = readFileSync(join("dist", file), "utf8");
    for (const [picture] of html.matchAll(/<picture[\s\S]*?<\/picture>/g)) {
      pictures += 1;
      expect(picture, file).toMatch(/<source srcset="[^"]+\.avif /);
      const fallback = /<img src="([^"]+)" srcset="([^"]+)"/.exec(picture);
      expect(fallback?.[1], file).toMatch(/\.webp$/);
      expect(fallback?.[2], file).not.toMatch(/\.(png|jpe?g) /);
    }
  }
  expect(pictures).toBeGreaterThan(10);
});
