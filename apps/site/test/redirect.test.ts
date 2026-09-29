import { describe, expect, it } from "vitest";
import { safeRedirect, validateAuthSearch } from "../src/lib/redirect";

describe("safeRedirect", () => {
  it("keeps same-site paths with their query and hash", () => {
    expect(safeRedirect("/account")).toBe("/account");
    expect(safeRedirect("/lists?id=1#top")).toBe("/lists?id=1#top");
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
});
