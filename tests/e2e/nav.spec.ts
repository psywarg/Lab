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

test("Footer: Cookie settings is the same colour as the footer links", async ({ page }) => {
  await blockExternal(page);
  for (const scheme of ["light", "dark"] as const) {
    await page.emulateMedia({ colorScheme: scheme });
    await page.goto("/");
    const colour = (locator: ReturnType<Page["locator"]>) => locator.evaluate((el) => getComputedStyle(el).color);
    const link = await colour(page.locator("footer a[href='/about']"));
    expect(await colour(page.getByRole("button", { name: "Cookie settings" }))).toBe(link);
  }
});
