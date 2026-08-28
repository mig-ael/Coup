import { defineConfig } from "vitest/config";
import react from "@vitejs/plugin-react";

export default defineConfig({
  plugins: [react()],
  test: {
    include: ["test/**/*.test.ts", "test/**/*.test.tsx"],
    // These boot a real backend on a port, so files must not run in parallel.
    // The app reads its endpoint from the Vite env, so give the tests a real one.
    env: { VITE_SERVER_URL: "ws://localhost:2596" },
    setupFiles: ["./test/setup.ts"],
    testTimeout: 20000,
    hookTimeout: 20000,
    pool: "threads",
    poolOptions: { threads: { singleThread: true } },
  },
});
