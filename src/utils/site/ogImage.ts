// src/utils/site/ogImage.ts

import type { ImageMetadata } from "astro";

export const DEFAULT_OG_IMAGE = "/site/images/st-og.png";

type OgImageModule = { default: ImageMetadata };
type OgImageSource = ImageMetadata | string | null | undefined;

const pngImages = import.meta.glob<OgImageModule>(
  "/src/assets/images/**/*.png",
  {
    eager: true,
  },
);

function isImageMetadata(value: OgImageSource): value is ImageMetadata {
  return typeof value === "object" && value !== null && "src" in value;
}

function normalizeSourcePath(path: string): string {
  return path.replace(/\\/g, "/").replace(/^\/assets\//, "/src/assets/");
}

function assertPng(path: string): void {
  const cleanPath = path.split(/[?#]/, 1)[0];
  if (!cleanPath.toLowerCase().endsWith(".png")) {
    throw new Error(
      `OG image must be a PNG: ${path}. Use a .png file or omit it to fall back to ${DEFAULT_OG_IMAGE}.`,
    );
  }
}

function resolveSource(source: OgImageSource): string | undefined {
  if (!source) return undefined;

  const sourcePath = isImageMetadata(source) ? source.src : source;
  assertPng(sourcePath);

  const normalizedPath = normalizeSourcePath(sourcePath);
  const importedImage = pngImages[normalizedPath]?.default;
  if (importedImage) return importedImage.src;

  return normalizedPath.startsWith("/src/assets/") ? undefined : sourcePath;
}

export function resolvePngOgImage(
  source: OgImageSource,
  candidates: readonly string[] = [],
): string {
  const resolvedSource = resolveSource(source);
  if (resolvedSource) return resolvedSource;

  for (const candidate of candidates) {
    const image = pngImages[normalizeSourcePath(candidate)]?.default;
    if (image) return image.src;
  }

  return DEFAULT_OG_IMAGE;
}
