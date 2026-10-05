// scripts/subset-fonts.mjs
// `npm run fonts:subset` trims the Sorted fonts in src/assets/fonts/sorted/source/
// to Latin and writes them to src/assets/fonts/sorted/, where astro.config.ts
// loads them. Run it after replacing a source font, then commit both.

import { readFile, readdir, writeFile } from "node:fs/promises";
import { join } from "node:path";
import subsetFont from "subset-font";
import { latinSubsetText } from "../src/utils/site/fontSubset.ts";

const SOURCE_DIR = "src/assets/fonts/sorted/source";
const OUTPUT_DIR = "src/assets/fonts/sorted";

// Features browsers apply by default, plus the numeric ones CSS can turn on.
// The fonts' stylistic sets (ss01 to ss04) and Devanagari shaping are not
// used by the site and are dropped.
const KEEP_FEATURES = [
  "ccmp", "locl", "mark", "mkmk", "kern", "liga", "clig", "calt", "rlig", "rvrn",
  "frac", "numr", "dnom", "sups", "subs", "tnum", "pnum", "lnum", "onum", "case",
];

const files = (await readdir(SOURCE_DIR)).filter((file) => file.endsWith(".woff2"));
const text = latinSubsetText();
for (const file of files) {
  const source = await readFile(join(SOURCE_DIR, file));
  const subset = await subsetFont(source, text, {
    targetFormat: "woff2",
    keepFeatures: KEEP_FEATURES,
  });
  await writeFile(join(OUTPUT_DIR, file), subset);
  const percent = Math.round((1 - subset.length / source.length) * 100);
  console.log(`${file}: ${source.length} -> ${subset.length} bytes (-${percent}%)`);
}
