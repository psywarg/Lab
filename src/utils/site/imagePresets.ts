// src/utils/site/imagePresets.ts

export type ResponsiveImageLayout = "constrained" | "full-width" | "fixed" | "none";

interface ResponsiveImagePreset {
  layout: ResponsiveImageLayout;
  sizes: string;
  widths: number[];
}

// One preset per real layout. Each `sizes` is the rendered width of the
// image, measured at 360 to 1920 px viewports (phones with overlay
// scrollbars); `widths` cover 1x to 3x of those, up to the 1200 px masters.
// tests/e2e/images.spec.ts checks that the downloaded width stays within
// 0.95 to 1.3 of what is displayed.
export const IMAGE_PRESETS = {
  // Home spotlight thumbnail: w-30 / sm:w-40 / lg:w-50.
  "spotlight-thumbnail": {
    layout: "constrained",
    sizes: "(min-width: 1024px) 200px, (min-width: 640px) 160px, 120px",
    widths: [120, 160, 200, 240, 320, 400, 480, 600],
  },
  // /phones hub: one column, then two columns from md, capped by the 64rem
  // page column (500 px per card from a 1086 px viewport).
  "hub-card": {
    layout: "constrained",
    sizes: "(min-width: 1086px) 500px, (min-width: 768px) calc(50vw - 43px), calc(100vw - 18px)",
    widths: [400, 480, 560, 640, 800, 1000, 1200],
  },
  // /phones/tools grid: one column, then fixed 20rem cards from sm.
  "tools-card": {
    layout: "constrained",
    sizes: "(min-width: 640px) 318px, calc(100vw - 18px)",
    widths: [320, 480, 640, 800, 1000, 1200],
  },
  // /phones/explainers grid: as tools, inside a padded series box.
  "explainer-card": {
    layout: "constrained",
    sizes: "(min-width: 640px) 318px, calc(100vw - 52px)",
    widths: [320, 480, 640, 800, 960, 1200],
  },
  // Explainer list thumbnail: a fixed 96x64 box.
  "explainer-thumbnail": {
    layout: "constrained",
    sizes: "96px",
    widths: [96, 192, 288],
  },
  // Explainer hero: object-fit cover in a box narrower than 1200:630, so
  // the image is drawn at the box height (h-42 to lg:h-72, less 2 px)
  // times 1200/630, wider than the box itself.
  "explainer-hero": {
    layout: "none",
    sizes: "(min-width: 1024px) 545px, (min-width: 768px) 469px, (min-width: 640px) 392px, 316px",
    widths: [320, 400, 480, 640, 800, 960, 1200],
  },
} satisfies Record<string, ResponsiveImagePreset>;

export type ImagePresetName = keyof typeof IMAGE_PRESETS;
