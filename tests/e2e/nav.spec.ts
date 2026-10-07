import { expect, test, type Page } from "@playwright/test";
import { blockExternal, collectErrors, openTool } from "./helpers";

test("L3: a menu re-entered after two pending closes stays open", async ({ page, isMobile }) => {
  test.skip(isMobile, "Desktop navigation");
  await blockExternal(page);
  await page.goto("/");
  const menu = page.locator("desktop-menu").first();
  const box = await menu.boundingBox();
  if (!box) throw new Error("No desktop menu");
  const centre = { x: box.x + box.width / 2, y: box.y + box.height / 2 };
  await menu.locator("[data-nav-toggle]").focus();
  await page.mouse.move(centre.x, centre.y);
  await expect(menu.locator(".nav-dropdown")).toHaveClass(/open/);
  // Two close requests: the mouse leaves, then focus leaves.
  await page.mouse.move(centre.x, centre.y + 400);
  await page.evaluate(() => (document.activeElement as HTMLElement | null)?.blur());
  // Back on the menu within the 300 ms close delay.
  await page.mouse.move(centre.x, centre.y);
  await page.waitForTimeout(600);
  await expect(menu.locator(".nav-dropdown")).toHaveClass(/open/);
});

/** Presses Tab `count` times and returns whether focus ever left `allowed`. */
async function tabStaysWithin(page: Page, allowedSelector: string, count: number, shift = false) {
  const visited: string[] = [];
  for (let i = 0; i < count; i += 1) {
    await page.keyboard.press(shift ? "Shift+Tab" : "Tab");
    visited.push(
      await page.evaluate((selector) => {
        const active = document.activeElement;
        const inside = Array.from(document.querySelectorAll(selector)).some((el) => el.contains(active));
        return inside ? "in" : `out:${active?.tagName ?? "none"}`;
      }, allowedSelector),
    );
  }
  return visited;
}

test("L4: Tab stays inside the open mobile menu, including its close button", async ({ page, isMobile }) => {
  test.skip(!isMobile, "Mobile navigation");
  await blockExternal(page);
  await page.goto("/");
  const button = page.locator(".mobile-menu-btn");
  await button.click();
  await expect(button).toHaveAttribute("aria-expanded", "true");
  const allowed = "mobile-nav, .mobile-menu-btn";
  const forward = await tabStaysWithin(page, allowed, 30);
  const backward = await tabStaysWithin(page, allowed, 30, true);
  expect([...forward, ...backward].filter((step) => step !== "in")).toEqual([]);
  // The close button is reachable from inside the trap.
  let reached = false;
  for (let i = 0; i < 30 && !reached; i += 1) {
    await page.keyboard.press("Tab");
    reached = await button.evaluate((el) => el === document.activeElement);
  }
  expect(reached).toBe(true);
});

test("L4: Tab stays inside the open sidebar drawer, including its toggle", async ({ page, isMobile }) => {
  test.skip(!isMobile, "The sidebar is a drawer below lg");
  await openTool(page, "screen-test");
  const toggle = page.locator(".sidebar-toggle");
  await toggle.click();
  await expect(toggle).toHaveAttribute("aria-expanded", "true");
  const allowed = ".sidebar-panel, .sidebar-toggle";
  const steps = [...(await tabStaysWithin(page, allowed, 40)), ...(await tabStaysWithin(page, allowed, 10, true))];
  expect(steps.filter((step) => step !== "in")).toEqual([]);
});

test("L7: breadcrumb structured data is published", async ({ page }) => {
  await blockExternal(page);
  await page.goto("/phones/tools/screen-test");
  const types = await page
    .locator('script[type="application/ld+json"]')
    .evaluateAll((els) => els.map((el) => (JSON.parse(el.textContent ?? "{}") as { "@type"?: string })["@type"]));
  expect(types).toContain("BreadcrumbList");
});

test("L8: the footer year follows the visitor's clock", async ({ page }) => {
  await page.clock.setFixedTime(new Date("2031-06-01T12:00:00Z"));
  await blockExternal(page);
  await page.goto("/");
  await expect(page.locator("[data-footer-year]")).toHaveText("2031");
});

