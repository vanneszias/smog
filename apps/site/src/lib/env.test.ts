import { describe, expect, it } from "vitest";
import { requireEnv } from "./env";

describe("requireEnv", () => {
  it("returns the value when set", () => {
    expect(requireEnv("EXAMPLE", { EXAMPLE: "value" })).toBe("value");
  });

  it("throws when the variable is missing", () => {
    expect(() => requireEnv("EXAMPLE", {})).toThrow(
      "Missing required environment variable: EXAMPLE"
    );
  });

  it("throws when the variable is an empty string", () => {
    expect(() => requireEnv("EXAMPLE", { EXAMPLE: "" })).toThrow(
      "Missing required environment variable: EXAMPLE"
    );
  });

  it("throws when the variable is only whitespace", () => {
    expect(() => requireEnv("EXAMPLE", { EXAMPLE: "   " })).toThrow(
      "Missing required environment variable: EXAMPLE"
    );
  });
});
