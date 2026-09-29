import { describe, expect, it } from "vitest";
import { safeRedirect, validateAuthSearch } from "../src/lib/redirect";

describe("safeRedirect", () => {
  it("keeps same-site paths with their query and hash", () => {
    expect(safeRedirect("/account")).toBe("/account");
    expect(safeRedirect("/lists?id=1#top")).toBe("/lists?id=1#top");
    expect(safeRedirect("/gestures?q=hallo%20daar")).toBe(
      "/gestures?q=hallo%20daar"
    );
    // Encoded slashes are fine in the query, only the path is strict.
    expect(safeRedirect("/gestures?q=a%2Fb")).toBe("/gestures?q=a%2Fb");
  });

  it("refuses anything that can leave the site", () => {
    for (const value of [
      "https://evil.test",
      "//evil.test/x",
      "/\\evil.test",
      "javascript:alert(1)",
      "account",
      "",
      42,
      undefined,
    ]) {
      expect(safeRedirect(value)).toBe("/");
    }
  });

  // Review C1: dot segments and encodings that normalise into `//host`.
  it("refuses paths that normalise into a protocol-relative URL", () => {
    for (const value of [
      "/.//evil.com",
      "/a/..//evil.com",
      "/%2e//evil.com",
      "/./\\evil.com",
      "/%2e%2e//evil.com",
      "/%2F%2Fevil.com",
      "/%2fevil.com",
      "/%5Cevil.com",
      "/%5c%5cevil.com",
      "/a\\b",
      "/\tevil.com",
      "/\n/evil.com",
      "/%09/evil.com",
      "/\u0000evil",
    ]) {
      expect(safeRedirect(value)).toBe("/");
    }
  });
});

describe("validateAuthSearch", () => {
  it("drops a home redirect and keeps the error code", () => {
    expect(
      validateAuthSearch({ error: "INVALID_TOKEN", redirect: "/" })
    ).toEqual({ error: "INVALID_TOKEN" });
    expect(validateAuthSearch({ redirect: "/account" })).toEqual({
      redirect: "/account",
    });
  });

  it("drops an unsafe redirect", () => {
    expect(validateAuthSearch({ redirect: "/.//evil.com" })).toEqual({});
  });
});
