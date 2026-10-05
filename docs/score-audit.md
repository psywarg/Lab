# Score audit

Date: 2026-10-05. Scores are out of 10, comparing the original code review with the code after the six fix PRs, the image review and a final review pass. Each score cites only things measured in this work. Anything not measured is marked **not verified**.

## Summary

| Area | Review | Now | Main evidence | Not verified |
|---|---|---|---|---|
| Build and tooling | 6 | 9 | CI green on every PR; lint covers `.astro` scripts; 0 audit findings | None |
| Architecture | 5 | **7** | 18 tested tool modules, 106 unit tests, listed duplicates removed | Below 8: see below |
| Performance | 7 | 9 | Lab FCP and LCP 88 to 220 ms faster than before the font trim on 8 pages, CLS at most 0.001 on every page at 360 px on slow 4G, fonts 85% smaller, no analytics before consent | Field LCP/INP/CLS |
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
| Images | psywarg/Lab#7 | PNG masters, AVIF with WebP fallback, per-layout sizes, OG quality, SVGO |
| Images | psywarg/Lab#8 | AVIF q80 (4:4:4) |
| Review | psywarg/Lab#9 | Consent re-grant fix, font-swap CLS fixes, rescore |
| Fonts | this PR | Sorted trimmed to Latin; preloading 500 and 600 tested and rejected |

## Test inventory (measured on this branch)

- **Unit (Vitest):** 106 tests in 13 files.
  - Modules covered: `accelerometer`, `analytics`, `audio`, `contact` (worker), `gyroscope`, `mic`, `motion`, `screen`, `shared` (`runtimeShell`, `stats`, `strokeWaveform`), `site-utils`, `speaker`, `stuckPixel`, `touch`.
- **E2e (Playwright, Chromium):** 231 tests in 12 files, each run at desktop (1366x900), Pixel 7 and iPhone 14 viewport.
  - 199 passed, 32 skipped by design: touch tests skip on desktop, nav tests skip on the other viewport type, and dist-wide checks and the image sizing tests (which set their own viewports) run once.
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

### Performance: 9
- Fonts: see "Fonts (2026-10-05)" below. Trimming them to Latin is the change that lifts this to 9.
- `/_astro/*` is served `public, max-age=31536000, immutable`. This is measured through the e2e server, which applies `_headers`; Cloudflare production is **not verified**.
- The first card image on `/phones` and `/phones/explainers` is eager with `fetchpriority="high"` (IMG3 test). The explainer hero no longer competes at high priority.
- Burn-in animations move a layer with `transform` instead of repainting `background-position` (M2 test).
- Google Analytics, previously loaded through Partytown on every visit, now loads only after Accept (H9 tests).
- Tool page script bundles are 12.6 to 29.3 KB raw and 4.9 to 9.7 KB gzip. Measured from `dist/_astro`.
- Lab comparison against the original code: see "Final review pass" below.
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
  - AVIF is q80 with full colour resolution (4:4:4), and WebP q75. q80 is 1.8 to 1.9x the bytes of q60 and 1.9 to 2.5 dB closer to the master at 1000w. q50 visibly smoothed fine texture in 2x crops.
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

## Final review pass (2026-10-05)

Everything from `6deb952` (the original upload) to `main` was re-checked.

**Method**
- **Clean install from the lockfile:** `astro check` 0/0/0, lint clean, 106 unit tests, 20 pages built, `npm audit` 0.
- **Full e2e:** 198 passed, 30 skipped by design.
- **Page sweep:** all 20 pages at 1366, Pixel 7, iPhone 14 and 320 px, in light and dark. No console errors, CSP violations, broken images or horizontal overflow.
- **Tool flows:** each tool's controls driven at 4 viewports, including fullscreen entry and exit with and without the Fullscreen API, touch hold-to-pause with touch and with a mouse, mic start and speaker start/stop. No errors.
- **Code review:** the contact worker, consent and analytics, layout and CSP, diagram viewer, motion modules and mic device handling.
- **Lab performance:** the original build and the current build served the same way (Brotli, as Cloudflare compresses text), on Pixel 7 with slow 4G (150 ms, 1.6 Mbps) and the CPU slowed 4x. Each value is the median of 3 loads.

