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

test("M12: every page loads with no CSP violations and the response headers set", async ({ page }, testInfo) => {
  test.skip(testInfo.project.name !== "desktop", "Policy is per page, not per viewport");
  const pages = readdirSync("dist", { recursive: true, encoding: "utf8" })
    .filter((file) => file.endsWith(".html"))
    .map((file) => `/${file.replace(/\\/g, "/").replace(/\.html$/, "")}`);
  await page.addInitScript(() => {
    const seen: string[] = [];
    Object.assign(window, { __cspViolations: seen });
    document.addEventListener("securitypolicyviolation", (event) =>
      seen.push(`${event.violatedDirective} ${event.blockedURI}`),
    );
  });
  await blockExternal(page);
  for (const path of pages) {
    const response = await page.goto(path);
    expect(response?.headers()["x-content-type-options"], path).toBe("nosniff");
    expect(response?.headers()["content-security-policy"], path).toContain("frame-ancestors 'none'");
    await expect(page.locator('meta[http-equiv="content-security-policy"]'), path).toHaveCount(1);
    await page.mouse.wheel(0, 4000);
    await page.waitForTimeout(300);
    const violations = await page.evaluate(
      () => (window as unknown as { __cspViolations: string[] }).__cspViolations,
    );
    expect(violations, path).toEqual([]);
  }
});

test("M12: hashed assets are served as immutable", async ({ request }) => {
  const html = await (await request.get("/")).text();
  const asset = /\/_astro\/[^"']+\.(?:js|css)/.exec(html)?.[0];
  expect(asset).toBeTruthy();
  const response = await request.get(asset ?? "");
  expect(response.headers()["cache-control"]).toBe("public, max-age=31536000, immutable");
});

test("M12: the CSP blocks an injected inline script", async ({ page }) => {
  await blockExternal(page);
  await page.goto("/");
  const ran = await page.evaluate(async () => {
    const blocked = new Promise<string>((resolve) =>
      document.addEventListener("securitypolicyviolation", (event) => resolve(event.violatedDirective), {
        once: true,
      }),
    );
    const script = document.createElement("script");
    script.textContent = "window.__injected = true";
    document.body.append(script);
    return { ran: (window as unknown as { __injected?: boolean }).__injected === true, directive: await blocked };
  });
  expect(ran).toEqual({ ran: false, directive: "script-src-elem" });
});
