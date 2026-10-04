import { defineConfig, devices } from "@playwright/test";

const PORT = 4321;
const isCI = Boolean(process.env.CI);

// Chromium flags shared by every project: a fake microphone that needs no
// permission prompt, and audio that may start without a user gesture.
const chromiumArgs = [
  "--use-fake-device-for-media-stream",
  "--use-fake-ui-for-media-stream",
  "--autoplay-policy=no-user-gesture-required",
];

export default defineConfig({
  testDir: "./tests/e2e",
  fullyParallel: true,
  forbidOnly: isCI,
  retries: 0,
  reporter: isCI ? [["list"], ["html", { open: "never" }]] : "list",
  use: {
    baseURL: `http://127.0.0.1:${PORT}`,
    browserName: "chromium",
    launchOptions: { args: chromiumArgs },
    permissions: ["microphone", "accelerometer", "gyroscope", "magnetometer"],
    trace: "retain-on-failure",
  },
  webServer: {
    command: `node tests/e2e/serve.mjs`,
    env: { PORT: String(PORT) },
    url: `http://127.0.0.1:${PORT}/`,
    reuseExistingServer: !isCI,
  },
  projects: [
    {
      name: "desktop",
      use: { viewport: { width: 1366, height: 900 }, deviceScaleFactor: 1 },
    },
    {
      name: "pixel",
      use: { ...devices["Pixel 7"], browserName: "chromium" },
    },
    {
      // iPhone-sized viewport rendered by Chromium; not a WebKit test.
      name: "iphone-size",
      use: { ...devices["iPhone 14"], browserName: "chromium" },
    },
  ],
});
