import { describe, expect, it } from "vitest";
import { pgInstrumentationConfig, redisDbStatementSerializer } from "./db-sanitize.js";

const MARKER = "sk_live_super_secret_marker_value";

describe("pgInstrumentationConfig", () => {
  it("disables enhancedDatabaseReporting, so spans never carry query parameter values", () => {
    expect(pgInstrumentationConfig()).toEqual({ enhancedDatabaseReporting: false });
  });
});

describe("redisDbStatementSerializer", () => {
  it("returns only the command name, dropping every argument", () => {
    expect(redisDbStatementSerializer("SET", [`session:${MARKER}`, MARKER])).toBe("SET");
  });

  it("never lets a marker value in the arguments leak into the returned statement", () => {
    const statement = redisDbStatementSerializer("MSET", [MARKER, MARKER, MARKER]);
    expect(statement).not.toContain(MARKER);
  });
});
