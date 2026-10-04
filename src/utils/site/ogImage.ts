// src/utils/site/ogImage.ts

import type { ImageMetadata } from "astro";
import { getImage } from "astro:assets";
import defaultOgSource from "@/assets/images/site/st-og.png";

export const OG_IMAGE_WIDTH = 1200;
export const OG_IMAGE_HEIGHT = 630;

export type OgImage = {
  url: string;
  type: "image/jpeg";
  width: number;
  height: number;
};

/**
 * Social preview image: a 1200x630 JPEG built from the page's own image (or
 * the site default). Crawlers that read og:image do not reliably accept
 * AVIF, which is what the page images are stored as.
 */
export async function getOgImage(
  source: ImageMetadata = defaultOgSource,
): Promise<OgImage> {
  const image = await getImage({
    src: source,
    format: "jpeg",
    width: OG_IMAGE_WIDTH,
    height: OG_IMAGE_HEIGHT,
    fit: "cover",
    position: "center",
  });
  return {
    url: image.src,
    type: "image/jpeg",
    width: OG_IMAGE_WIDTH,
    height: OG_IMAGE_HEIGHT,
  };
}
