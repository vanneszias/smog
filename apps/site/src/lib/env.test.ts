import { describe, expect, it } from "vitest";
import { requireBinding, requireEnv } from "./env";

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

describe("requireBinding", () => {
  it("returns the binding when present", () => {
    const binding = { prepare: () => undefined };
    expect(requireBinding(binding, "D1")).toBe(binding);
  });

  it("throws when the binding is undefined", () => {
    expect(() => requireBinding(undefined, "D1")).toThrow(
      "Missing required Cloudflare binding: D1"
    );
  });

  it("names the missing binding so the error says which one", () => {
    expect(() => requireBinding(undefined, "R2")).toThrow(/R2/);
  });

  it("passes through falsy-but-present values rather than treating them as missing", () => {
    expect(requireBinding(0, "COUNTER")).toBe(0);
    expect(requireBinding("", "NAME")).toBe("");
    expect(requireBinding(null, "MAYBE")).toBeNull();
  });
});