test("Footer: social links render as one row of icon tiles", async ({ page }) => {
  const errors = collectErrors(page);
  await blockExternal(page);
  await page.goto("/");
  const links = page.locator("footer ul[aria-label='Sorted Tech on social media'] a");
  await expect(links).toHaveCount(4);
  expect(await links.evaluateAll((anchors) => anchors.map((a) => a.getAttribute("href")))).toEqual([
    "https://www.youtube.com/@SortedTechHQ",
    "https://www.instagram.com/SortedTechHQ",
    "https://x.com/SortedTechHQ",
    "https://t.me/SortedTechHQ",
  ]);
  for (const name of ["YouTube", "Instagram", "X", "Telegram"]) {
    await expect(page.getByRole("link", { name: `Sorted Tech on ${name} (opens in a new tab)` })).toBeVisible();
  }
  const layout = await links.evaluateAll((anchors) =>
    anchors.map((a) => {
      const box = a.getBoundingClientRect();
      const icon = a.querySelector("use")?.getBBox();
      return { top: Math.round(box.top), width: box.width, height: box.height, icon: icon ? icon.width * icon.height : 0 };
    }),
  );
  for (const tile of layout) {
    expect(tile.top).toBe(layout[0]?.top);
    expect(tile.width).toBeGreaterThanOrEqual(40);
    expect(tile.height).toBeGreaterThanOrEqual(40);
    expect(tile.icon).toBeGreaterThan(0);
  }
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
  expect(errors.filter((error) => error.includes("Unsafe attempt"))).toEqual([]);
});

test("Footer: Cookie Settings sits in the disclaimer line, styled like View Disclaimer", async ({ page }) => {
  await blockExternal(page);
  for (const scheme of ["light", "dark"] as const) {
    await page.emulateMedia({ colorScheme: scheme });
    await page.goto("/");
    const note = page.locator("footer > div").last();
    expect((await note.textContent())?.replace(/\s+/g, " ").trim()).toBe(
      "Our content is independent, backed by data, and fueled by late-night coffee. View Disclaimer · Cookie Settings",
    );
    const colour = (locator: ReturnType<Page["locator"]>) => locator.evaluate((el) => getComputedStyle(el).color);
    const disclaimer = await colour(note.getByRole("link", { name: "Read full disclaimer" }));
    expect(await colour(note.getByRole("button", { name: "Cookie Settings" }))).toBe(disclaimer);
  }
});

test("Footer: page links stay on one line each, down to 320 px wide", async ({ page }) => {
  await blockExternal(page);
  await page.goto("/");
  const width = page.viewportSize()?.width ?? 0;
  for (const viewport of [width, 320]) {
    await page.setViewportSize({ width: viewport, height: 800 });
    const rows = await page.locator("footer > div:nth-of-type(2) > div").evaluateAll((groups) =>
      groups.map((group) => {
        const footer = group.closest("footer") as HTMLElement;
        const style = getComputedStyle(footer);
        return {
          width: group.getBoundingClientRect().width,
          room: footer.clientWidth - parseFloat(style.paddingLeft) - parseFloat(style.paddingRight),
          heights: [...group.querySelectorAll("a")].map((a) => a.getBoundingClientRect().height),
          lineHeight: parseFloat(getComputedStyle(group).lineHeight),
        };
      }),
    );
    expect(rows).toHaveLength(2);
    for (const row of rows) {
      expect(row.width).toBeLessThanOrEqual(row.room);
      for (const height of row.heights) expect(height).toBeLessThan(row.lineHeight * 1.5);
    }
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
  }
});

