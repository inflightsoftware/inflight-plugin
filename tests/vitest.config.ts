import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    globals: true,
    include: ["ci/**/*.test.ts"],
    testTimeout: 30_000,
    hookTimeout: 30_000,
    pool: "threads",
  },
});
