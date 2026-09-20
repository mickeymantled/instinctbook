import { describe, expect, it } from "vitest";
import { loadConfig } from "./config.js";

const REQUIRED = { DATABASE_URL: "postgres://example", REDIS_URL: "redis://example" };

describe("loadConfig", () => {
  it("applies defaults once DATABASE_URL and REDIS_URL are set", () => {
    const config = loadConfig(REQUIRED);

    expect(config).toEqual({
      NODE_ENV: "development",
      LOG_LEVEL: "info",
      SERVICE_NAME: "ibook-worker",
      DATABASE_URL: "postgres://example",
      REDIS_URL: "redis://example",
      WORKER_HEALTH_PORT: 3001,
      WORKER_CONCURRENCY: 5,
    });
  });

  it("requires DATABASE_URL and REDIS_URL, naming both when missing", () => {
    let caught: unknown;
    try {
      loadConfig({});
    } catch (error) {
      caught = error;
    }

    expect(caught).toBeInstanceOf(Error);
    const message = (caught as Error).message;
    expect(message).toContain("DATABASE_URL");
    expect(message).toContain("REDIS_URL");
  });

  it("rejects an invalid WORKER_HEALTH_PORT and names the variable but never its value", () => {
    const secretLookingValue = "not-a-port-9999999";

    let caught: unknown;
    try {
      loadConfig({ ...REQUIRED, WORKER_HEALTH_PORT: secretLookingValue });
    } catch (error) {
      caught = error;
    }

    expect(caught).toBeInstanceOf(Error);
    const message = (caught as Error).message;
    expect(message).toContain("WORKER_HEALTH_PORT");
    expect(message).not.toContain(secretLookingValue);
  });

  it("coerces WORKER_CONCURRENCY and WORKER_HEALTH_PORT from strings", () => {
    const config = loadConfig({
      ...REQUIRED,
      WORKER_CONCURRENCY: "10",
      WORKER_HEALTH_PORT: "4000",
    });

    expect(config.WORKER_CONCURRENCY).toBe(10);
    expect(config.WORKER_HEALTH_PORT).toBe(4000);
  });

  it("returns a frozen object", () => {
    const config = loadConfig(REQUIRED);
    expect(Object.isFrozen(config)).toBe(true);
  });
});