test("Footer: social icons share one size and line weight", async ({ page }) => {
  test.skip(test.info().project.name !== "desktop", "Measures the sprite; one viewport is enough");
  await blockExternal(page);
  await page.goto("/");
  const href = await page.locator("footer ul use").first().getAttribute("href");
  const sprite = await (await page.request.get(new URL(href ?? "", page.url()).href)).text();
  // Renders each symbol at 960 px and measures, in 24-unit terms, the drawn
  // box and the median line thickness (twice the distance from the ridge of
  // each line to its edge).
  const icons = await page.evaluate(async (text) => {
    const N = 960;
    const out: Record<string, { area: number; cx: number; cy: number; line: number }> = {};
    for (const m of text.matchAll(/<symbol id="(social-[^"]+)"([^>]*)>([\s\S]*?)<\/symbol>/g)) {
      const [, id = "", attrs = "", body = ""] = m;
      const fill = /fill="none"/.test(attrs) ? 'fill="none"' : "";
      const viewBox = /viewBox="([^"]+)"/.exec(attrs)?.[1] ?? "";
      const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${N}" height="${N}" viewBox="${viewBox}" ${fill} color="#000">${body}</svg>`;
      const img = new Image();
      img.src = `data:image/svg+xml,${encodeURIComponent(svg)}`;
      await img.decode();
      const ctx = new OffscreenCanvas(N, N).getContext("2d");
      if (!ctx) throw new Error("no 2d context");
      ctx.drawImage(img, 0, 0);
      const data = ctx.getImageData(0, 0, N, N).data;
      const dist = new Float64Array(N * N);
      let x0 = N, y0 = N, x1 = -1, y1 = -1;
      for (let i = 0; i < N * N; i++) {
        if ((data[i * 4 + 3] ?? 0) <= 127) continue;
        dist[i] = Infinity;
        const x = i % N, y = Math.floor(i / N);
        x0 = Math.min(x0, x); x1 = Math.max(x1, x); y0 = Math.min(y0, y); y1 = Math.max(y1, y);
      }
      const at = (x: number, y: number) => (x < 0 || y < 0 || x >= N || y >= N ? 0 : (dist[y * N + x] ?? 0));
      for (let y = 0; y < N; y++) for (let x = 0; x < N; x++) {
        const i = y * N + x;
        if (dist[i]) dist[i] = Math.min(dist[i] ?? 0, at(x - 1, y) + 3, at(x, y - 1) + 3, at(x - 1, y - 1) + 4, at(x + 1, y - 1) + 4);
      }
      for (let y = N - 1; y >= 0; y--) for (let x = N - 1; x >= 0; x--) {
        const i = y * N + x;
        if (dist[i]) dist[i] = Math.min(dist[i] ?? 0, at(x + 1, y) + 3, at(x, y + 1) + 3, at(x + 1, y + 1) + 4, at(x - 1, y + 1) + 4);
      }
      const ridge: number[] = [];
      for (let y = 1; y < N - 1; y++) for (let x = 1; x < N - 1; x++) {
        const i = y * N + x, v = dist[i] ?? 0;
        if (v && [-1, 1, -N, N, -N - 1, -N + 1, N - 1, N + 1].every((o) => v >= (dist[i + o] ?? 0))) ridge.push(v / 3);
      }
      ridge.sort((a, b) => a - b);
      const u = 24 / N;
      out[id] = {
        area: (x1 - x0 + 1) * (y1 - y0 + 1) * u * u,
        cx: ((x0 + x1 + 1) / 2) * u,
        cy: ((y0 + y1 + 1) / 2) * u,
        line: (2 * (ridge[Math.floor(ridge.length / 2)] ?? 0) - 1) * u,
      };
    }
    return out;
  }, sprite);
  expect(Object.keys(icons).sort()).toEqual(["social-instagram", "social-telegram", "social-x", "social-youtube"]);
  for (const [id, icon] of Object.entries(icons)) {
    expect.soft(icon.area, `${id} area`).toBeGreaterThan(324 * 0.95);
    expect.soft(icon.area, `${id} area`).toBeLessThan(324 * 1.05);
    expect.soft(Math.abs(icon.cx - 12), `${id} centre x`).toBeLessThan(0.25);
    expect.soft(Math.abs(icon.cy - 12), `${id} centre y`).toBeLessThan(0.25);
    expect.soft(Math.abs(icon.line - 2), `${id} line weight`).toBeLessThan(0.15);
  }
});
