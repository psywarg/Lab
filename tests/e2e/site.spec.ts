import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";
import { expect, test } from "@playwright/test";
import sharp from "sharp";
import { fontace } from "fontace";
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

test("M14: the diagram loads only near the viewport and the dialog copy has unique IDs", async ({ page }) => {
  await blockExternal(page);
  await page.goto("/phones/explainers/soc");
  await page.waitForTimeout(800);
  const viewer = page.locator("diagram-viewer");
  // Off screen: still the <img>, so the inline SVG was not fetched on load.
  await expect(viewer.locator("svg")).toHaveCount(0);
  await viewer.scrollIntoViewIfNeeded();
  await expect(viewer.locator("button[data-viewer-trigger] svg")).toHaveCount(1);
  await viewer.locator("button[data-viewer-trigger]").click();
  const dialog = viewer.locator("dialog");
  await expect(dialog.locator("svg[role='img']")).toHaveCount(1);
  const result = await page.evaluate(() => {
    const counts = new Map<string, number>();
    document.querySelectorAll("[id]").forEach((el) => counts.set(el.id, (counts.get(el.id) ?? 0) + 1));
    const dialogEl = document.querySelector("diagram-viewer dialog");
    const cpu = dialogEl?.querySelector(`[id="${dialogEl.id}-CPU"]`);
    return {
      duplicates: [...counts].filter(([, count]) => count > 1).map(([id]) => id),
      cpuTitle: cpu?.querySelector("title")?.textContent ?? null,
    };
  });
  expect(result).toEqual({ duplicates: [], cpuTitle: "Central Processing Unit" });
});

test("CLS: the explainer page stays under 0.1 while the web font swaps in on a phone", async ({ browser }, testInfo) => {
  test.skip(testInfo.project.name !== "desktop", "Sets its own phone viewport");
  const context = await browser.newContext({
    viewport: { width: 412, height: 915 },
    deviceScaleFactor: 2.625,
    isMobile: true,
    hasTouch: true,
  });
  const page = await context.newPage();
  await blockExternal(page);
  // Slow fonts, as on a first visit over a mobile connection.
  await page.route(/\.woff2$/, async (route) => {
    await new Promise((resolve) => setTimeout(resolve, 1500));
    await route.continue();
  });
  await page.addInitScript(() => {
    const shifts = { total: 0 };
    Object.assign(window, { __cls: shifts });
    new PerformanceObserver((list) => {
      for (const entry of list.getEntries() as (PerformanceEntry & { value: number; hadRecentInput: boolean })[]) {
        if (!entry.hadRecentInput) shifts.total += entry.value;
      }
    }).observe({ type: "layout-shift", buffered: true });
  });
  await page.goto("/phones/explainers/soc");
  await page.waitForFunction(() => document.fonts.status === "loaded" && performance.now() > 2000);
  await page.waitForTimeout(300);
  const cls = await page.evaluate(() => (window as unknown as { __cls: { total: number } }).__cls.total);
  // 0.1 is Google's "good" limit. The byline wrapping under the swap gave 0.25.
  expect(cls).toBeLessThan(0.1);
  await context.close();
});

/** Code points present in every Sorted font file (all weights and italic). */
function sortedFontCoverage(): (codePoint: number) => boolean {
  const dir = "src/assets/fonts/sorted";
  const ranges = readdirSync(dir)
    .filter((file) => file.startsWith("Sorted-") && file.endsWith(".woff2"))
    .map((file) =>
      fontace(readFileSync(join(dir, file))).unicodeRangeArray.map((range) => {
        const [start = "0", end = start] = range.replace("U+", "").split("-");
        return [parseInt(start, 16), parseInt(end, 16)] as const;
      }),
    );
  expect(ranges.length).toBe(4);
  return (codePoint) =>
    ranges.every((font) => font.some(([start, end]) => codePoint >= start && codePoint <= end));
}

