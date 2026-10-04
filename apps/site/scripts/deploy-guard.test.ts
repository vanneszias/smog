import { describe, expect, it } from "bun:test";
import { readFileSync } from "node:fs";
import {
  CLIENT_SECRET_MARKERS,
  checkClientHasNoSecrets,
  checkDeployTarget,
  checkDevTools,
  checkNoE2eSeed,
  checkServerHasNoVideoPlayer,
  DEV_TOOLS_MARKER,
  E2E_SEED_MARKER,
  MUX_PLAYER_MARKERS,
} from "./deploy-guard";

describe("checkNoE2eSeed", () => {
  const seed = {
    content: `Response.json({marker:"${E2E_SEED_MARKER}"})`,
    path: "dist/server/assets/e2e-seed-handler.js",
  };
  const app = { content: "export default {}", path: "dist/server/index.js" };

  it("uses the seed module's own marker", () => {
    // Read as text: the module is Worker code (D1 types) outside scripts/.
    const source = readFileSync(
      new URL("../src/server/e2e-seed.ts", import.meta.url),
      "utf8"
    );
    expect(source).toContain(
      `export const E2E_SEED_MARKER = "${E2E_SEED_MARKER}";`
    );
  });

  it("refuses a staging or production build with the e2e seed endpoint", () => {
    for (const env of ["staging", "production"] as const) {
      expect(() => checkNoE2eSeed(env, [app, seed])).toThrow(
        "dist/server/assets/e2e-seed-handler.js"
      );
      expect(() => checkNoE2eSeed(env, [app])).not.toThrow();
    }
  });
});

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

  it("requires the gallery in a staging build, and nothing else (the video-field preview is gone)", () => {
    expect(() => checkDevTools("staging", [app, gallery])).not.toThrow();
    expect(() => checkDevTools("staging", [app])).toThrow(
      "staging build has no /dev/ui gallery"
    );
  });
});

describe("checkServerHasNoVideoPlayer", () => {
  const player = {
    content: `var ge=${MUX_PLAYER_MARKERS[0]};`,
    path: "dist/server/assets/player.js",
  };

  it("refuses a Worker build that bundles Mux Player", () => {
    expect(() =>
      checkServerHasNoVideoPlayer([
        { content: "export default {}", path: "dist/server/index.js" },
        player,
      ])
    ).toThrow("dist/server/assets/player.js");
  });

  it("allows the player in the client assets", () => {
    expect(() =>
      checkServerHasNoVideoPlayer([
        { ...player, path: "dist/client/assets/player.js" },
      ])
    ).not.toThrow();
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

describe("checkClientHasNoSecrets", () => {
  it("passes a client bundle without a secret's name or a server-only SDK", () => {
    expect(() =>
      checkClientHasNoSecrets([
        {
          content: 'fetch("https://direct.production.mux.com/upload/x")',
          path: "dist/client/assets/admin.js",
        },
        // The Worker reads the token; only the browser bundle matters.
        {
          content:
            "env.MUX_TOKEN_ID; env.MOLLIE_API_KEY; env.R2_SECRET_ACCESS_KEY; new AwsClient() /* aws4fetch AWS4-HMAC-SHA256 */",
          path: "dist/server/index.js",
        },
      ])
    ).not.toThrow();
  });

  it("fails on any secret's name, the Mux SDK or the S3 signer in dist/client", () => {
    for (const marker of CLIENT_SECRET_MARKERS) {
      expect(() =>
        checkClientHasNoSecrets([
          { content: `x.${marker}`, path: "dist/client/assets/a.js" },
        ])
      ).toThrow("dist/client/assets/a.js");
    }
    expect(CLIENT_SECRET_MARKERS).toEqual([
      "MUX_TOKEN",
      "MUX_WEBHOOK_SECRET",
      "@mux/mux-node",
      "MOLLIE_API_KEY",
      "R2_SECRET_ACCESS_KEY",
      "aws4fetch",
      "AWS4-HMAC-SHA256",
      "REMOTION_LICENSE_KEY",
    ]);
  });
});
