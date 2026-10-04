// src/utils/site/imagePresets.ts

export type ResponsiveImageLayout = "constrained" | "full-width" | "fixed";

interface ResponsiveImagePreset {
  layout: ResponsiveImageLayout;
  sizes: string;
  widths: number[];
}

export const IMAGE_PRESETS = {
  "spotlight-thumbnail": {
    layout: "constrained",
    sizes: "(min-width: 1024px) 200px, (min-width: 640px) 160px, 120px",
    widths: [120, 160, 200, 240, 320, 400],
  },
  "phone-image": {
    layout: "constrained",
    sizes: "(min-width: 1024px) 320px, (min-width: 640px) 300px, 40vw",
    widths: [160, 240, 320, 480, 640],
  },
  "index-card": {
    layout: "constrained",
    sizes:
      "(min-width: 1280px) 280px, (min-width: 768px) calc((100vw - 5rem) / 2), calc(100vw - 2rem)",
    widths: [320, 480, 640, 768],
  },
  "article-card": {
    layout: "constrained",
    sizes: "(min-width: 1024px) 180px, (min-width: 640px) 160px, 120px",
    widths: [120, 160, 180, 240, 320, 360],
  },
  "article-hero": {
    layout: "full-width",
    sizes:
      "(min-width: 1280px) 928px, (min-width: 1024px) calc(100vw - 22rem), (min-width: 768px) calc(100vw - 3rem), calc(100vw - 1rem)",
    widths: [480, 640, 828, 1024, 1280],
  },
} satisfies Record<string, ResponsiveImagePreset>;
