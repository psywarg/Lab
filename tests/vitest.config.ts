import { fileURLToPath } from "node:url";
import { defineConfig } from "vitest/config";

// Lives in tests/ with everything else test-only; paths resolve from the
// repo root.
export default defineConfig({
  root: fileURLToPath(new URL("..", import.meta.url)),
  resolve: {
    alias: {
      "@": fileURLToPath(new URL("../src", import.meta.url)),
    },
  },
  test: {
    include: ["tests/unit/**/*.test.ts"],
    environment: "node",
  },
});
