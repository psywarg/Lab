# Score audit

Date: 2026-10-04. Scores are out of 10, comparing the original code review with the code after the six fix PRs. Each score cites only things measured in this work. Anything not measured is marked **not verified**.

## Summary

| Area | Review | Now | Main evidence | Not verified |
|---|---|---|---|---|
| Build and tooling | 6 | 9 | CI green on every PR; lint covers `.astro` scripts; 0 audit findings | None |
| Architecture | 5 | **7** | 18 tested tool modules, 106 unit tests, listed duplicates removed | Below 8: see below |
| Performance | 7 | 8 | Immutable caching, eager LCP card, transform-only animations, no analytics before consent | Field LCP/INP; deferred image weight |
| Screen test | 7 | 8 | 1 px patterns, transform animations, tap-to-reveal, fps readout, fallback fullscreen | Real devices |
| Stuck pixel fixer | 6 | 8 | 3/s cap above 140 px, truthful copy, no auto-start, diagnosis unit tests | Flash analyser; diagnosis UI flow |
| Touch test | 4 | 8 | 100% coverage, graded precision, equal Hz for 1 and 2 fingers, drift e2e | Real touch screens |
| Speaker test | 6 | 8 | Sweep survives volume changes, mono level matched, dB slider, noise tests | Actual speaker output |
| Mic test | 5 | 8 | Raw capture, device loss handled, worklet meter on every sample | Real-device picker and unplug |
| Accelerometer test | 3 | 8 | Raw sensor drives verdicts; injected 1.30 g reads 1.30 g "High offset" | iOS permission prompt (M9) |
| Gyroscope test | 4 | 8 | Raw bias and noise; 4 deg/s reads 3.5 to 4.5; 8 deg/s capture accepted | M10 legacy orientation sign |
| Image pipeline (correctness) | 5 | 8 | Icons render, 1200x630 JPEG OG images, LCP priority, no duplicate IDs | Deferred weight and quality items |

## Delivery

| Phase | PR | Content |
|---|---|---|
| 0 | psywarg/Lab#1 | Lockfile, `.gitignore`, engines, audit fixes, lint for `.astro` scripts, Vitest, Playwright, CI |
| 1 | psywarg/Lab#2 | Fullscreen fallback, dock overlap, screen patterns, touch test, stuck-pixel flash limits |
| 2 | psywarg/Lab#3 | Accelerometer and gyroscope read raw data; iOS permission timing |
| 3 | psywarg/Lab#4 | Speaker sweep, mono level, dB volume; mic raw capture, device handling, worklet meter |
| 4 | psywarg/Lab#5 | Icons, OG images, consent-gated analytics, strict CSP and headers, contact worker, diagram viewer, nav accessibility |
| 5 | this PR | Logic moved into tested modules; this audit |

## Test inventory (measured on this branch)

- **Unit (Vitest):** 106 tests in 13 files.
  - Modules covered: `accelerometer`, `analytics`, `audio`, `contact` (worker), `gyroscope`, `mic`, `motion`, `screen`, `shared` (`runtimeShell`, `stats`, `strokeWaveform`), `site-utils`, `speaker`, `stuckPixel`, `touch`.
- **E2e (Playwright, Chromium):** 204 tests in 11 files, each run at desktop (1366x900), Pixel 7 and iPhone 14 viewport.
  - 188 passed, 16 skipped by design: touch tests skip on desktop, nav tests skip on the other viewport type, and dist-wide checks run once.
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
- **Deferred to the image review:** IMG2, IMG5, IMG6, IMG7 weight, IMG8, IMG10 and M15.

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

### Image pipeline (correctness only): 8
- Content-sprite icons render (IMG1).
- Every `og:image` in `dist` is a real 1200x630 JPEG with matching tags (H8; checked with sharp across all 20 pages).
- LCP priority is correct (IMG3, IMG4).
- The 404 page has no duplicate IDs (IMG9).
- The manifest has separate `any` and `maskable` icons (IMG11).
- **Deferred:** the weight and quality items listed under Performance.

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
