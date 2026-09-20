#!/usr/bin/env node
// Plain Node 22, no dependencies — `pnpm stack:smoke`.
//
// Asserts the full compose.yaml stack (`pnpm stack:up`) actually works: web/api/mailpit/minio
// respond correctly, and every service compose reports on is in the state it should be in.
// Exits non-zero with a list of every failure (not just the first) on any check failing.
import { composePs, LONG_RUNNING_SERVICES, ONE_SHOT_SERVICES } from "./lib/compose.mjs";

// biome-ignore-start lint/suspicious/noUndeclaredEnvVars: this script is invoked directly via
// `node scripts/smoke-stack.mjs` (see package.json's "stack:smoke"), not as a turbo task, so
// turbo.json's env allow-listing (for build cache correctness) doesn't apply to it.
const WEB_PORT = process.env.WEB_PORT ?? "8080";
const API_PORT = process.env.API_PORT ?? "8081";
const MINIO_API_PORT = process.env.MINIO_API_PORT ?? "59000";
const MAILPIT_UI_PORT = process.env.MAILPIT_UI_PORT ?? "58025";
// biome-ignore-end lint/suspicious/noUndeclaredEnvVars: see biome-ignore-start above

const RETRIES = 30;
const RETRY_DELAY_MS = 1000;

const failures = [];

function fail(message) {
  failures.push(message);
  console.error(`FAIL: ${message}`);
}

function ok(message) {
  console.log(`OK:   ${message}`);
}

async function fetchWithRetry(url, init) {
  let lastError;
  for (let attempt = 0; attempt < RETRIES; attempt += 1) {
    try {
      return await fetch(url, init);
    } catch (error) {
      lastError = error;
      await new Promise((resolve) => setTimeout(resolve, RETRY_DELAY_MS));
    }
  }
  throw lastError instanceof Error ? lastError : new Error(`could not reach ${url}`);
}

async function checkWeb() {
  const healthz = await fetchWithRetry(`http://127.0.0.1:${WEB_PORT}/healthz`);
  if (healthz.status !== 200) {
    fail(`web /healthz returned ${healthz.status}, expected 200`);
  } else {
    const body = await healthz.json();
    if (body.status !== "ok") {
      fail(`web /healthz body was ${JSON.stringify(body)}, expected {"status":"ok"}`);
    } else {
      ok("web /healthz is 200 {status:ok}");
    }
  }

  const landing = await fetchWithRetry(`http://127.0.0.1:${WEB_PORT}/`);
  if (landing.status !== 200) {
    fail(`web / returned ${landing.status}, expected 200`);
    return;
  }
  const html = await landing.text();
  if (!html.includes("ibook")) {
    fail('web landing page HTML does not contain "ibook"');
  } else {
    ok('web landing page is 200 and contains "ibook"');
  }
}

async function checkApi() {
  const healthz = await fetchWithRetry(`http://127.0.0.1:${API_PORT}/healthz`);
  if (healthz.status !== 200) {
    fail(`api /healthz returned ${healthz.status}, expected 200`);
  } else {
    ok("api /healthz is 200");
  }

  const readyz = await fetchWithRetry(`http://127.0.0.1:${API_PORT}/readyz`);
  if (readyz.status !== 200) {
    fail(`api /readyz returned ${readyz.status}, expected 200`);
  } else {
    ok("api /readyz is 200");
  }

  const openapi = await fetchWithRetry(`http://127.0.0.1:${API_PORT}/openapi.json`);
  if (openapi.status !== 200) {
    fail(`api /openapi.json returned ${openapi.status}, expected 200`);
    return;
  }
  const doc = await openapi.json();
  if (doc.openapi !== "3.1.0") {
    fail(`api /openapi.json "openapi" field was ${JSON.stringify(doc.openapi)}, expected "3.1.0"`);
  } else {
    ok("api /openapi.json is 200 with openapi 3.1.0");
  }
}

