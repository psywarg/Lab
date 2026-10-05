// src/utils/site/fontSubset.ts
// The characters kept in the Sorted fonts by `npm run fonts:subset`. Text
// outside this set falls back to a system font, which tests/e2e/site.spec.ts
// checks against the built pages.

// Google Fonts' "latin" range: English and Western European text, common
// punctuation, the euro and trade mark signs, arrows and maths minus.
export const LATIN_RANGES: readonly (readonly [number, number])[] = [
  [0x0000, 0x00ff],
  [0x0131, 0x0131],
  [0x0152, 0x0153],
  [0x02bb, 0x02bc],
  [0x02c6, 0x02c6],
  [0x02da, 0x02da],
  [0x02dc, 0x02dc],
  [0x0304, 0x0304],
  [0x0308, 0x0308],
  [0x0329, 0x0329],
  [0x2000, 0x206f],
  [0x20ac, 0x20ac],
  [0x2122, 0x2122],
  [0x2191, 0x2191],
  [0x2193, 0x2193],
  [0x2212, 0x2212],
  [0x2215, 0x2215],
  [0xfeff, 0xfeff],
  [0xfffd, 0xfffd],
];

export function inLatinSubset(codePoint: number): boolean {
  return LATIN_RANGES.some(([start, end]) => codePoint >= start && codePoint <= end);
}

/** Every character in the subset, as the text the subsetter keeps. */
export function latinSubsetText(): string {
  let text = "";
  for (const [start, end] of LATIN_RANGES) {
    for (let codePoint = start; codePoint <= end; codePoint += 1) {
      text += String.fromCodePoint(codePoint);
    }
  }
  return text;
}
