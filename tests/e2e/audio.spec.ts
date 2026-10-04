import { expect, test } from "@playwright/test";
import { openTool } from "./helpers";

test.describe("speaker test", () => {
  test.beforeEach(async ({ page }) => {
    await page.addInitScript(() => {
      const created: OscillatorNode[] = [];
      Object.assign(window, { __oscillators: created });
      // eslint-disable-next-line @typescript-eslint/unbound-method -- re-bound with .call below
      const original = AudioContext.prototype.createOscillator;
      AudioContext.prototype.createOscillator = function (this: AudioContext) {
        const node = original.call(this);
        created.push(node);
        return node;
      };
    });
    await openTool(page, "speaker-test");
  });

  const lastFrequency = (page: import("@playwright/test").Page) =>
    page.evaluate(() => {
      const list = (window as unknown as { __oscillators: OscillatorNode[] }).__oscillators;
      return list.at(-1)?.frequency.value ?? 0;
    });

  test("a tone plays and reports a channel level", async ({ page }) => {
    await page.locator("#speaker-start").click();
    await expect(page.locator("#speaker-stage")).toHaveAttribute("data-playing", "true");
    await expect(page.locator("#speaker-level-left")).toHaveText(/Left [1-9]\d*%/);
  });

  test("H5: changing volume does not interrupt the sweep", async ({ page }) => {
    test.fail(true, "Review finding H5: volume input resets the sweep to the tone frequency");
    await page.evaluate(() => document.querySelector<HTMLButtonElement>("[data-speaker-signal='sweep']")?.click());
    await page.waitForTimeout(200);
    await page.locator("#speaker-start").click();
    await page.waitForTimeout(2000);
    const before = await lastFrequency(page);
    await page.evaluate(() => {
      const input = document.getElementById("speaker-volume") as HTMLInputElement;
      input.value = String(Number(input.value) - 5);
      input.dispatchEvent(new Event("input", { bubbles: true }));
    });
    await page.waitForTimeout(1500);
    const after = await lastFrequency(page);
    expect(after).toBeGreaterThan(before);
    expect(after).not.toBe(440);
  });

  test("M5: mono is as loud per side as a single channel", async ({ page }) => {
    test.fail(true, "Review finding M5: equal-power panner drops mono by 3 dB");
    const level = async (channel: string) => {
      await page.evaluate((id) => document.querySelector<HTMLButtonElement>(`[data-speaker-channel='${id}']`)?.click(), channel);
      await page.waitForTimeout(600);
      return Number.parseInt((await page.locator("#speaker-level-left").textContent())?.replace(/\D/g, "") ?? "0", 10);
    };
    await page.locator("#speaker-start").click();
    await page.waitForTimeout(500);
    const left = await level("left");
    const mono = await level("mono");
    expect(Math.abs(left - mono)).toBeLessThanOrEqual(1);
  });
});

test.describe("mic test", () => {
  test.beforeEach(async ({ page }) => {
    await page.addInitScript(() => {
      const devices = navigator.mediaDevices;
      const original = devices.getUserMedia.bind(devices);
      devices.getUserMedia = async (constraints) => {
        const stream = await original(constraints);
        Object.assign(window, { __stream: stream });
        return stream;
      };
    });
    await openTool(page, "mic-test");
    await page.locator("#mic-start").click();
    await expect(page.locator("#mic-start")).toHaveText("Stop");
  });

  test("records a sample and plays it back", async ({ page }) => {
    await page.locator("#mic-sample").click();
    await page.waitForTimeout(1500);
    await page.locator("#mic-sample").click();
    await expect(page.locator("#mic-play")).toBeEnabled();
    await page.locator("#mic-play").click();
    await expect(page.locator("#mic-play")).toHaveText(/Pause/);
  });

  test("H6: browser voice processing is off by default", async ({ page }) => {
    test.fail(true, "Review finding H6: getUserMedia({ audio: true }) keeps AGC/NS/EC on");
    const settings = await page.evaluate(() => {
      const stream = (window as unknown as { __stream: MediaStream }).__stream;
      const s = stream.getAudioTracks()[0]?.getSettings();
      return [s?.echoCancellation, s?.noiseSuppression, s?.autoGainControl];
    });
    expect(settings).toEqual([false, false, false]);
  });

  test("H7: the UI resets when the microphone track ends", async ({ page }) => {
    test.fail(true, "Review finding H7: track 'ended' is not handled");
    await page.evaluate(() => {
      const stream = (window as unknown as { __stream: MediaStream }).__stream;
      const track = stream.getAudioTracks()[0];
      track?.stop();
      track?.dispatchEvent(new Event("ended"));
    });
    await expect(page.locator("#mic-start")).toHaveText("Start");
  });
});
