import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { isValidServiceToken, requireServiceAuth } from "../serviceAuth";

const ORIGINAL_SERVICE_TOKEN = process.env.INTERNAL_API_KEY;

describe("service authentication", () => {
  beforeEach(() => {
    process.env.INTERNAL_API_KEY = "release-test-service-token";
  });

  afterEach(() => {
    if (ORIGINAL_SERVICE_TOKEN === undefined) {
      process.env.INTERNAL_API_KEY = undefined;
    } else {
      process.env.INTERNAL_API_KEY = ORIGINAL_SERVICE_TOKEN;
    }
  });

  it("accepts only the exact configured token", () => {
    expect(isValidServiceToken("release-test-service-token")).toBe(true);
    expect(isValidServiceToken("release-test-service-token ")).toBe(false);
    expect(isValidServiceToken("wrong-token")).toBe(false);
    expect(isValidServiceToken(undefined)).toBe(false);
  });

  it("fails closed when the server secret is missing", () => {
    process.env.INTERNAL_API_KEY = undefined;
    expect(isValidServiceToken("release-test-service-token")).toBe(false);
  });

  it("rejects unauthorized server-only operations", () => {
    expect(() => requireServiceAuth("wrong-token", "test.operation")).toThrow(
      "[test.operation] Unauthorized"
    );
    expect(() =>
      requireServiceAuth("release-test-service-token", "test.operation")
    ).not.toThrow();
  });
});
