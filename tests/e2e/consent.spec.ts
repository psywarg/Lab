import { expect, test, type Page } from "@playwright/test";

/** Blocks external requests and records the ones aimed at Google. */
async function recordGoogle(page: Page): Promise<string[]> {
  const google: string[] = [];
  await page.route("**/*", (route) => {
    const url = route.request().url();
    if (url.startsWith("http://127.0.0.1")) return route.continue();
    if (/google(tagmanager|-analytics)?\./.test(url)) google.push(url);
    return route.abort();
  });
  return google;
}

const banner = (page: Page) => page.locator("#consent-banner");

test("H9: nothing is requested from Google before a choice", async ({ page }) => {
  const google = await recordGoogle(page);
  await page.goto("/");
  await expect(banner(page)).toBeVisible();
  await page.waitForTimeout(1500);
  expect(google).toEqual([]);
});

test("H9: Reject keeps Google off across a reload", async ({ page }) => {
  const google = await recordGoogle(page);
  await page.goto("/");
  await banner(page).getByRole("button", { name: "Reject" }).click();
  await expect(banner(page)).toBeHidden();
  await page.reload();
  await page.waitForTimeout(1000);
  await expect(banner(page)).toBeHidden();
  expect(google).toEqual([]);
});

test("H9: Accept loads gtag with real `arguments` commands, and again on the next page", async ({ page }) => {
  const google = await recordGoogle(page);
  await page.goto("/");
  await banner(page).getByRole("button", { name: "Accept" }).click();
  await expect(banner(page)).toBeHidden();
  await expect.poll(() => google.some((url) => url.includes("gtag/js?id=G-HJ4YRNZ9LG"))).toBe(true);
  const queued = await page.evaluate(() =>
    ((window as unknown as { dataLayer: unknown[] }).dataLayer ?? []).map((entry) => [
      Object.prototype.toString.call(entry),
      (entry as ArrayLike<unknown>)[0],
      (entry as ArrayLike<unknown>)[1],
    ]),
  );
  expect(queued.slice(0, 4)).toEqual([
    ["[object Arguments]", "consent", "default"],
    ["[object Arguments]", "consent", "update"],
    ["[object Arguments]", "js", expect.anything()],
    ["[object Arguments]", "config", "G-HJ4YRNZ9LG"],
  ]);
  google.length = 0;
  await page.goto("/about");
  await expect.poll(() => google.some((url) => url.includes("gtag/js"))).toBe(true);
  await expect(banner(page)).toBeHidden();
});

test("H9: Cookie Settings reopens the banner and can withdraw consent", async ({ page }) => {
  await recordGoogle(page);
  await page.goto("/");
  await banner(page).getByRole("button", { name: "Accept" }).click();
  await page.getByRole("button", { name: "Cookie Settings" }).click();
  await expect(banner(page)).toBeVisible();
  await expect(banner(page).getByRole("button", { name: "Accept" })).toBeFocused();
  await banner(page).getByRole("button", { name: "Reject" }).click();
  expect(await page.evaluate(() => localStorage.getItem("consent:analytics"))).toBe("denied");
});

test("H9: Accept after Reject on the same page grants analytics again", async ({ page }) => {
  await recordGoogle(page);
  await page.goto("/");
  await banner(page).getByRole("button", { name: "Accept" }).click();
  await page.getByRole("button", { name: "Cookie Settings" }).click();
  await banner(page).getByRole("button", { name: "Reject" }).click();
  // Consent Mode alone would keep sending cookieless pings on this page.
  expect(await page.evaluate(() => (window as unknown as Record<string, unknown>)["ga-disable-G-HJ4YRNZ9LG"])).toBe(true);
  await page.getByRole("button", { name: "Cookie Settings" }).click();
  await banner(page).getByRole("button", { name: "Accept" }).click();
  expect(await page.evaluate(() => (window as unknown as Record<string, unknown>)["ga-disable-G-HJ4YRNZ9LG"])).toBe(false);
  const lastConsent = await page.evaluate(() => {
    const updates = ((window as unknown as { dataLayer: ArrayLike<unknown>[] }).dataLayer ?? []).filter(
      (entry) => entry[0] === "consent" && entry[1] === "update",
    );
    return (updates.at(-1)?.[2] as { analytics_storage?: string } | undefined)?.analytics_storage;
  });
  expect(lastConsent).toBe("granted");
});

test("Banner text is the small size, so the banner takes less of a phone screen", async ({ page }) => {
  await recordGoogle(page);
  await page.setViewportSize({ width: 360, height: 780 });
  await page.goto("/");
  await expect(banner(page)).toBeVisible();
  const sizes = await banner(page).evaluate((section) => {
    const size = (el: Element | null) => (el ? getComputedStyle(el).fontSize : "");
    const small = document.createElement("span");
    small.className = "text-small";
    document.body.append(small);
    const expected = size(small);
    small.remove();
    return {
      expected,
      title: size(section.querySelector("h2")),
      body: size(section.querySelector("p")),
      buttons: [...section.querySelectorAll("button")].map(size),
      buttonHeights: [...section.querySelectorAll("button")].map((button) => button.getBoundingClientRect().height),
      height: section.getBoundingClientRect().height,
      text: section.querySelector("p")?.textContent?.replace(/\s+/g, " ").trim(),
    };
  });
  expect(sizes.title).toBe(sizes.expected);
  expect(sizes.body).toBe(sizes.expected);
  expect(sizes.buttons).toEqual([sizes.expected, sizes.expected]);
  // WCAG 2.5.8 minimum target size.
  for (const height of sizes.buttonHeights) expect(height).toBeGreaterThanOrEqual(24);
  // 246 px before the change (16.4 px text).
  expect(sizes.height).toBeLessThan(246);
  expect(sizes.text).toContain("See the Privacy Policy.");
});
