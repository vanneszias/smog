import { describe, expect, it } from "vitest";
import { assertSeedTargetIsLocal } from "./guard";

const local = { CLOUDFLARE_ENV: "staging" };

describe("assertSeedTargetIsLocal", () => {
  it("allows the locally emulated staging bindings with no NODE_ENV", () => {
    expect(() => assertSeedTargetIsLocal(local)).not.toThrow();
  });

  it("allows an explicit development or test NODE_ENV", () => {
    expect(() =>
      assertSeedTargetIsLocal({ ...local, NODE_ENV: "development" })
    ).not.toThrow();
    expect(() =>
      assertSeedTargetIsLocal({ ...local, NODE_ENV: "test" })
    ).not.toThrow();
  });

  it("refuses NODE_ENV=production, the switch that turns on remote bindings", () => {
    expect(() =>
      assertSeedTargetIsLocal({ ...local, NODE_ENV: "production" })
    ).toThrow(/NODE_ENV/);
  });

  it("refuses any NODE_ENV that is not explicitly local, rather than assuming unknown means safe", () => {
    expect(() =>
      assertSeedTargetIsLocal({ ...local, NODE_ENV: "prod" })
    ).toThrow(/NODE_ENV/);
    expect(() =>
      assertSeedTargetIsLocal({ ...local, NODE_ENV: "staging" })
    ).toThrow(/NODE_ENV/);
  });

  it("refuses a NODE_ENV that is production wearing whitespace", () => {
    expect(() =>
      assertSeedTargetIsLocal({ ...local, NODE_ENV: " production " })
    ).toThrow(/NODE_ENV/);
  });

  it("refuses CLOUDFLARE_ENV=production outright", () => {
    expect(() =>
      assertSeedTargetIsLocal({ CLOUDFLARE_ENV: "production" })
    ).toThrow(/CLOUDFLARE_ENV/);
  });

  it("refuses a CLOUDFLARE_ENV that only looks right, closing the whitespace hole", () => {
    for (const value of ["staging ", " staging", "staging\n", "\tstaging"]) {
      expect(() => assertSeedTargetIsLocal({ CLOUDFLARE_ENV: value })).toThrow(
        /CLOUDFLARE_ENV/
      );
    }
  });

  it("refuses a CLOUDFLARE_ENV that differs only in case", () => {
    expect(() =>
      assertSeedTargetIsLocal({ CLOUDFLARE_ENV: "Staging" })
    ).toThrow(/CLOUDFLARE_ENV/);
  });

  it("refuses a missing or empty CLOUDFLARE_ENV", () => {
    expect(() => assertSeedTargetIsLocal({})).toThrow(/CLOUDFLARE_ENV/);
    expect(() => assertSeedTargetIsLocal({ CLOUDFLARE_ENV: "" })).toThrow(
      /CLOUDFLARE_ENV/
    );
    expect(() => assertSeedTargetIsLocal({ CLOUDFLARE_ENV: "   " })).toThrow(
      /CLOUDFLARE_ENV/
    );
  });

  it("quotes the offending value in the message so the typo is visible", () => {
    expect(() =>
      assertSeedTargetIsLocal({ CLOUDFLARE_ENV: "staging " })
    ).toThrow("'staging '");
    expect(() =>
      assertSeedTargetIsLocal({ ...local, NODE_ENV: "production" })
    ).toThrow("'production'");
  });

  it("checks CLOUDFLARE_ENV even when NODE_ENV is production, so the message is not misleading", () => {
    expect(() =>
      assertSeedTargetIsLocal({
        CLOUDFLARE_ENV: "production",
        NODE_ENV: "production",
      })
    ).toThrow(/CLOUDFLARE_ENV/);
  });
});
