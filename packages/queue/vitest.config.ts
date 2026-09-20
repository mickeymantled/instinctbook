import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    environment: "node",
    include: ["src/**/*.test.ts"],
    // Integration tests run real BullMQ workers against Redis.
    testTimeout: 30_000,
    hookTimeout: 30_000,
  },
});
