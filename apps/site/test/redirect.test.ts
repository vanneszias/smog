import { describe, expect, it } from "vitest";
import {
  safeRedirect,
  signInReturnPath,
  validateAuthSearch,
  validateResetSearch,
} from "../src/lib/redirect";

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

describe("signInReturnPath (the header's Sign in link)", () => {
  it("returns to the page, without any token in its query", () => {
    expect(signInReturnPath("/gestures/hond?ref=qr")).toBe(
      "/gestures/hond?ref=qr"
    );
    expect(signInReturnPath("/lists?token=abc&id=1")).toBe("/lists?id=1");
    expect(signInReturnPath("/reset-password?token=abc")).toBe(
      "/reset-password"
    );
  });

  it("never returns to an auth page or a magic link", () => {
    for (const href of [
      "/sign-in",
      "/sign-up?redirect=%2Faccount",
      "/magic-link?error=INVALID_TOKEN",
      "/magic-link/app?token=abcdefghijklmnopqrstuvwxyzABCDEF&email=a%40b.c",
    ]) {
      expect(signInReturnPath(href)).toBeUndefined();
    }
  });
});

describe("validateResetSearch", () => {
  it("sets both keys, strings only (the router JSON-parses `?token=123`)", () => {
    expect(validateResetSearch({ token: "abc" })).toStrictEqual({
      error: undefined,
      token: "abc",
    });
    expect(
      validateResetSearch({ error: "INVALID_TOKEN", token: 123 })
    ).toStrictEqual({
      error: "INVALID_TOKEN",
      token: undefined,
    });
    expect(validateResetSearch({})).toStrictEqual({
      error: undefined,
      token: undefined,
    });
  });
});
