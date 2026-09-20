import { defineConfig } from "vitest/config";

// `src/telemetry.test.ts` drives a real HTTP request through the real
// `@opentelemetry/instrumentation-http` instrumentation to prove the privacy-sanitizing hooks
// work end to end. Core-module (http/pg/ioredis) instrumentation is implemented via
// `import-in-the-middle`, an ESM loader hook — it only intercepts a module's *static* `import`
// if the hook was registered during Node's preload phase (`--experimental-loader`/`--import`),
// before the test file's own module graph is resolved. `execArgv` is how that flag reaches the
// worker process vitest actually runs tests in (default pool is `forks`, i.e. `child_process`,
// which honors `execArgv`).
export default defineConfig({
  test: {
    environment: "node",
    include: ["src/**/*.test.ts"],
    execArgv: [
      `--import=data:text/javascript,${encodeURIComponent(
        'import { register } from "node:module"; import { pathToFileURL } from "node:url"; register("@opentelemetry/instrumentation/hook.mjs", pathToFileURL("./"));',
      )}`,
    ],
  },
});