async function checkMailpit() {
  const ui = await fetchWithRetry(`http://127.0.0.1:${MAILPIT_UI_PORT}/`);
  if (ui.status !== 200) {
    fail(`mailpit UI (/) returned ${ui.status}, expected 200`);
  } else {
    ok("mailpit UI is reachable");
  }

  const api = await fetchWithRetry(`http://127.0.0.1:${MAILPIT_UI_PORT}/api/v1/info`);
  if (api.status !== 200) {
    fail(`mailpit API (/api/v1/info) returned ${api.status}, expected 200`);
  } else {
    ok("mailpit API is reachable");
  }
}

async function checkMinio() {
  const live = await fetchWithRetry(`http://127.0.0.1:${MINIO_API_PORT}/minio/health/live`);
  if (live.status !== 200) {
    fail(`minio /minio/health/live returned ${live.status}, expected 200`);
  } else {
    ok("minio /minio/health/live is 200");
  }
}

// Every long-running service must be "running"; every one but ibook-clamav must also be
// "healthy" (ibook-clamav may still be "starting" — it can take several minutes on first boot,
// see infra/docker/README.md — but must not be "unhealthy" or missing). ibook-clamav itself
// isn't in scripts/lib/compose.mjs's LONG_RUNNING_SERVICES (stack-up.mjs's wait loop excludes
// it entirely), so it's added back in just for this check.
const SERVICES_TO_CHECK = [...LONG_RUNNING_SERVICES, "ibook-clamav"];

// A container that was just started reports health "starting" until its first healthcheck
// passes, so poll until nothing we require to be healthy is still "starting" (or time out and
// let the checks below report exactly which service is stuck).
const HEALTH_SETTLE_TIMEOUT_MS = 120_000;
const HEALTH_SETTLE_INTERVAL_MS = 2_000;

async function composePsSettled() {
  const deadline = Date.now() + HEALTH_SETTLE_TIMEOUT_MS;
  for (;;) {
    const byService = await composePs();
    const stillStarting = LONG_RUNNING_SERVICES.some(
      (service) => byService.get(service)?.Health === "starting",
    );
    if (!stillStarting || Date.now() >= deadline) {
      return byService;
    }
    await new Promise((resolve) => setTimeout(resolve, HEALTH_SETTLE_INTERVAL_MS));
  }
}

async function checkComposePs() {
  const byService = await composePsSettled();

  for (const service of SERVICES_TO_CHECK) {
    const row = byService.get(service);
    if (row === undefined) {
      fail(`${service}: no container found (docker compose ps)`);
      continue;
    }
    if (row.State !== "running") {
      fail(`${service}: state is "${row.State}", expected "running"`);
      continue;
    }
    if (service === "ibook-clamav") {
      if (row.Health !== "" && row.Health !== "healthy" && row.Health !== "starting") {
        fail(`${service}: health is "${row.Health}"`);
      } else {
        ok(`${service}: running, health="${row.Health || "n/a"}" ("starting" is acceptable here)`);
      }
      continue;
    }
    if (row.Health !== "" && row.Health !== "healthy") {
      fail(`${service}: health is "${row.Health}", expected "healthy"`);
      continue;
    }
    ok(`${service}: running and healthy`);
  }

  for (const service of ONE_SHOT_SERVICES) {
    const row = byService.get(service);
    if (row === undefined) {
      fail(`${service}: no container found (docker compose ps --all)`);
      continue;
    }
    if (row.State !== "exited" || String(row.ExitCode) !== "0") {
      fail(
        `${service}: state="${row.State}" exitCode=${row.ExitCode}, expected state="exited" exitCode=0`,
      );
      continue;
    }
    ok(`${service}: exited 0`);
  }
}

async function main() {
  console.log(`Smoke-testing the ibook stack (web=${WEB_PORT} api=${API_PORT})...\n`);

  await Promise.all([checkWeb(), checkApi(), checkMailpit(), checkMinio()]);
  await checkComposePs();

  if (failures.length > 0) {
    console.error(`\n${failures.length} smoke check(s) failed:`);
    for (const failure of failures) {
      console.error(`  - ${failure}`);
    }
    process.exitCode = 1;
    return;
  }

  console.log("\nAll smoke checks passed.");
}

main().catch((error) => {
  console.error(`smoke-stack crashed: ${error instanceof Error ? error.stack : String(error)}`);
  process.exitCode = 1;
});
