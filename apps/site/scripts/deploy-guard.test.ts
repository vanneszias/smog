import { describe, expect, it } from "bun:test";
import {
  checkDeployTarget,
  checkDevTools,
  DEV_TOOLS_MARKER,
} from "./deploy-guard";

describe("checkDevTools", () => {
  const gallery = {
    content: `jsx("section",{"${DEV_TOOLS_MARKER}":theme})`,
    path: "dist/server/assets/ui-gallery.js",
  };
  const app = { content: "export default {}", path: "dist/server/index.js" };

  it("refuses a production build that contains the /dev/ui gallery", () => {
    expect(() => checkDevTools("production", [app, gallery])).toThrow(
      "dist/server/assets/ui-gallery.js"
    );
  });

  it("passes a production build without it", () => {
    expect(() => checkDevTools("production", [app])).not.toThrow();
  });

  it("requires the gallery in a staging build (dev and staging keep /dev/ui)", () => {
    expect(() => checkDevTools("staging", [app, gallery])).not.toThrow();
    expect(() => checkDevTools("staging", [app])).toThrow(
      "staging build has no /dev/ui gallery"
    );
  });
});

describe("checkDeployTarget", () => {
  it("passes when CLOUDFLARE_ENV matches the build", () => {
    expect(checkDeployTarget("staging", { targetEnvironment: "staging" })).toBe(
      "staging"
    );
    expect(
      checkDeployTarget("production", { targetEnvironment: "production" })
    ).toBe("production");
  });

  it("refuses a missing CLOUDFLARE_ENV", () => {
    expect(() =>
      checkDeployTarget(undefined, { targetEnvironment: "staging" })
    ).toThrow("CLOUDFLARE_ENV must be one of staging, production");
  });

  it("refuses dev and unknown environments", () => {
    expect(() =>
      checkDeployTarget("dev", { targetEnvironment: "dev" })
    ).toThrow('got "dev"');
    expect(() =>
      checkDeployTarget("preview", { targetEnvironment: "preview" })
    ).toThrow('got "preview"');
  });

  it("refuses a build made for another environment", () => {
    expect(() =>
      checkDeployTarget("production", { targetEnvironment: "staging" })
    ).toThrow('dist/ was built for "staging", not "production"');
  });

  it("refuses a top-level build without a target environment", () => {
    expect(() => checkDeployTarget("staging", { name: "smog-site" })).toThrow(
      "dist/ was built for null"
    );
    expect(() => checkDeployTarget("staging", null)).toThrow(
      "dist/ was built for null"
    );
  });
});
