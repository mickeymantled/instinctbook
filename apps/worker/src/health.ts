import http from "node:http";

/** Name -> async check. A check should reject/throw to report unhealthy. */
export type ReadinessChecks = Record<string, () => Promise<void>>;

export interface HealthServerDeps {
  readonly port: number;
  readonly readinessChecks: ReadinessChecks;
}

export interface HealthServer {
  readonly server: http.Server;
  close(): Promise<void>;
}

type CheckStatus = "ok" | "failed";

async function runCheck(name: string, check: () => Promise<void>): Promise<[string, CheckStatus]> {
  try {
    await check();
    return [name, "ok"];
  } catch {
    return [name, "failed"];
  }
}

function sendJson(res: http.ServerResponse, status: number, body: unknown): void {
  const payload = JSON.stringify(body);
  res.writeHead(status, { "content-type": "application/json" });
  res.end(payload);
}

function requestPath(req: http.IncomingMessage): string {
  const url = req.url ?? "/";
  const queryIndex = url.indexOf("?");
  return queryIndex === -1 ? url : url.slice(0, queryIndex);
}

/**
 * A tiny (no Fastify) HTTP health server, since the worker has no other reason to run an HTTP
 * server:
 *
 * - `GET /healthz`: 200 whenever the process is up. No dependency checks.
 * - `GET /readyz`: 200 only if every injected readiness check passes, 503 otherwise. The body
 *   never contains more than check names and "ok"/"failed" — never an error message or
 *   connection string.
 */
export function startHealthServer(deps: HealthServerDeps): HealthServer {
  const server = http.createServer((req, res) => {
    if (req.method !== "GET") {
      sendJson(res, 405, { status: "method_not_allowed" });
      return;
    }

    const path = requestPath(req);

    if (path === "/healthz") {
      sendJson(res, 200, { status: "ok" });
      return;
    }

    if (path === "/readyz") {
      void (async () => {
        const entries = Object.entries(deps.readinessChecks);
        const results = await Promise.all(entries.map(([name, check]) => runCheck(name, check)));
        const checks = Object.fromEntries(results) as Record<string, CheckStatus>;
        const allOk = results.every(([, status]) => status === "ok");
        sendJson(res, allOk ? 200 : 503, { status: allOk ? "ready" : "not_ready", checks });
      })();
      return;
    }

    sendJson(res, 404, { status: "not_found" });
  });

  server.listen(deps.port);

  return {
    server,
    close() {
      return new Promise<void>((resolve, reject) => {
        server.close((error) => {
          if (error) {
            reject(error);
          } else {
            resolve();
          }
        });
      });
    },
  };
}
