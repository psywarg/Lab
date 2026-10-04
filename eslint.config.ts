import { defineConfig } from "eslint/config";
import eslint from "@eslint/js";
import tseslint from "typescript-eslint";
import eslintPluginAstro from "eslint-plugin-astro";

export default defineConfig(
  // 1. Core JS recommended rules
  eslint.configs.recommended,

  // 2. TypeScript recommended rules
  ...tseslint.configs.recommended,

  // 3. Astro recommended rules
  ...eslintPluginAstro.configs.recommended,

  // 4. Type-aware TypeScript rules, scoped to plain .ts files only.
  //    The virtual files eslint-plugin-astro extracts from <script> blocks
  //    (e.g. Page.astro/1_1.ts) are not in the TS project, so they must be
  //    excluded here or parsing fails and their lint results are dropped.
  {
    files: ["**/*.ts"],
    ignores: ["**/*.astro/*.ts"],
    extends: [...tseslint.configs.recommendedTypeChecked],
    languageOptions: {
      parserOptions: {
        project: true,
        tsconfigRootDir: import.meta.dirname,
      },
    },
  },

  // 5. Plain browser scripts inlined with `is:inline` (not bundled).
  {
    files: ["src/scripts/**/*.js"],
    languageOptions: {
      globals: {
        window: "readonly",
        document: "readonly",
        localStorage: "readonly",
      },
    },
  },

  // 6. Custom project rules & ignores
  {
    rules: {
      // Allow intentionally unused parameters and variables prefixed with "_".
      "@typescript-eslint/no-unused-vars": [
        "error",
        { argsIgnorePattern: "^_", varsIgnorePattern: "^_" },
      ],
    },
  },
  {
    ignores: [
      "dist/",
      ".astro/",
      "node_modules/",
      "test-results/",
      "playwright-report/",
    ],
  },
);
