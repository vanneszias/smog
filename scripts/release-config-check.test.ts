import { describe, expect, test } from "bun:test";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import {
  checkCiWorkflow,
  checkDeployWorkflow,
  checkReleaseConfig,
  checkWranglerConfig,
} from "./release-config-check";

const ROOT = join(import.meta.dir, "..");
const FIXTURES = join(import.meta.dir, "__fixtures__", "release-config");
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

describe("checkDeployWorkflow", () => {
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
