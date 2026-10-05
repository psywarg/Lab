# Score audit

Date: 2026-10-04. Scores are out of 10, comparing the original code review with the code after the six fix PRs and the image review. Each score cites only things measured in this work. Anything not measured is marked **not verified**.

## Summary

| Area | Review | Now | Main evidence | Not verified |
|---|---|---|---|---|
| Build and tooling | 6 | 9 | CI green on every PR; lint covers `.astro` scripts; 0 audit findings | None |
| Architecture | 5 | **7** | 18 tested tool modules, 106 unit tests, listed duplicates removed | Below 8: see below |
| Performance | 7 | 8 | Immutable caching, eager LCP card, transform-only animations, no analytics before consent, images sized to the layout | Field LCP/INP |
| Screen test | 7 | 8 | 1 px patterns, transform animations, tap-to-reveal, fps readout, fallback fullscreen | Real devices |
| Stuck pixel fixer | 6 | 8 | 3/s cap above 140 px, truthful copy, no auto-start, diagnosis unit tests | Flash analyser; diagnosis UI flow |
| Touch test | 4 | 8 | 100% coverage, graded precision, equal Hz for 1 and 2 fingers, drift e2e | Real touch screens |
| Speaker test | 6 | 8 | Sweep survives volume changes, mono level matched, dB slider, noise tests | Actual speaker output |
| Mic test | 5 | 8 | Raw capture, device loss handled, worklet meter on every sample | Real-device picker and unplug |
| Accelerometer test | 3 | 8 | Raw sensor drives verdicts; injected 1.30 g reads 1.30 g "High offset" | iOS permission prompt (M9) |
| Gyroscope test | 4 | 8 | Raw bias and noise; 4 deg/s reads 3.5 to 4.5; 8 deg/s capture accepted | M10 legacy orientation sign |
| Image pipeline | 5 | 8 | PNG masters, AVIF with WebP fallback, downloads 0.95 to 1.3x displayed size, SVGO, 1200x630 JPEG OG images | Final artwork: masters are placeholders |

## Delivery

| Phase | PR | Content |
|---|---|---|
| 0 | psywarg/Lab#1 | Lockfile, `.gitignore`, engines, audit fixes, lint for `.astro` scripts, Vitest, Playwright, CI |
| 1 | psywarg/Lab#2 | Fullscreen fallback, dock overlap, screen patterns, touch test, stuck-pixel flash limits |
| 2 | psywarg/Lab#3 | Accelerometer and gyroscope read raw data; iOS permission timing |
| 3 | psywarg/Lab#4 | Speaker sweep, mono level, dB volume; mic raw capture, device handling, worklet meter |
| 4 | psywarg/Lab#5 | Icons, OG images, consent-gated analytics, strict CSP and headers, contact worker, diagram viewer, nav accessibility |
| 5 | psywarg/Lab#6 | Logic moved into tested modules; this audit |
| Images | this PR | PNG masters, AVIF with WebP fallback, per-layout sizes, OG quality, SVGO |

## Test inventory (measured on this branch)

- **Unit (Vitest):** 106 tests in 13 files.
  - Modules covered: `accelerometer`, `analytics`, `audio`, `contact` (worker), `gyroscope`, `mic`, `motion`, `screen`, `shared` (`runtimeShell`, `stats`, `strokeWaveform`), `site-utils`, `speaker`, `stuckPixel`, `touch`.
- **E2e (Playwright, Chromium):** 222 tests in 12 files, each run at desktop (1366x900), Pixel 7 and iPhone 14 viewport.
  - 194 passed, 28 skipped by design: touch tests skip on desktop, nav tests skip on the other viewport type, and dist-wide checks and the image sizing tests (which set their own viewports) run once.
  - The suite runs under the production `_headers` and the per-page CSP.
- **Other checks:**
  - `astro check`: 0 errors, 0 warnings, 0 hints.
  - `eslint .`: clean.
  - `npm audit`: 0 vulnerabilities.
  - Build: 20 pages.
- **Before/after evidence:** each review finding has a test that failed on the old code and passes now. The exceptions are recorded in the PRs: H8 and H9 were not re-run on the old code, and the L5 multi-select test passes on both.

## Area notes

### Build and tooling: 9
- CI (`.github/workflows/ci.yml`) runs `astro check`, lint, unit tests, build and e2e from the lockfile. It was green on PRs #1 to #5; the runs I timed took 3m13s to 3m51s.
- ESLint now reads `<script>` blocks in `.astro` files; before Phase 0 it silently skipped them.
- **Not 10 because:** e2e runs Chromium only. There is no WebKit or Firefox project.

### Architecture: 7 (target 8 not reached)
- **Done:**
  - Verdict and number-producing logic lives in 18 modules under `src/utils/phones/tools/`, plus `src/utils/site/analytics.ts`, `ogImage.ts` and the contact worker. All have unit tests.
  - Duplicates removed:
    - graph drawing
    - generic-sensor start
    - permission flow
    - `average`/`mean`/`median`
    - band averaging
    - `finiteNumber`
    - runtime-shell helpers (5 pages)
    - waveform drawing (mic and speaker)
    - the motion start button
