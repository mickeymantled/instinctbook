import { describe, expect, it } from "vitest";
import { loadConfig } from "./config.js";

const REQUIRED = { DATABASE_URL: "postgres://example", REDIS_URL: "redis://example" };

describe("loadConfig", () => {
  it("applies defaults once DATABASE_URL and REDIS_URL are set", () => {
    const config = loadConfig(REQUIRED);

    expect(config).toEqual({
      NODE_ENV: "development",
      HOST: "0.0.0.0",
      PORT: 3000,
      LOG_LEVEL: "info",
      SERVICE_NAME: "ibook-api",
      DATABASE_URL: "postgres://example",
      REDIS_URL: "redis://example",
    });
  });

  it("reads and coerces provided values", () => {
    const config = loadConfig({
      NODE_ENV: "production",
      HOST: "127.0.0.1",
      PORT: "8080",
      LOG_LEVEL: "debug",
      SERVICE_NAME: "custom-service",
      DATABASE_URL: "postgres://example",
      REDIS_URL: "redis://example",
    });

    expect(config.NODE_ENV).toBe("production");
    expect(config.PORT).toBe(8080);
    expect(config.DATABASE_URL).toBe("postgres://example");
  });

  it("returns a frozen object", () => {
    const config = loadConfig(REQUIRED);
    expect(Object.isFrozen(config)).toBe(true);
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

  it("rejects an invalid PORT and names the variable but never its value", () => {
    const secretLookingValue = "not-a-port-9999999";

    let caught: unknown;
    try {
      loadConfig({ ...REQUIRED, PORT: secretLookingValue });
    } catch (error) {
      caught = error;
    }

    expect(caught).toBeInstanceOf(Error);
    const message = (caught as Error).message;
    expect(message).toContain("PORT");
    expect(message).not.toContain(secretLookingValue);
  });

  it("rejects an invalid NODE_ENV and names the variable but never its value", () => {
    const bogusValue = "totally-bogus-env";

    let caught: unknown;
    try {
      loadConfig({ ...REQUIRED, NODE_ENV: bogusValue });
    } catch (error) {
      caught = error;
    }

    expect(caught).toBeInstanceOf(Error);
    const message = (caught as Error).message;
    expect(message).toContain("NODE_ENV");
    expect(message).not.toContain(bogusValue);
  });

  it("lists every offending variable name when several are invalid", () => {
    let caught: unknown;
    try {
      loadConfig({ ...REQUIRED, PORT: "nope", LOG_LEVEL: "not-a-level" });
    } catch (error) {
      caught = error;
    }

    const message = (caught as Error).message;
    expect(message).toContain("PORT");
    expect(message).toContain("LOG_LEVEL");
  });

  describe("dev-only credential guard", () => {
    it("refuses to start when NODE_ENV=production and DATABASE_URL is dev-only", () => {
      let caught: unknown;
      try {
        loadConfig({
          NODE_ENV: "production",
          DATABASE_URL: "postgres://ibook:ibook_dev_only@127.0.0.1:5432/ibook",
          REDIS_URL: "redis://example",
        });
      } catch (error) {
        caught = error;
      }

      expect(caught).toBeInstanceOf(Error);
      const message = (caught as Error).message;
      expect(message).toContain("DATABASE_URL");
      expect(message).not.toContain("ibook_dev_only@127.0.0.1");
    });

    it("refuses to start when NODE_ENV=production and REDIS_URL is dev-only", () => {
      let caught: unknown;
      try {
        loadConfig({
          NODE_ENV: "production",
          DATABASE_URL: "postgres://example",
          REDIS_URL: "redis://:redis_dev_only@127.0.0.1:6379",
        });
      } catch (error) {
        caught = error;
      }

      expect(caught).toBeInstanceOf(Error);
      expect((caught as Error).message).toContain("REDIS_URL");
    });

    it("allows a dev-only DATABASE_URL outside production", () => {
      const config = loadConfig({
        NODE_ENV: "development",
        DATABASE_URL: "postgres://ibook:ibook_dev_only@127.0.0.1:5432/ibook",
        REDIS_URL: "redis://example",
      });
      expect(config.DATABASE_URL).toContain("ibook_dev_only");
    });

    it("allows production to start with a non-dev-only DATABASE_URL", () => {
      const config = loadConfig({
        NODE_ENV: "production",
        DATABASE_URL: "postgres://ibook:s3cret@db.internal:5432/ibook",
        REDIS_URL: "redis://cache.internal:6379",
      });
      expect(config.NODE_ENV).toBe("production");
    });
  });
});
