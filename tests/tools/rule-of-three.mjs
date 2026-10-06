// Rule of 3 report: for each util or component added since a base commit,
// how many other production files import it. Run from the repo root:
//   node tests/tools/rule-of-three.mjs [base-commit]
import { execFileSync } from "node:child_process";
import { readFileSync, readdirSync } from "node:fs";
import { basename, join } from "node:path";
import process from "node:process";

const print = (line) => process.stdout.write(`${line}\n`);

const base = process.argv[2] ?? "6deb952";
const added = execFileSync("git", ["diff", "--name-only", "--diff-filter=A", base, "HEAD", "--", "src/utils", "src/components", "src/scripts"], { encoding: "utf8" })
  .split("\n")
  .filter((file) => /\.(ts|astro|js)$/.test(file));
const sources = [
  ...readdirSync("src", { recursive: true, encoding: "utf8" })
    .filter((file) => /\.(ts|astro|mjs|js)$/.test(file))
    .map((file) => join("src", file)),
  "astro.config.ts",
];

print("| File | Production files that use it |");
print("|---|---|");
for (const file of added) {
  const stem = basename(file).replace(/\.(ts|astro|js)$/, "");
  const reference = new RegExp(`["'][^"']*/${stem.replace(".", "\\.")}(\\.(ts|astro|js))?(\\?[a-z&]+)?["']`);
  const users = sources.filter((other) => other !== file && reference.test(readFileSync(other, "utf8")));
  print(`| \`${file}\` | ${users.length}: ${users.map((user) => `\`${user}\``).join(", ")} |`);
}