- **Script lines per tool page:**

  | Page | Before Phase 5 | After | Change |
  |---|---|---|---|
  | stuck pixel | 2329 | 1952 | −377 |
  | gyroscope | 1866 | 1784 | −82 |
  | touch | 1666 | 1465 | −201 |
  | accelerometer | 1388 | 1320 | −68 |
  | screen | 1342 | 1311 | −31 |
  | mic | 1091 | 1085 | −6 |
  | speaker | 1005 | 966 | −39 |
  | **total** | **10687** | **9883** | **−804 (−7.5%)** |

- **Why 7, not 8:**
  - The pages are not "DOM wiring only". Each still owns its state, timers and rendering. Stuck pixel and gyroscope are above the 1,400-line estimate given when the logic-first scope was chosen.
  - In the accelerometer and gyroscope, `recoverFromGenericSensorFailure`, `requestSensorFullscreen` and `handleStartButton` are still identical. Each calls 5 to 8 page functions, so sharing them needs a per-page state object first.
- **What would reach 8:**
  - Give each tool a state object and a controller module, with the page only binding DOM elements.
  - Then share the sensor lifecycle between accelerometer and gyroscope.
  - This is the "full 600-line target" option that was declined for Phase 5.

### Performance: 8
- `/_astro/*` is served `public, max-age=31536000, immutable`. This is measured through the e2e server, which applies `_headers`; Cloudflare production is **not verified**.
- The first card image on `/phones` and `/phones/explainers` is eager with `fetchpriority="high"` (IMG3 test). The explainer hero no longer competes at high priority.
- Burn-in animations move a layer with `transform` instead of repainting `background-position` (M2 test).
- Google Analytics, previously loaded through Partytown on every visit, now loads only after Accept (H9 tests).
- Tool page script bundles are 12.6 to 29.3 KB raw and 4.9 to 9.7 KB gzip. Measured from `dist/_astro`.
- **Not verified:** field Core Web Vitals.
- Image bytes per page are in the image pipeline section. They rose, mainly on phones, because images were previously served below the needed resolution.

### Screen test: 8
- Stripe and diagonal patterns draw 1-device-px lines matching their labels (M1 canvas test).
- Sliding Bars and Gradient Sweep animate `transform` (M2).
- A tap while the controls are hidden only reveals them (M3).
- The gamma pattern shows a measured "NN fps" (new test).
- Fallback fullscreen covers the viewport (C1).
- **Not verified:** real devices.

### Stuck pixel fixer: 8
- Colour cycling is capped at 3/s except for spots of 140 px or less (H11 e2e at 140 and 160 px; unit tests on `speedRange`). The 140 px boundary is an estimate from assumed viewing distances, **not** a flash-analyser measurement.
- The "WCAG Level A / AAA" claim is replaced with the actual limits.
- Flashing can no longer auto-start (M13).
- Defect classification is unit tested: stuck-on, hot, dead, surface mark, uneven patch and unclear.
- **Not verified:** the diagnosis tap flow end to end. There is no e2e test for it; only its logic is unit tested.

### Touch test: 8
- Tapping every drawn cell reports 100% (C4).
- A 5 px offset grades "Centre" (C5).
- The bottom row is reachable and hold-to-pause works (H2).
- The two-finger sample rate is not doubled (H3). The tolerance is 0.6 to 1.75 because CDP timing varies under load; the bug gave 2.0.
- Input type, pressure and contact size are shown (H4).
- Drift: tracing the guide reads at most 4 px, and 30 px off reads 26 to 34 px (new e2e).
- **Not verified:** real touch screens and edge rejection.

### Speaker test: 8
- A volume change no longer resets the sweep (H5).
- Mono matches Left per side (M5).
- The volume slider is in dB (M7).
- The meter uses 12 Hz bins and accurate copy (M4).
- Noise buffers are 10 s (M6). Pink and brown spectra are checked with seeded unit tests.
- **Not verified:** what real speakers output.

### Mic test: 8
- Echo cancellation, noise suppression and auto gain are off by default, with a "Call processing" toggle (H6).
- Track end, mute and device change are handled, and there is an input picker (H7).
- An AudioWorklet meters every sample. Its e2e test blanks the analyser, so only the worklet can move Peak (M8).
- **Not verified:** the picker and unplug handling on real Android and iOS devices.

### Accelerometer test: 8
- The raw `Accelerometer` drives X/Y/Z, total force, offset and noise: an injected 1.30 g reads above 1.2 g and "High offset" (C2).
- The optional linear sensor drives shake detection (e2e).
- `stepAccel` is unit tested on synthetic streams.
- **Not verified:** the iOS permission prompt timing (M9) on a real iPhone.

### Gyroscope test: 8
- Drift is raw bias over 48 samples. A 4 deg/s bias reads 3.5 to 4.5 deg/s, "Minor drift" under the unchanged thresholds (C3).
- Zero-rate capture accepts a steady 8 deg/s offset and removes it.
- **Not verified:** M10, the legacy `window.orientation` sign. It is unchanged and needs a real iOS device.

