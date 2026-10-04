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
