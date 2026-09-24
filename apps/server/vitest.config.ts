import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    // DBOS is a process-wide singleton, so test files run one at a time against one database.
    fileParallelism: false,
    testTimeout: 30_000,
    hookTimeout: 60_000,
  },
});