// Static page and SVG text only: strings that scripts write at runtime are not
// checked (today those are emoji and one "→", which the original font lacked too).
test("Fonts: every character in the built pages is in the trimmed Sorted fonts", () => {
  test.skip(test.info().project.name !== "desktop", "Checks build output; one viewport is enough");
  const covered = sortedFontCoverage();
  const files = readdirSync("dist", { recursive: true, encoding: "utf8" }).filter(
    (file) => file.endsWith(".html") || file.endsWith(".svg"),
  );
  const missing = new Map<string, string>();
  for (const file of files) {
    const text = readFileSync(join("dist", file), "utf8")
      .replace(/<(script|style)[\s\S]*?<\/\1>/g, "")
      .replace(/<!--[\s\S]*?-->/g, "")
      .replace(/<[^>]+>/g, " ")
      .replace(/&#(\d+);/g, (_, code: string) => String.fromCodePoint(Number(code)))
      .replace(/&#x([0-9a-f]+);/gi, (_, code: string) => String.fromCodePoint(parseInt(code, 16)))
      .replace(/&[a-z]+;/gi, " ")
      .replace(/\s/g, "");
    for (const char of text) {
      if (!covered(char.codePointAt(0) ?? 0)) missing.set(char, file);
    }
  }
  expect([...missing].map(([char, file]) => `${char} (U+${(char.codePointAt(0) ?? 0).toString(16)}) in ${file}`)).toEqual([]);
});

test("every page: no words glued to a link or inline tag, and link names match their text", async ({ page }, testInfo) => {
  test.skip(testInfo.project.name !== "desktop", "Checks page text; one viewport is enough");
  const pages = readdirSync("dist", { recursive: true, encoding: "utf8" })
    .filter((file) => file.endsWith(".html"))
    .map((file) => `/${file.replace(/\\/g, "/").replace(/\.html$/, "")}`);
  await blockExternal(page);
  const glued: string[] = [];
  const mislabelled: string[] = [];
  for (const path of pages) {
    await page.goto(path);
    const found = await page.evaluate(() => {
      const INLINE = new Set(["A", "STRONG", "EM", "B", "I", "SPAN", "CODE", "BUTTON", "ABBR", "KBD", "MARK", "SMALL", "SUP", "SUB", "TIME", "LABEL", "Q", "CITE"]);
      const shown = (el: Element) => {
        const style = getComputedStyle(el);
        return style.display !== "none" && style.visibility !== "hidden" && el.getClientRects().length > 0;
      };
      const inFlow = (node: Node | null): node is Node =>
        !!node &&
        (node.nodeType === Node.TEXT_NODE
          ? (node.textContent ?? "").trim() !== ""
          : node instanceof Element && /^inline/.test(getComputedStyle(node).display) && shown(node));
      const textOf = (node: Node) => (node instanceof HTMLElement ? node.innerText : (node.textContent ?? ""));
      const glued: string[] = [];
      for (const el of document.body.querySelectorAll("*")) {
        if (!INLINE.has(el.tagName) || el.closest("svg, script, style, [aria-hidden='true']") || !shown(el)) continue;
        // Flex and grid children are laid out apart, whatever the markup.
        const parent = el.parentElement;
        if (!parent || /flex|grid/.test(getComputedStyle(parent).display) || !/^inline/.test(getComputedStyle(el).display)) continue;
        const inner = (el.textContent ?? "").replace(/\s+/g, " ");
        if (!inner.trim()) continue;
        const prev = inFlow(el.previousSibling) ? el.previousSibling : null;
        const next = inFlow(el.nextSibling) ? el.nextSibling : null;
        if (prev && /[\p{L}\p{N},.;:!?)"”’]$/u.test(textOf(prev)) && /^[\p{L}\p{N}("“‘_]/u.test(inner)) {
          glued.push(`${textOf(prev).slice(-20)}|${inner.slice(0, 20)}`);
        }
        if (next && /[\p{L}\p{N})"”’]$/u.test(inner) && /^[\p{L}\p{N}("“‘]/u.test(textOf(next))) {
          glued.push(`${inner.slice(-20)}|${textOf(next).slice(0, 20)}`);
        }
      }
      // WCAG 2.5.3: a control's spoken name contains its visible words.
      const normal = (text: string) => text.toLowerCase().replace(/[^\p{L}\p{N} ]/gu, "").replace(/\s+/g, " ").trim();
      const mislabelled: string[] = [];
      for (const el of document.querySelectorAll<HTMLElement>("a[aria-label], button[aria-label], summary[aria-label], a[aria-labelledby], button[aria-labelledby]")) {
        const visible = normal(el.innerText);
        if (!visible) continue;
        const labelledBy = el.getAttribute("aria-labelledby");
        const name = labelledBy
          ? labelledBy.split(/\s+/).map((id) => document.getElementById(id)?.textContent ?? "").join(" ")
          : (el.getAttribute("aria-label") ?? "");
        if (!normal(name).includes(visible)) mislabelled.push(`"${el.innerText.trim()}" is named "${name.trim()}"`);
      }
      return { glued, mislabelled };
    });
    glued.push(...found.glued.map((entry) => `${path}: ${entry}`));
    mislabelled.push(...found.mislabelled.map((entry) => `${path}: ${entry}`));
  }
  expect.soft(glued).toEqual([]);
  expect.soft([...new Set(mislabelled.map((entry) => entry.replace(/^[^:]+: /, "")))]).toEqual([]);
});
