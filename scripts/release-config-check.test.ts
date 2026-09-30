import { describe, expect, test } from "bun:test";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import {
  type AppLinkIdentity,
  appLinkIdentity,
  checkAppLinks,
  checkCiWorkflow,
  checkDeployWorkflow,
  checkReleaseConfig,
  checkWranglerConfig,
  migrationsDirFromWrangler,
} from "./release-config-check";

const ROOT = join(import.meta.dir, "..");
const FIXTURES = join(import.meta.dir, "__fixtures__", "release-config");
const CLOUDFLARE_ENV_LINE = /CLOUDFLARE_ENV: \$\{\{.*\}\}/;
const ACCOUNT_ID_LINE =
  /CLOUDFLARE_ACCOUNT_ID: \$\{\{ secrets\.CLOUDFLARE_ACCOUNT_ID \}\}/;
const CI = readFileSync(join(ROOT, ".github", "workflows", "ci.yml"), "utf8");
const DEPLOY = readFileSync(
  join(ROOT, ".github", "workflows", "deploy.yml"),
  "utf8"
);

describe("checkReleaseConfig", () => {
  test("passes on the real repository", () => {
    expect(checkReleaseConfig(ROOT)).toEqual([]);
  });
});

describe("checkCiWorkflow", () => {
  test("fails when a release lane is dropped", () => {
    for (const lanes of ["core, tests", "core, mobile", "tests, mobile"]) {
      expect(
        checkCiWorkflow(CI.replace("core, tests, mobile", lanes)).join("\n")
      ).toContain("matrix must include");
    }
  });

  test("keeps other checks running after a lane fails", () => {
    expect(
      checkCiWorkflow(CI.replace("fail-fast: false", "fail-fast: true")).join(
        "\n"
      )
    ).toContain("fail-fast: false");
  });

  test("fails when ci.yml does not run release:check", () => {
    const errors = checkCiWorkflow(
      readFileSync(join(FIXTURES, "ci-missing-release-check.yml"), "utf8")
    );
    expect(errors.join("\n")).toContain("release:check");
  });

  test("fails when CI runs in offline mode", () => {
    const ci = readFileSync(
      join(ROOT, ".github", "workflows", "ci.yml"),
      "utf8"
    ).replace(
      "run: bun run release:check",
      "run: SMOG_OFFLINE=1 bun run release:check"
    );
    expect(checkCiWorkflow(ci).join("\n")).toContain("SMOG_OFFLINE");
  });
});

describe("checkCiWorkflow order and reuse", () => {
  test("fails when release:check runs before the install", () => {
    const swapped = CI.replace(
      "run: bun install --frozen-lockfile",
      "run: __INSTALL__"
    )
      .replace(
        "run: bun run release:check",
        "run: bun install --frozen-lockfile"
      )
      .replace("run: __INSTALL__", "run: bun run release:check");
    expect(checkCiWorkflow(swapped).join("\n")).toContain("before");
  });

  test("fails when ci.yml cannot be called by deploy.yml", () => {
    const errors = checkCiWorkflow(
      CI.replace("workflow_call:", "workflow_dispatch:")
    );
    expect(errors.join("\n")).toContain("workflow_call");
  });
});

describe("checkDeployWorkflow", () => {
  test("fails when the deploy does not wait for the release check", () => {
    const errors = checkDeployWorkflow(
      DEPLOY.replace("needs: release-check", "")
    );
    expect(errors.join("\n")).toContain("needs");
  });

  test("fails when CLOUDFLARE_ENV drifts from the environment", () => {
    const errors = checkDeployWorkflow(
      DEPLOY.replace(CLOUDFLARE_ENV_LINE, "CLOUDFLARE_ENV: staging")
    );
    expect(errors.join("\n")).toContain("CLOUDFLARE_ENV");
  });

  test("fails when the migrations guard looks at another directory", () => {
    const errors = checkDeployWorkflow(
      DEPLOY.replace("packages/db/migrations/*.sql", "apps/site/migrations/**")
    );
    expect(errors.join("\n")).toContain("packages/db/migrations");
  });

  test("follows migrations_dir from wrangler.jsonc", () => {
    expect(
      checkDeployWorkflow(DEPLOY, "packages/other/migrations").join("\n")
    ).toContain("packages/other/migrations");
  });

  test("a ::warning:: in a comment does not count", () => {
    const errors = checkDeployWorkflow(
      DEPLOY.replace('echo "::warning::', 'echo "warning:').replace(
        "jobs:",
        "# ::warning::\njobs:"
      )
    );
    expect(errors.join("\n")).toContain("::warning::");
  });

  test("a secret named only in a comment does not count", () => {
    const errors = checkDeployWorkflow(
      DEPLOY.replace(
        ACCOUNT_ID_LINE,
        "CLOUDFLARE_ACCOUNT_ID: x # secrets.CLOUDFLARE_ACCOUNT_ID"
      )
    );
    expect(errors.join("\n")).toContain("CLOUDFLARE_ACCOUNT_ID");
  });

  test("fails on a raw wrangler deploy", () => {
    const errors = checkDeployWorkflow(
      DEPLOY.replace("bun -F @smog/site deploy", "bunx wrangler deploy")
    );
    expect(errors.join("\n")).toContain("bun -F @smog/site deploy");
  });

  test("fails without the D1 migrations step", () => {
    const lines = DEPLOY.replace(
      "wrangler d1 migrations apply",
      "wrangler d1 migrations list"
    );
    expect(checkDeployWorkflow(lines).join("\n")).toContain(
      "wrangler d1 migrations apply"
    );
  });

  test("fails without the master branch trigger", () => {
    const errors = checkDeployWorkflow(DEPLOY.replace("- master", "- main"));
    expect(errors.join("\n")).toContain("master");
  });

  test("fails without the Cloudflare secrets", () => {
    const errors = checkDeployWorkflow(
      DEPLOY.replaceAll("secrets.CLOUDFLARE_ACCOUNT_ID", "vars.ACCOUNT")
    );
    expect(errors.join("\n")).toContain("CLOUDFLARE_ACCOUNT_ID");
  });
});

