import { describe, expect, test } from "bun:test";
import {
  allowedTargets,
  BOUNDARIES,
  FEATURE_PACKAGES,
  isAllowedDependency,
  isAllowedImport,
  ROOT_PACKAGE,
} from "./boundaries";

describe("BOUNDARIES", () => {
  test("the root package's scripts may import the config and feature schemas only", () => {
    expect(isAllowedImport(ROOT_PACKAGE, "@smog/config/maintenance")).toBe(
      true
    );
    expect(isAllowedImport(ROOT_PACKAGE, "@smog/admin/schema")).toBe(true);
    expect(isAllowedImport(ROOT_PACKAGE, "@smog/admin/server")).toBe(false);
    expect(isAllowedImport(ROOT_PACKAGE, "@smog/db")).toBe(false);
    expect(isAllowedDependency(ROOT_PACKAGE, "@smog/admin")).toBe(true);
    expect(isAllowedDependency(ROOT_PACKAGE, "@smog/site")).toBe(false);
  });

  test("lists every package from the spec graph", () => {
    const expected = [
      "@smog/site",
      "@smog/mobile",
      "@smog/api",
      "@smog/jobs",
      "@smog/payments",
      "@smog/video",
      "@smog/render",
      "@smog/email",
      "@smog/auth",
      "@smog/rpc",
      "@smog/db",
      "@smog/local-store",
      "@smog/analytics",
      "@smog/ui-web",
      "@smog/ui-native",
      "@smog/i18n",
      "@smog/styles",
      "@smog/brand",
      "@smog/utils",
      "@smog/config",
    ];
    for (const name of expected) {
      expect(allowedTargets(name)).toBeDefined();
    }
    for (const name of FEATURE_PACKAGES) {
      expect(allowedTargets(name)).toBe(BOUNDARIES["@smog/feature:*"]);
    }
  });

  test("migrate-convex reaches the data packages and feature schemas (phase 8 ruling 6)", () => {
    const name = "@smog/migrate-convex";
    for (const target of [
      "@smog/config",
      "@smog/utils",
      "@smog/db",
      "@smog/video",
      "@smog/jobs",
      "@smog/email",
      "@smog/sponsorships/schema",
      "@smog/admin/schema",
    ]) {
      expect(isAllowedImport(name, target)).toBe(true);
    }
    // Its integration tests drive the real services.
    for (const target of [
      "@smog/sponsorships/server",
      "@smog/auth",
      "@smog/rpc",
      "@smog/payments/testing",
      "@smog/render/testing",
    ]) {
      expect(isAllowedImport(name, target)).toBe(true);
    }
    expect(isAllowedImport(name, "@smog/render/composition")).toBe(false);
    for (const target of [
      "@smog/site",
      "@smog/mobile",
      "@smog/api",
      "@smog/analytics",
      "@smog/i18n",
    ]) {
      expect(isAllowedDependency(name, target)).toBe(false);
    }
  });

  test("no package may depend on migrate-convex (it is a tool, not a library)", () => {
    for (const [name, targets] of Object.entries(BOUNDARIES)) {
      const listed = targets.filter(
        (target) =>
          target === "@smog/migrate-convex" ||
          target.startsWith("@smog/migrate-convex/")
      );
      expect({ listed, name }).toEqual({ listed: [], name });
    }
    expect(isAllowedDependency(ROOT_PACKAGE, "@smog/migrate-convex")).toBe(
      false
    );
    expect(isAllowedDependency("@smog/site", "@smog/migrate-convex")).toBe(
      false
    );
  });

  test("config depends on nothing", () => {
    expect(allowedTargets("@smog/config")).toEqual([]);
  });

  test("brand reads the tokens from styles, and styles is a leaf", () => {
    expect(allowedTargets("@smog/brand")).toEqual([
      "@smog/styles",
      "@smog/config",
    ]);
    expect(allowedTargets("@smog/styles")).toEqual(["@smog/config"]);
  });
});

describe("isAllowedDependency", () => {
  test("allows a listed package", () => {
    expect(isAllowedDependency("@smog/ui-web", "@smog/styles")).toBe(true);
  });

  test("forbids an unlisted package", () => {
    expect(isAllowedDependency("@smog/ui-web", "@smog/db")).toBe(false);
  });

  test("allows a package listed only by subpath", () => {
    expect(isAllowedDependency("@smog/jobs", "@smog/render")).toBe(true);
  });

  test("allows features through the feature pattern", () => {
    expect(isAllowedDependency("@smog/site", "@smog/gestures")).toBe(true);
    expect(isAllowedDependency("@smog/lists", "@smog/gestures")).toBe(true);
  });

  test("unknown packages may not depend on anything", () => {
    expect(isAllowedDependency("@smog/unknown", "@smog/utils")).toBe(false);
  });
});

describe("isAllowedImport", () => {
  test("a full package entry allows every subpath", () => {
    expect(isAllowedImport("@smog/site", "@smog/render")).toBe(true);
    expect(isAllowedImport("@smog/site", "@smog/gestures/server")).toBe(true);
  });

  test("a subpath entry allows only that subpath", () => {
    expect(isAllowedImport("@smog/jobs", "@smog/render/contract")).toBe(true);
    expect(isAllowedImport("@smog/jobs", "@smog/render")).toBe(false);
    expect(isAllowedImport("@smog/jobs", "@smog/render/compositions")).toBe(
      false
    );
  });

  test("mobile only reaches client-safe subpaths", () => {
    expect(isAllowedImport("@smog/mobile", "@smog/api/client")).toBe(true);
    expect(isAllowedImport("@smog/mobile", "@smog/api")).toBe(false);
    expect(isAllowedImport("@smog/mobile", "@smog/gestures/client")).toBe(true);
    expect(isAllowedImport("@smog/mobile", "@smog/gestures/schema")).toBe(true);
    expect(isAllowedImport("@smog/mobile", "@smog/gestures/server")).toBe(
      false
    );
  });

  test("a feature may import another feature's schema and contract only", () => {
    expect(isAllowedImport("@smog/lists", "@smog/gestures/schema")).toBe(true);
    expect(isAllowedImport("@smog/favorites", "@smog/gestures/contract")).toBe(
      true
    );
    expect(isAllowedImport("@smog/lists", "@smog/gestures/server")).toBe(false);
    expect(isAllowedImport("@smog/lists", "@smog/gestures/client")).toBe(false);
    expect(isAllowedImport("@smog/lists", "@smog/gestures")).toBe(false);
  });

  test("a feature reaches the render contract and the fake renderer only (phase 7 ruling 1)", () => {
    expect(isAllowedImport("@smog/sponsorships", "@smog/render/contract")).toBe(
      true
    );
    expect(isAllowedImport("@smog/sponsorships", "@smog/render/testing")).toBe(
      true
    );
    for (const subpath of ["composition", "metadata", "remotion", ""]) {
      expect(
        isAllowedImport(
          "@smog/sponsorships",
          subpath ? `@smog/render/${subpath}` : "@smog/render"
        )
      ).toBe(false);
    }
    expect(isAllowedImport("@smog/jobs", "@smog/render/testing")).toBe(false);
  });

  test("a package may import itself", () => {
    expect(isAllowedImport("@smog/lists", "@smog/lists/server")).toBe(true);
  });
});