**Found and fixed (each with a test that failed first)**
1. **Consent:** Reject then Accept on the same page left `analytics_storage` denied until the next page load. `loadAnalytics` now re-grants. New e2e test.
2. **Explainer CLS, present before this work too:** on a 412 px phone the byline wrapped onto a second line only after the Sorted font loaded, pushing the article down 39 px.
   - Measured CLS: 0.162 (original), 0.172 to 0.247 (current, depending on font timing).
   - The byline now stacks below 640 px, as its hidden `|` separator already implied.
3. **Consent banner CLS:** the banner was shown before the fonts loaded, and the swap resized it on screen. That added 0.03 to 0.09 to first-visit CLS. It now appears after `document.fonts.ready`.
   - With fonts delayed 1.5 s, CLS on the SoC explainer is 0.033, down from 0.247. A new e2e test holds it under 0.1.

**Checked, not a bug:** hidden stuck-pixel diagnosis buttons (they are `inert` and `visibility: hidden`); the screen test's Auto mode entering fullscreen (by design); the Shiki CSP build warning (there are no code blocks, and inline style attributes are allowed anyway).

**Lab results, original → current**

| Page | FCP | LCP | CLS | TBT | Bytes |
|---|---|---|---|---|---|
| `/` | 832 → 820 ms | 832 → 820 ms | 0.002 → 0.005 | 105 → 82 ms | 264 → 277 KB |
| `/phones` | 836 → 952 ms | 1208 → 980 ms | 0.001 → 0.002 | 95 → 81 ms | 211 → 294 KB |
| `/phones/tools` | 820 → 804 ms | 820 → 804 ms | 0.001 → 0.002 | 89 → 68 ms | 244 → 362 KB |
| `/phones/explainers/soc` | 916 → 952 ms | 916 → 952 ms | 0.162 → 0.003 | 167 → 145 ms | 205 → 251 KB |
| `/contact` | 808 → 840 ms | 808 → 840 ms | 0.001 → 0.002 | 64 → 87 ms | 189 → 195 KB |
| screen test | 928 → 976 ms | 928 → 976 ms | 0.002 → 0.002 | 158 → 173 ms | 210 → 220 KB |
| mic test | 944 → 980 ms | 944 → 980 ms | 0.002 → 0.002 | 185 → 178 ms | 203 → 212 KB |
| touch test | 940 → 956 ms | 940 → 956 ms | 0.002 → 0.002 | 176 → 172 ms | 209 → 219 KB |

- The CLS column here is measured with fonts arriving at normal speed.
- Bytes rose mostly from images, which are now served at the needed resolution and AVIF q80.
- The compressed stylesheet shrank from 38.7 KB to 16.4 KB, because the original inlined the SVG sprites into it.
- Both builds had Google requests blocked. In production, the original also loaded Partytown and gtag for every visitor; the current code loads nothing until Accept.

**Open, not fixed**
- **Font-swap reflow on slow first visits** (since fixed under realistic conditions, see "Fonts (2026-10-05)"). With the font delayed 1.5 s and no Arial installed, ordinary paragraphs re-wrap when the font arrives. At 360 px, 4 pages still exceed 0.1: methodology 0.193, terms 0.185, accelerometer 0.202, gyroscope 0.249.
  - Astro's adjusted fallback is based on `local("Arial")`. That exists on Windows, macOS and iOS but not on Android or this test machine, so this measures the Android-like case.
  - Options, not measurable here: (a) fallbacks ending in `system-ui`, so Astro also builds adjusted Roboto, Segoe UI and Helvetica Neue fallbacks; (b) `font-display: optional` for body text, which removes the shift but shows the system font on first visits over slow connections; (c) preloading the 500 and 600 weights.
- **Contact delivery check:** a 2xx response from the Apps Script counts as sent. If the script can fail while still returning 200, that is not detected. Unknown without the script's source.