describe("migrationsDirFromWrangler", () => {
  test("defaults to packages/db/migrations without D1", () => {
    expect(migrationsDirFromWrangler('{ "env": { "staging": {} } }')).toBe(
      "packages/db/migrations"
    );
  });

  test("resolves migrations_dir relative to apps/site", () => {
    const config = JSON.stringify({
      env: {
        production: {
          d1_databases: [
            { binding: "DB", migrations_dir: "../../packages/db/migrations" },
          ],
        },
        staging: {
          d1_databases: [
            { binding: "DB", migrations_dir: "../../packages/db/migrations" },
          ],
        },
      },
    });
    expect(migrationsDirFromWrangler(config)).toBe("packages/db/migrations");
  });

  test("uses the wrangler default when migrations_dir is absent", () => {
    const config = JSON.stringify({
      env: { staging: { d1_databases: [{ binding: "DB" }] } },
    });
    expect(migrationsDirFromWrangler(config)).toBe("apps/site/migrations");
  });
});

describe("checkWranglerConfig", () => {
  test("fails on top-level bindings", () => {
    const errors = checkWranglerConfig(
      '{ "d1_databases": [], "env": { "staging": {}, "production": {} } }'
    );
    expect(errors.join("\n")).toContain("d1_databases");
  });

  test("fails without env.production", () => {
    const errors = checkWranglerConfig('{ "env": { "staging": {} } }');
    expect(errors.join("\n")).toContain("env.production");
  });

  test("requires vars.ENVIRONMENT to equal the env name", () => {
    const errors = checkWranglerConfig(
      JSON.stringify({
        env: {
          dev: { vars: { ENVIRONMENT: "dev" } },
          production: { vars: { ENVIRONMENT: "staging" } },
          staging: { vars: {} },
        },
      })
    );
    expect(errors).toEqual([
      'apps/site/wrangler.jsonc: env.production.vars.ENVIRONMENT must be "production"',
      'apps/site/wrangler.jsonc: env.staging.vars.ENVIRONMENT must be "staging"',
    ]);
  });
});

const IDENTITY: AppLinkIdentity = {
  androidPackage: "be.zias.smog",
  bundleId: "be.zias.smog",
  pathPrefixes: ["/gestures/", "/lists/"],
  paths: ["/magic-link/app"],
  teamId: "96XKP6MU2A",
};
const AASA_PATHS = ["/gestures/*", "/lists/*", "/magic-link/app"];
const FINGERPRINT =
  "23:4A:F1:75:8A:A7:4E:68:6B:D0:C0:9B:DA:E0:7F:ED:3F:64:C8:4E:D5:BD:EE:4A:AF:E6:EE:27:73:60:B1:C5";

function aasa(appIDs: string[], paths: string[]): string {
  return JSON.stringify({
    applinks: {
      details: [{ appIDs, components: paths.map((path) => ({ "/": path })) }],
    },
  });
}

function assetlinks(packageName: string, fingerprints: string[]): string {
  return JSON.stringify([
    {
      relation: ["delegate_permission/common.handle_all_urls"],
      target: {
        namespace: "android_app",
        package_name: packageName,
        sha256_cert_fingerprints: fingerprints,
      },
    },
  ]);
}

const HEADERS = `/.well-known/apple-app-site-association
  Content-Type: application/json
/.well-known/assetlinks.json
  Content-Type: application/json
`;

