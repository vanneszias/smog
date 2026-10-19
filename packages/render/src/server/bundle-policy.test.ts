import { describe, expect, it } from "bun:test";
import { bundleAction } from "./bundle-policy";

describe("bundleAction (phase 7 task 9: no stale local bundle)", () => {
  it("rebuilds in dev on every start where it can bundle, so `serve` renders the current composition", () => {
    for (const hasBundle of [true, false]) {
      expect(
        bundleAction({ canBundle: true, environment: "dev", hasBundle })
      ).toBe("build");
    }
  });

  it("uses the image's bundle when it cannot bundle (the CI lane runs the image with RENDER_ENVIRONMENT=dev)", () => {
    expect(
      bundleAction({ canBundle: false, environment: "dev", hasBundle: true })
    ).toBe("use");
  });

  it("uses the bundle outside dev, and builds one only when it is missing", () => {
    for (const environment of ["staging", "production"] as const) {
      for (const canBundle of [true, false]) {
        expect(bundleAction({ canBundle, environment, hasBundle: true })).toBe(
          "use"
        );
        expect(bundleAction({ canBundle, environment, hasBundle: false })).toBe(
          "build"
        );
      }
    }
  });
});