**Scores after this pass:** unchanged from the summary table. Performance stays at 8: the new lab evidence supports it, and the font-swap reflow on slow first visits keeps it from 9.
- Average across the 11 areas: original review 5.3 (58 of 110), now 8.0 (88 of 110).

## Fonts (2026-10-05)

**Findings**
- Each Sorted file (51 KB) carried 472 characters and 1,059 glyphs: Devanagari, Greek, Cyrillic, Latin Extended-A and four stylistic sets the site never uses.
- The site's text uses ASCII plus © ° · ’ “ ” •.

**Change**
- The fonts were trimmed once with `subset-font` 2.9.0 to Google Fonts' Latin range and the default OpenType features. Each file now has 223 glyphs.
- The trim script and the original files were removed afterwards at your request.
- Sizes: Regular 51.1 to 7.8 KB, Medium 50.5 to 7.6 KB, SemiBold 51.1 to 7.9 KB, Italic 58.6 to 8.5 KB (each 85% smaller).
- Screenshots of 7 pages in light and dark, desktop and phone, plus the diagram dialog, are pixel-identical (29 of 29).
- A dist test reads the font files themselves (with `fontace`) and fails if any page's static text or SVG text uses a character they lack. It catches ↑ and the U+2010 hyphen, which are in the Latin range but not in the font, and correctly passes – and ó.
  - Text written by scripts at runtime is not checked. Today that is emoji and one "→", which the original font lacked too.

**Lab results** (Pixel 7, slow 4G, CPU 4x, Brotli, median of 3)
- **A:** before the font trim (`main` at `1063bc2`).
- **B:** trimmed fonts (this PR).
- **C:** trimmed fonts plus preloading 500 and 600.

| Page | FCP A / B / C | LCP A / B / C | Fonts finished A / B / C | KB A / B / C |
|---|---|---|---|---|
| `/` | 816 / 728 / 776 | 816 / 728 / 776 | 1916 / 1090 / 1045 | 277 / 102 / 102 |
| `/phones` | 896 / 756 / 740 | 992 / 808 / 876 | 1818 / 1038 / 896 | 294 / 168 / 168 |
| `/phones/tools` | 872 / 700 / 744 | 872 / 700 / 744 | 2253 / 1053 / 948 | 362 / 235 / 235 |
| `/phones/explainers/soc` | 968 / 748 / 812 | 968 / 748 / 812 | 1631 / 1038 / 978 | 251 / 125 / 125 |
| `/contact` | 788 / 700 / 712 | 788 / 700 / 712 | 1442 / 948 / 864 | 195 / 68 / 68 |
| screen test | 964 / 812 / 864 | 964 / 812 / 864 | 1632 / 1061 / 1008 | 220 / 93 / 93 |
| mic test | 972 / 796 / 844 | 972 / 796 / 844 | 1631 / 1054 / 993 | 212 / 86 / 86 |
| touch test | 964 / 796 / 816 | 964 / 796 / 816 | 1648 / 1053 / 956 | 219 / 92 / 92 |

(Times in ms.)

- **Trimming (B):** FCP and LCP are 88 to 220 ms faster on every page, fonts finish 0.4 to 1.2 s sooner, and each page downloads 127 KB less.
- **Preloading 500 and 600 (C): rejected** under the rule set in advance. Fonts finished 45 to 157 ms sooner, but FCP was 52 to 64 ms slower on 2 pages and LCP 68 ms slower on `/phones`, because the preloads compete with the stylesheet. Only the regular weight stays preloaded.
- **CLS at 360 px on slow 4G, all 20 pages:** worst page 0.200 (gyroscope) and 0.115 (methodology) before; worst page 0.001 after.
  - With the font artificially delayed 1.5 s the reflow still occurs. That now needs a slower connection than the slow-4G profile.

**Rescore:** Performance goes from 8 to 9.
- Average across the 11 areas: original review 5.3 (58 of 110), now 8.1 (89 of 110).
- Not 10, because field Core Web Vitals are not verified, and image bytes are higher than in the original (a quality choice).

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
