import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    environment: "node",
    include: ["src/**/*.test.ts"],
    // Integration tests run a real BullMQ Worker against Redis.
    testTimeout: 15_000,
    hookTimeout: 15_000,
  },
});
