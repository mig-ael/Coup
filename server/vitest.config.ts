import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    include: ["test/**/*.test.ts"],
    // Integration tests boot a real Colyseus server on a port, so test files must not
    // run in parallel. Single-threaded also keeps server errors serialisable.
    pool: "threads",
    poolOptions: { threads: { singleThread: true } },
  },
});
