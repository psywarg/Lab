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
  {
    files: ["**/*.ts"],
    extends: [...tseslint.configs.recommendedTypeChecked],
    languageOptions: {
      parserOptions: {
        project: true,
        tsconfigRootDir: import.meta.dirname,
      },
    },
  },

  // 5. Custom project rules & ignores
  {
    ignores: ["dist/", ".astro/", "node_modules/"],
  },
);
