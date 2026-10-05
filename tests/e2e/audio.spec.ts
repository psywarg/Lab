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

  test("H5: the frequency slider still retunes the steady tone", async ({ page }) => {
    await page.locator("#speaker-start").click();
    await expect(page.locator("#speaker-stage")).toHaveAttribute("data-playing", "true");
    await page.evaluate(() => {
      const input = document.getElementById("speaker-frequency") as HTMLInputElement;
      input.value = "1000";
      input.dispatchEvent(new Event("input", { bubbles: true }));
    });
    await expect.poll(() => lastFrequency(page)).toBeCloseTo(1000, 0);
  });

  test("M7: the volume slider is in dB", async ({ page }) => {
    await expect(page.locator("#speaker-volume-label")).toHaveText("-12 dB · 25%");
    await page.evaluate(() => {
      const input = document.getElementById("speaker-volume") as HTMLInputElement;
      input.value = "-60";
      input.dispatchEvent(new Event("input", { bubbles: true }));
    });
    await expect(page.locator("#speaker-volume-label")).toHaveText("Off");
  });

  test("M5: mono is as loud per side as a single channel", async ({ page }) => {
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

test.describe("speaker volume in water and hearing modes", () => {
  test.beforeEach(async ({ page }) => {
    await page.addInitScript(() => {
      const created: GainNode[] = [];
      Object.assign(window, { __gains: created });
      // eslint-disable-next-line @typescript-eslint/unbound-method -- re-bound with .call below
      const original = AudioContext.prototype.createGain;
      AudioContext.prototype.createGain = function (this: AudioContext) {
        const node = original.call(this);
        created.push(node);
        return node;
      };
    });
    await openTool(page, "speaker-test");
  });

  for (const mode of ["water", "hearing"]) {
    test(`the volume slider changes the level while ${mode} plays`, async ({ page }) => {
      await page.evaluate((id) => document.querySelector<HTMLButtonElement>(`[data-speaker-mode='${id}']`)?.click(), mode);
      await expect(page.locator("#speaker-stage")).toHaveAttribute("data-mode", mode);
      await page.locator("#speaker-start").click();
      await expect(page.locator("#speaker-stage")).toHaveAttribute("data-playing", "true");
      await page.evaluate(() => {
        const input = document.getElementById("speaker-volume") as HTMLInputElement;
        input.value = "-6";
        input.dispatchEvent(new Event("input", { bubbles: true }));
      });
      // -6 dB is a gain of 0.501; it was 0.251 (-12 dB) when playback started.
      await expect
        .poll(() =>
          page.evaluate(() => (window as unknown as { __gains: GainNode[] }).__gains.at(-1)?.gain.value ?? 0),
        )
        .toBeCloseTo(0.501, 2);
    });
  }
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
    const settings = await page.evaluate(() => {
      const stream = (window as unknown as { __stream: MediaStream }).__stream;
      const s = stream.getAudioTracks()[0]?.getSettings();
      return [s?.echoCancellation, s?.noiseSuppression, s?.autoGainControl];
    });
    expect(settings).toEqual([false, false, false]);
  });

  test("H7: the UI resets when the microphone track ends", async ({ page }) => {
    await page.evaluate(() => {
      const stream = (window as unknown as { __stream: MediaStream }).__stream;
      const track = stream.getAudioTracks()[0];
      track?.stop();
      track?.dispatchEvent(new Event("ended"));
    });
    await expect(page.locator("#mic-start")).toHaveText("Start");
  });
});

test.describe("mic test controls", () => {
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
  });

  test("H6: call processing restarts the stream with processing on", async ({ page }) => {
    await openTool(page, "mic-test");
    await page.locator("#mic-start").click();
    await expect(page.locator("#mic-start")).toHaveText("Stop");
    await page.locator("#mic-processing").check();
    await expect(page.locator("#mic-start")).toHaveText("Stop");
    await expect
      .poll(() =>
        page.evaluate(() => {
          const stream = (window as unknown as { __stream: MediaStream }).__stream;
          const s = stream.getAudioTracks()[0]?.getSettings();
          return stream.active ? [s?.echoCancellation, s?.noiseSuppression, s?.autoGainControl] : null;
        }),
      )
      .toEqual([true, true, true]);
  });

  test("H7: the input picker lists microphones after permission", async ({ page }) => {
    await openTool(page, "mic-test");
    await page.locator("#mic-start").click();
    await expect(page.locator("#mic-start")).toHaveText("Stop");
    await expect.poll(() => page.locator("#mic-device option").count()).toBeGreaterThan(1);
    await expect(page.locator("#mic-device option").first()).toHaveText("System default");
  });

  test("M8: the level meter runs on the AudioWorklet", async ({ page }) => {
    // Blank the analyser's samples so only the worklet can move the meter.
    await page.addInitScript(() => {
      AnalyserNode.prototype.getFloatTimeDomainData = function (array: Float32Array) {
        array.fill(0);
      };
    });
    await openTool(page, "mic-test");
    await page.locator("#mic-start").click();
    await expect(page.locator("#mic-start")).toHaveText("Stop");
    // Chromium's fake microphone beeps about once a second; Peak holds the
    // highest level seen.
    await expect(page.locator("#mic-stat-peak")).toHaveText(/dBFS/, { timeout: 5000 });
  });
});
