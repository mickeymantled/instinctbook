import { describe, expect, it } from "vitest";
import { PACKAGE_NAME } from "./index.js";

describe("PACKAGE_NAME", () => {
  it("identifies the package", () => {
    expect(PACKAGE_NAME).toBe("@ibook/domain");
  });
});