### Image pipeline: 8
- **Correctness (Phase 4):**
  - Content-sprite icons render (IMG1).
  - Every `og:image` in `dist` is a real 1200x630 JPEG with matching tags (H8; checked with sharp across all 20 pages).
  - LCP priority is correct (IMG3, IMG4).
  - The 404 page has no duplicate IDs (IMG9).
  - The manifest has separate `any` and `maskable` icons (IMG11).
- **Masters (IMG6):** every raster image is a 1200x630 PNG in `src/assets/images/`, listed in `docs/images.md`. The lossy AVIF masters and the unused `cpu.avif` are removed.
- **Formats and quality (IMG5, IMG6):**
  - `ResponsiveImage.astro` serves AVIF with a WebP fallback for all 6 content images. No PNG or JPEG variant is emitted (IMG5 test).
  - AVIF is q80 with full colour resolution (4:4:4), and WebP q75. q80 is about 1.9x the bytes of q60 and 2.3 to 2.5 dB closer to the master at 1000w. q50 visibly smoothed fine texture in 2x crops.
- **Sizing (IMG2):** one preset per layout, with `sizes` taken from measured boxes. The IMG2 test checks each image at 360@3x, 412@2.625x, 1024, 1366 and 1920: measured ratios are 1.00 to 1.17. The old build fails it: `/phones` cards at 0.64 on phones, the explainer hero at 0.38 to 0.43 on desktop, and tool cards at 1.51 at 1024.
- **OG weight (IMG7):** JPEG q85 with mozjpeg, 31.9 to 127.4 KB per image (`st-og` 127.4 KB). Before, they were q80, 33.4 to 124.4 KB.
- **SVGs (IMG8):** SVGO with IDs and symbols kept takes `src/assets` SVGs from 162.9 KB to 121.3 KB (`notfound-404` 62.8 to 38.5 KB). Screenshots of 7 pages, light and dark, desktop and phone, differ only in anti-aliasing.
- **Build output:** images in `dist/_astro` went from 12.39 MB to 1.88 MB, mostly from dropping the PNG fallbacks. Total `dist` went from 14.31 MB to 3.77 MB.
- **Image bytes per page** (all images that load after scrolling to the bottom):

  | Page | Phone 412@2.625x before | After | Desktop 1366 before | After |
  |---|---|---|---|---|
  | `/` | 4.9 KB | 12.3 KB | 2.7 KB | 6.1 KB |
  | `/phones` | 19.5 KB | 96.0 KB | 6.0 KB | 28.9 KB |
  | `/phones/tools` | 39.8 KB | 202.0 KB | 14.0 KB | 28.5 KB |
  | `/phones/explainers` | 13.6 KB | 48.1 KB | 3.4 KB | 9.1 KB |
  | `/phones/explainers/soc` | 4.1 KB | 48.1 KB | 4.1 KB | 27.5 KB |

  Raster bytes went up mainly because the old build served images below the needed resolution (ratios above). On `/phones/tools` (phone), the new sizes give 69.2 KB at q50 and 95.6 KB at q60; q80 gives 202.0 KB. The quality is one line in `astro.config.ts`.
- **Not fixed, with reasons:**
  - **IMG10:** Astro emits every imported SVG file to `dist/_astro`, even when it is only used inline (`emitImageMetadata` runs before the SVG component branch in `vite-plugin-assets.js`, with no option to skip it). The 5 Sorto files, 70.6 KB in total, are unreferenced. Visitors never download them.
  - **M15:** the 404 illustrations stay inline. As `<img>` they rendered at a different size, because the inline SVGs keep their fixed height attributes. SVGO cut `404.html` from 108.9 KB to 79.4 KB (41.5 to 29.1 KB gzip).
- **Not 9 because:** the masters are placeholders made from the old lossy AVIF files, so they carry those artefacts until the originals are exported.

## Also changed, outside the original scorecard
- **Security headers:**
  - A strict hash-based CSP comes from Astro `security.csp`, with inline `style=""` attributes allowed through `style-src-attr` only.
  - An injected inline script is blocked (e2e).
  - `_headers` adds `frame-ancestors 'none'`, a Permissions-Policy, `nosniff` and a Referrer-Policy.
- **Contact worker:** it only says "sent" after the upstream accepts. It also checks the Turnstile hostname and caps the body size (unit tests).
- **Accessibility:** focus is trapped in the mobile menu and the sidebar drawer, and the desktop menu has a single pending close.

## Checks only you can do
1. Real devices, iPhone and Android:
   - fullscreen start and exit on every tool (C1)
   - the motion permission prompt (M9)
   - legacy orientation (M10)
   - the mic picker and unplug handling
   - the touch grid edges
2. After deploy:
   - `curl -I` on a page and on a `/_astro/` file, to confirm the headers
   - send one real contact form; Turnstile under the CSP is untested
   - GA DebugView after Accept
   - a social-share debugger on a tool page
3. Images: export the PNG originals at 1200x630 over the placeholders listed in `docs/images.md`, then rebuild.
