import { describe, expect, test } from "bun:test";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import {
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
});
