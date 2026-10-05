# Images

## How raster images work

Every raster image has one master: a 1200x630 PNG in `src/assets/images/`. The build makes everything else from it:

- **Content images:** AVIF in several widths, with a WebP fallback, through `src/components/site/ResponsiveImage.astro`.
- **Social preview (`og:image`):** a 1200x630 JPEG at quality 85, through `src/utils/site/ogImage.ts`.

To replace an image, export it as a 1200x630 PNG and overwrite the file at the same path. Then run `npm run build`. No code changes are needed.

Quality is set once in `astro.config.ts` (`image.service.config`): AVIF q80 (4:4:4), WebP q75, and JPEG with mozjpeg (`og:image` is q85). Astro's image cache does not notice changes to that config, so after changing it, delete `node_modules/.astro/assets` before building. Replacing a PNG needs no cache step, because the file's content is part of the cache key.

Export rules:

- Size: exactly 1200x630. With another aspect ratio, the `og:image` is cropped to 1200x630 around the centre and the cards crop in the browser. A master narrower than 1200 px limits the largest variant, because Astro does not upscale.
- Format: PNG, sRGB, no lossy step before export. Saving through JPEG or AVIF first adds artefacts that every generated variant inherits.
- Cards (home, `/phones`, tools and explainers grids) are 1200:630 boxes, so they show the whole image.
- The explainer hero crops the sides. Its box measured 0.73:1 on a 360 px phone and up to 1.15:1 at 1366 px and wider, so at 360 px only the centre 462 px of the 1200 px width is visible. Keep an explainer image's subject inside that centre strip.
- The small explainer list thumbnail (96x64, 1.5:1) shows the centre 945 px.

SVGs stay SVG: the Sorto illustrations, the SoC diagram, the logo and the icon sprites.

## Placeholders to replace

These files were generated from the earlier lossy AVIF files, so they carry those artefacts. Each one should be overwritten with a PNG exported from the original artwork.

| File | Used for |
|---|---|
| `src/assets/images/phones/tools/accelerometer-test.png` | Accelerometer test card and social preview |
| `src/assets/images/phones/tools/gyroscope-test.png` | Gyroscope test card and social preview |
| `src/assets/images/phones/tools/mic-test.png` | Mic test card and social preview |
| `src/assets/images/phones/tools/screen-test.png` | Screen test card (also on the home page) and social preview |
| `src/assets/images/phones/tools/speaker-test.png` | Speaker test card and social preview |
| `src/assets/images/phones/tools/stuck-pixel-fixer.png` | Stuck pixel fixer card and social preview |
| `src/assets/images/phones/tools/touch-test.png` | Touch test card and social preview |
| `src/assets/images/phones/tools.png` | "Tools" card on `/phones` |
| `src/assets/images/phones/explainers.png` | "Explainers" card on `/phones` |
| `src/assets/images/phones/explainers/soc/soc.png` | SoC explainer hero and card (also on the home page) and social preview |

`src/assets/images/site/st-og.png` is already a PNG master. It is the default social preview for pages without their own image.
