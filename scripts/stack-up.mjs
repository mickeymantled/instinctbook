#!/usr/bin/env node
// Plain Node, no dependencies — `pnpm stack:up`.
//
// Equivalent to `docker compose up -d --build --wait`, with two adjustments:
//
// 1. ibook-clamav is started without waiting on its health: its image is large and it can take
//    several minutes to finish loading virus definitions on first boot (see
//    infra/docker/README.md), and nothing in this slice depends on it being ready. Waiting on
//    it here would make every `stack:up` needlessly slow.
// 2. Waiting itself is done by polling `docker compose ps` ourselves (see
//    scripts/lib/compose.mjs's `waitForStack`) instead of trusting `docker compose up --wait`'s
//    own exit code — in the Compose version this was tested against (5.5.1), `--wait` reports a
//    spurious failure purely because a one-shot dependency (ibook-migrate/ibook-minio-init)
//    exits 0 as designed, even though every service it gates ends up running and healthy.
import { spawn } from "node:child_process";
import { PROJECT, waitForStack } from "./lib/compose.mjs";

function run(args) {
  console.log(`+ docker ${args.join(" ")}`);
  return new Promise((resolve, reject) => {
    const child = spawn("docker", args, { stdio: "inherit" });
    child.on("error", reject);
    child.on("exit", (code, signal) => {
      if (code === 0) {
        resolve();
      } else {
        reject(new Error(`docker ${args.join(" ")} failed (exit ${code ?? signal})`));
      }
    });
  });
}

async function main() {
  await run(["compose", "-p", PROJECT, "build"]);

  console.log("\nStarting ibook-clamav in the background (its health is not waited on)...");
  await run(["compose", "-p", PROJECT, "up", "-d", "ibook-clamav"]);

  console.log("\nStarting every other service...");
  await run(["compose", "-p", PROJECT, "up", "-d"]);

  console.log("\nWaiting for migrations, then api/worker/web to report healthy...");
  await waitForStack();

  console.log(
    '\nStack is up. ibook-clamav may still be "starting" (it can take several minutes on first ' +
      "boot) — `pnpm stack:ps` shows its current health, and `pnpm stack:smoke` tolerates that.",
  );
}

main().catch((error) => {
  console.error(`\nstack:up failed: ${error.message}`);
  process.exitCode = 1;
});