describe("appLinkIdentity", () => {
  test("reads the ids and the app-link paths from the Expo config", () => {
    expect(
      appLinkIdentity({
        android: {
          intentFilters: [
            { data: [{ scheme: "smog" }] },
            {
              autoVerify: true,
              data: [
                { host: "h", pathPrefix: "/gestures/", scheme: "https" },
                { host: "h", pathPrefix: "/lists/", scheme: "https" },
                { host: "h", path: "/magic-link/app", scheme: "https" },
              ],
            },
          ],
          package: "be.zias.smog",
        },
        ios: { appleTeamId: "96XKP6MU2A", bundleIdentifier: "be.zias.smog" },
      })
    ).toEqual(IDENTITY);
  });

  test("reports what is missing", () => {
    expect(appLinkIdentity({})).toEqual([
      "apps/mobile/app.config.ts: ios.appleTeamId, ios.bundleIdentifier and android.package are required",
    ]);
  });
});

describe("checkAppLinks", () => {
  test("passes when the files match the app", () => {
    expect(
      checkAppLinks(
        {
          aasa: aasa(["96XKP6MU2A.be.zias.smog"], AASA_PATHS),
          assetlinks: assetlinks("be.zias.smog", [FINGERPRINT]),
          headers: HEADERS,
        },
        IDENTITY
      )
    ).toEqual([]);
  });

  test("compares exact paths too (the magic-link hand-off, phase 4 task 5)", () => {
    const missing = checkAppLinks(
      {
        aasa: aasa(["96XKP6MU2A.be.zias.smog"], ["/gestures/*", "/lists/*"]),
        assetlinks: assetlinks("be.zias.smog", [FINGERPRINT]),
        headers: HEADERS,
      },
      IDENTITY
    );
    expect(missing).toEqual([
      'apps/site/public/.well-known/apple-app-site-association: components must be ["/gestures/*","/lists/*","/magic-link/app"] (app.config.ts intent filters)',
    ]);
    // An exact path is not a prefix: `/magic-link/app*` does not match it.
    const wildcard = checkAppLinks(
      {
        aasa: aasa(
          ["96XKP6MU2A.be.zias.smog"],
          ["/gestures/*", "/lists/*", "/magic-link/app*"]
        ),
        assetlinks: assetlinks("be.zias.smog", [FINGERPRINT]),
        headers: HEADERS,
      },
      IDENTITY
    );
    expect(wildcard).toHaveLength(1);
  });

  test("fails on another team, bundle or path set", () => {
    const errors = checkAppLinks(
      {
        aasa: aasa(["ABCDE12345.be.zias.smog"], ["/gestures/*"]),
        assetlinks: assetlinks("be.zias.smog", [FINGERPRINT]),
        headers: HEADERS,
      },
      IDENTITY
    );
    expect(errors).toEqual([
      'apps/site/public/.well-known/apple-app-site-association: appIDs must be ["96XKP6MU2A.be.zias.smog"]',
      'apps/site/public/.well-known/apple-app-site-association: components must be ["/gestures/*","/lists/*","/magic-link/app"] (app.config.ts intent filters)',
    ]);
  });

  test("fails on another package or a malformed fingerprint", () => {
    const errors = checkAppLinks(
      {
        aasa: aasa(["96XKP6MU2A.be.zias.smog"], AASA_PATHS),
        assetlinks: assetlinks("be.zias.other", ["23:4a:f1"]),
        headers: HEADERS,
      },
      IDENTITY
    );
    expect(errors).toEqual([
      'apps/site/public/.well-known/assetlinks.json: package_name must be "be.zias.smog"',
      'apps/site/public/.well-known/assetlinks.json: "23:4a:f1" is not an upper-case SHA-256 fingerprint',
    ]);
  });

  test("requires at least one fingerprint and valid JSON", () => {
    expect(
      checkAppLinks(
        {
          aasa: "{",
          assetlinks: assetlinks("be.zias.smog", []),
          headers: HEADERS,
        },
        IDENTITY
      )
    ).toEqual([
      "apps/site/public/.well-known/apple-app-site-association: invalid JSON",
      "apps/site/public/.well-known/assetlinks.json: sha256_cert_fingerprints is empty",
    ]);
  });

  test("requires both files to be served as application/json", () => {
    const errors = checkAppLinks(
      {
        aasa: aasa(["96XKP6MU2A.be.zias.smog"], AASA_PATHS),
        assetlinks: assetlinks("be.zias.smog", [FINGERPRINT]),
        headers:
          "/.well-known/assetlinks.json\n  Content-Type: application/json\n",
      },
      IDENTITY
    );
    expect(errors).toEqual([
      "apps/site/public/_headers: /.well-known/apple-app-site-association needs Content-Type: application/json",
    ]);
  });
});
