import { describe, expect, test } from "bun:test";
import {
  allowedTargets,
  BOUNDARIES,
  FEATURE_PACKAGES,
  isAllowedDependency,
  isAllowedImport,
} from "./boundaries";

describe("BOUNDARIES", () => {
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

  test("config depends on nothing", () => {
    expect(allowedTargets("@smog/config")).toEqual([]);
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

  test("a feature may import another feature's schema only", () => {
    expect(isAllowedImport("@smog/lists", "@smog/gestures/schema")).toBe(true);
    expect(isAllowedImport("@smog/lists", "@smog/gestures/server")).toBe(false);
    expect(isAllowedImport("@smog/lists", "@smog/gestures")).toBe(false);
  });

  test("a package may import itself", () => {
    expect(isAllowedImport("@smog/lists", "@smog/lists/server")).toBe(true);
  });
});
