// Shared by scripts/stack-up.mjs and scripts/smoke-stack.mjs. Plain Node 22, no dependencies.
import { spawn } from "node:child_process";

export const PROJECT = "ibook";

// Every long-running service compose.yaml declares, except ibook-clamav (handled separately —
// see docs/BUILD_PROMPT.md slice 1.5 item 5: it must never gate the rest of the stack) and
// ibook-otel-collector (only started with `--profile observability`, so it isn't part of the
// default stack this waits/checks against).
export const LONG_RUNNING_SERVICES = [
  "ibook-postgres",
  "ibook-redis",
  "ibook-minio",
  "ibook-mailpit",
  "ibook-api",
  "ibook-worker",
  "ibook-web",
];

export const ONE_SHOT_SERVICES = ["ibook-migrate", "ibook-minio-init"];

export function runCapture(args) {
  return new Promise((resolve, reject) => {
    const child = spawn("docker", args, { stdio: ["ignore", "pipe", "inherit"] });
    let out = "";
    child.stdout.on("data", (chunk) => {
      out += chunk.toString("utf8");
    });
    child.on("error", reject);
    child.on("exit", (code) => {
      if (code === 0) {
        resolve(out);
      } else {
        reject(new Error(`docker ${args.join(" ")} exited ${code}`));
      }
    });
  });
}

/** One row per container, keyed by compose service name. */
export async function composePs() {
  const raw = await runCapture(["compose", "-p", PROJECT, "ps", "--all", "--format", "json"]);
  const rows = raw
    .split("\n")
    .filter((line) => line.trim().length > 0)
    .map((line) => JSON.parse(line));
  return new Map(rows.map((row) => [row.Service, row]));
}

/**
 * `docker compose up -d --wait`'s own `--wait` exit code is not trustworthy here: in the
 * version this repo has been tested against (Compose 5.5.1), it reports a non-zero exit purely
 * because a one-shot dependency (ibook-migrate/ibook-minio-init) exited 0 as designed — the
 * services it gates (ibook-api/ibook-worker) end up running and healthy regardless, so treating
 * that as a hard failure would be wrong. This polls `docker compose ps` directly instead and
 * judges success itself, the same way scripts/smoke-stack.mjs does.
 */
export async function waitForStack({ timeoutMs = 5 * 60_000, intervalMs = 2000 } = {}) {
  const deadline = Date.now() + timeoutMs;
  let lastReport = "";

  while (Date.now() < deadline) {
    const byService = await composePs();
    const problems = [];

    for (const service of LONG_RUNNING_SERVICES) {
      const row = byService.get(service);
      if (row === undefined) {
        problems.push(`${service}: no container yet`);
      } else if (row.State !== "running") {
        problems.push(`${service}: state="${row.State}"`);
      } else if (row.Health === "unhealthy") {
        throw new Error(`${service} reported "unhealthy" — check \`pnpm stack:logs\``);
      } else if (row.Health !== "" && row.Health !== "healthy") {
        problems.push(`${service}: health="${row.Health}"`);
      }
    }

    for (const service of ONE_SHOT_SERVICES) {
      const row = byService.get(service);
      if (row === undefined) {
        problems.push(`${service}: no container yet`);
      } else if (row.State !== "exited") {
        problems.push(`${service}: state="${row.State}" (waiting for it to exit)`);
      } else if (String(row.ExitCode) !== "0") {
        throw new Error(`${service} exited with code ${row.ExitCode} — check \`pnpm stack:logs\``);
      }
    }

    if (problems.length === 0) {
      return;
    }
    lastReport = problems.join("; ");
    await new Promise((resolve) => setTimeout(resolve, intervalMs));
  }

  throw new Error(
    `timed out after ${timeoutMs}ms waiting for the stack. Still waiting on: ${lastReport}`,
  );
}
