import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import mdx from "@astrojs/mdx";

import sitemap from "@astrojs/sitemap";
import tailwindcss from "@tailwindcss/vite";
import { defineConfig, fontProviders } from "astro/config";
import { SITE_ORIGIN } from "./src/utils/site/schema";

const ASTRO_CONTENT_MODULES: string[] = [
  "astro:content",
  "astro/content",
  "astro/content/runtime",
  "astro/content-layer",
];
const VITE_OPTIMIZE_EXCLUDES = [...ASTRO_CONTENT_MODULES];

// The theme script is inlined with `is:inline`, which Astro does not hash,
// so its CSP hash is computed here from the same file the layout inlines.
const THEME_INIT_HASH: `sha256-${string}` = `sha256-${createHash("sha256")
  .update(readFileSync("./src/scripts/theme-init.js", "utf8"))
  .digest("base64")}`;

// Encoder settings for every generated image. Astro's image cache is keyed on
// each transform (size, format, quality passed in code), not on these
// defaults, so changing one would silently reuse images made with the old
// value. Folding a hash of them into the cache folder gives each set its own
// cache.
const IMAGE_ENCODERS = {
  avif: { quality: 80, chromaSubsampling: "4:4:4" },
  webp: { quality: 75 },
  jpeg: { mozjpeg: true },
} as const;
const IMAGE_ENCODERS_HASH = createHash("sha256")
  .update(JSON.stringify(IMAGE_ENCODERS))
  .digest("hex")
  .slice(0, 8);

// Hosts from Google's GA4 CSP guide and Cloudflare's Turnstile CSP guide.
const GOOGLE_TAG = "https://*.googletagmanager.com";
const GOOGLE_ANALYTICS = "https://*.google-analytics.com";
const GOOGLE_ANALYTICS_REGION = "https://*.analytics.google.com";
const TURNSTILE = "https://challenges.cloudflare.com";

export default defineConfig({
  site: SITE_ORIGIN,
  trailingSlash: "never",
  prefetch: true,
  fonts: [
    {
      provider: fontProviders.local(),
      name: "Sorted",
      cssVariable: "--font-sorted",
      fallbacks: ["sans-serif"],
      options: {
        variants: [
          {
            weight: 400,
            style: "normal",
            src: ["./src/assets/fonts/sorted/Sorted-Regular.woff2"],
            display: "swap",
          },
          {
            weight: 400,
            style: "italic",
            src: ["./src/assets/fonts/sorted/Sorted-Italic.woff2"],
            display: "optional",
          },
          {
            weight: 500,
            style: "normal",
            src: ["./src/assets/fonts/sorted/Sorted-Medium.woff2"],
            display: "swap",
          },
          {
            weight: 600,
            style: "normal",
            src: ["./src/assets/fonts/sorted/Sorted-SemiBold.woff2"],
            display: "swap",
          },
        ],
      },
    },
    {
      provider: fontProviders.local(),
      name: "SortedLogo",
      cssVariable: "--font-sorted-logo",
      fallbacks: ["sans-serif"],
      optimizedFallbacks: false,
      options: {
        variants: [
          {
            weight: 700,
            style: "normal",
            src: ["./src/assets/fonts/sorted/SortedLogo-Bold.woff2"],
            display: "swap",
          },
        ],
      },
    },
  ],
  build: {
    format: "file",
  },
  cacheDir: `./node_modules/.astro/${IMAGE_ENCODERS_HASH}`,
  image: {
    // Content images are AVIF with a WebP fallback. AVIF is q80 with full
    // colour resolution (4:4:4): 1.8 to 1.9x the bytes of q60, and 1.9 to
    // 2.5 dB closer to the master at 1000w. JPEG is only used for
    // og:image (q85, set in ogImage.ts); mozjpeg makes it 12 to 22% smaller
    // at that quality.
    service: {
      entrypoint: "astro/assets/services/sharp",
      config: IMAGE_ENCODERS,
    },
  },
  security: {
    // Scripts and <style> elements must match a hash or an allowed origin.
    // Inline style="" attributes stay allowed: the tools use them for data
    // driven swatches, and they cannot run code.
    csp: {
      algorithm: "SHA-256",
      directives: [
        "default-src 'self'",
        `img-src 'self' data: blob: ${GOOGLE_ANALYTICS} ${GOOGLE_TAG}`,
        `connect-src 'self' ${GOOGLE_ANALYTICS} ${GOOGLE_ANALYTICS_REGION} ${GOOGLE_TAG}`,
        `frame-src ${TURNSTILE}`,
        "media-src 'self' blob:",
        "object-src 'none'",
        "base-uri 'self'",
        "form-action 'self'",
      ],
      scriptDirective: {
        resources: ["'self'", GOOGLE_TAG, TURNSTILE],
        hashes: [THEME_INIT_HASH],
      },
      styleDirective: {
        resources: ["'self'", { resource: "'unsafe-inline'", kind: "attribute" }],
      },
    },
  },
  vite: {
    plugins: [tailwindcss()],
    build: {
      // Never inline SVGs as data: URLs: <use href> refuses data: URLs, so
      // inlined sprites render nothing.
      assetsInlineLimit: (filePath: string) =>
        filePath.endsWith(".svg") ? false : undefined,
    },
    optimizeDeps: {
      exclude: VITE_OPTIMIZE_EXCLUDES,
    },
    ssr: {
      optimizeDeps: {
        exclude: VITE_OPTIMIZE_EXCLUDES,
      },
      noExternal: ASTRO_CONTENT_MODULES,
    },
  },
  integrations: [
    mdx(),

    sitemap({
      namespaces: {
        news: false,
        xhtml: false,
        image: false,
        video: false,
      },
    }),
  ],
  output: "static",
});
