import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

// Production code must not carry anything that exists only for tests: every
// name a test imports from src/ must also be used by another file in src/.

function filesIn(dir: string, pattern: RegExp): string[] {
  return readdirSync(dir, { recursive: true, encoding: "utf8" })
    .filter((file) => pattern.test(file))
    .map((file) => join(dir, file));
}

describe("production exports", () => {
  it("are not exported only for tests", () => {
    const src = new Map(filesIn("src", /\.(ts|astro|mjs|js)$/).map((file) => [file, readFileSync(file, "utf8")]));
    const testOnly: string[] = [];
    for (const testFile of filesIn("tests", /\.(ts|mjs)$/)) {
      const text = readFileSync(testFile, "utf8");
      for (const match of text.matchAll(/import\s*(?:type\s*)?\{([^}]*)\}\s*from\s*"(@\/[^"]+|(?:\.\.\/)+src\/[^"]+)"/g)) {
        const path = (match[2] ?? "").replace(/^@\//, "src/").replace(/^(\.\.\/)+/, "");
        const definingFile = [...src.keys()].find((file) => file.replace(/\.(ts|astro|mjs|js)$/, "") === path.replace(/\.(ts|astro|mjs|js)$/, ""));
        if (!definingFile) continue;
        for (const part of (match[1] ?? "").split(",").map((entry) => entry.trim()).filter(Boolean)) {
          const name = part.replace(/^type\s+/, "").split(/\s+as\s+/)[0] ?? "";
          const word = new RegExp(`\\b${name}\\b`);
          const usedInProduction = [...src].some(([file, body]) => file !== definingFile && word.test(body));
          if (!usedInProduction) testOnly.push(`${definingFile}: ${name} (imported by ${testFile})`);
        }
      }
    }
    expect(testOnly).toEqual([]);
  });
});
