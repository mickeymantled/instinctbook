import type { Server } from "node:http";
import { afterEach, describe, expect, it } from "vitest";
import type { HealthServer } from "./health.js";
import { startHealthServer } from "./health.js";

let server: HealthServer | undefined;

afterEach(async () => {
  if (server !== undefined) {
    await server.close();
    server = undefined;
  }
});

function waitForListening(httpServer: Server): Promise<number> {
  return new Promise((resolve, reject) => {
    httpServer.once("listening", () => {
      const address = httpServer.address();
      if (address === null || typeof address === "string") {
        reject(new Error("expected a network address"));
        return;
      }
      resolve(address.port);
    });
    httpServer.once("error", reject);
  });
}

describe("health server", () => {
  it("GET /healthz returns 200 with no dependency checks", async () => {
    server = startHealthServer({ port: 0, readinessChecks: {} });
    const port = await waitForListening(server.server);

    const response = await fetch(`http://127.0.0.1:${port}/healthz`);

    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ status: "ok" });
  });

  it("GET /readyz returns 200 when every check passes", async () => {
    server = startHealthServer({
      port: 0,
      readinessChecks: { postgres: async () => {}, redis: async () => {}, worker: async () => {} },
    });
    const port = await waitForListening(server.server);

    const response = await fetch(`http://127.0.0.1:${port}/readyz`);

    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({
      status: "ready",
      checks: { postgres: "ok", redis: "ok", worker: "ok" },
    });
  });

  it("GET /readyz returns 503 with only check names, never an error message", async () => {
    const secretConnectionString = "postgres://user:hunter2@internal-db:5432/prod";
    server = startHealthServer({
      port: 0,
      readinessChecks: {
        postgres: async () => {
          throw new Error(secretConnectionString);
        },
        redis: async () => {},
      },
    });
    const port = await waitForListening(server.server);

    const response = await fetch(`http://127.0.0.1:${port}/readyz`);
    const text = await response.text();

    expect(response.status).toBe(503);
    expect(text).not.toContain(secretConnectionString);
    expect(text).not.toContain("hunter2");
    expect(JSON.parse(text)).toEqual({
      status: "not_ready",
      checks: { postgres: "failed", redis: "ok" },
    });
  });

  it("returns 404 for unknown paths and 405 for non-GET requests", async () => {
    server = startHealthServer({ port: 0, readinessChecks: {} });
    const port = await waitForListening(server.server);

    const notFound = await fetch(`http://127.0.0.1:${port}/nope`);
    expect(notFound.status).toBe(404);

    const wrongMethod = await fetch(`http://127.0.0.1:${port}/healthz`, { method: "POST" });
    expect(wrongMethod.status).toBe(405);
  });
});
