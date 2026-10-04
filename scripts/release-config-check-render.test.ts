import { describe, expect, test } from "bun:test";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { REQUIRED_WORKER_CONFIG } from "@smog/config/env/worker";
import {
  checkCiWorkflow,
  checkDeployWorkflow,
  checkReleaseScripts,
  checkRenderClassExports,
  checkRequiredConfig,
  checkWranglerRenderKeys,
  checkWranglerResources,
} from "./release-config-check";

/** The render gate's release checks (phase 7 ruling 2, task 2). */

const ROOT = join(import.meta.dir, "..");
const read = (...path: string[]) => readFileSync(join(ROOT, ...path), "utf8");
const CI = read(".github", "workflows", "ci.yml");
const DEPLOY = read(".github", "workflows", "deploy.yml");
const WRANGLER = read("apps", "site", "wrangler.jsonc");
const WORKER = read("apps", "site", "src", "worker.ts");
const PACKAGE = read("package.json");
const DEV_VARS_EXAMPLE = read("apps", "site", ".dev.vars.example");

/** `wrangler.jsonc` with `env.<name>.vars.RENDER_MODE` replaced. */
function withRenderMode(name: string, mode: string): string {
  const parsed = Bun.JSONC.parse(WRANGLER) as {
    env: Record<string, { vars: Record<string, unknown> }>;
  };
  const env = parsed.env[name];
  if (env) {
    env.vars.RENDER_MODE = mode;
  }
  return JSON.stringify(parsed);
}

/** `wrangler.jsonc` with `value` set at `key` of `env.<name>` (or the top). */
function withKey(name: string | null, key: string, value: unknown): string {
  const parsed = Bun.JSONC.parse(WRANGLER) as Record<string, unknown> & {
    env: Record<string, Record<string, unknown>>;
  };
  const target = name ? parsed.env[name] : parsed;
  if (target) {
    target[key] = value;
  }
  return JSON.stringify(parsed);
}

describe("checkWranglerRenderKeys", () => {
  test("passes on the real config", () => {
    expect(checkWranglerRenderKeys(WRANGLER)).toEqual([]);
  });

  test("fails on a render key in wrangler.jsonc, at the top or in an env", () => {
    for (const key of [
      "workflows",
      "containers",
      "durable_objects",
      "migrations",
    ]) {
      expect(checkWranglerRenderKeys(withKey("staging", key, []))).toEqual([
        `apps/site/wrangler.jsonc: env.staging.${key} is not allowed: the render gate adds it at build time (apps/site/render-config.ts)`,
      ]);
      expect(checkWranglerRenderKeys(withKey(null, key, []))).toEqual([
        `apps/site/wrangler.jsonc: ${key} is not allowed: the render gate adds it at build time (apps/site/render-config.ts)`,
      ]);
    }
  });
});

describe("RENDER_MODE in wrangler.jsonc", () => {
  test("is one of the modes, and local only in dev", () => {
    expect(
      checkWranglerResources(withRenderMode("staging", "docker")).join("\n")
    ).toContain(
      "env.staging: vars.RENDER_MODE must be one of container, local, fake"
    );
    expect(
      checkWranglerResources(withRenderMode("staging", "local")).join("\n")
    ).toContain("env.staging: vars.RENDER_MODE=local is dev only");
    expect(checkWranglerResources(withRenderMode("dev", "local"))).toEqual([]);
  });
});

describe("checkDeployWorkflow: SMOG_RENDER_PIPELINE", () => {
  test("passes on the real deploy.yml", () => {
    expect(checkDeployWorkflow(DEPLOY)).toEqual([]);
  });

  test("fails when the ensure or the deploy step does not get the flag", () => {
    const lines = DEPLOY.split("\n");
    const flagLines = lines
      .map((line, index) => ({ index, line }))
      .filter(({ line }) => line.includes("SMOG_RENDER_PIPELINE:"));
    expect(flagLines).toHaveLength(2);
    for (const [at, step] of [
      [0, "Ensure Cloudflare resources"],
      [1, "Deploy"],
    ] as const) {
      const without = lines
        .filter((_, index) => index !== flagLines[at]?.index)
        .join("\n");
      expect(checkDeployWorkflow(without)).toContain(
        `deploy.yml: the "${step}" step must pass SMOG_RENDER_PIPELINE: \${{ vars.SMOG_RENDER_PIPELINE }} (the render gate)`
      );
    }
  });

  test("the flag comes from the environment variable, never a literal", () => {
    const literal = DEPLOY.replaceAll(
      // biome-ignore lint/suspicious/noTemplateCurlyInString: GitHub Actions expression, not JavaScript interpolation.
      "SMOG_RENDER_PIPELINE: ${{ vars.SMOG_RENDER_PIPELINE }}",
      'SMOG_RENDER_PIPELINE: "1"'
    );
    expect(checkDeployWorkflow(literal).join("\n")).toContain(
      "must pass SMOG_RENDER_PIPELINE"
    );
  });
});

describe("checkRenderClassExports", () => {
  test("passes on the real worker entry", () => {
    expect(checkRenderClassExports(WORKER)).toEqual([]);
  });

  test("fails when a class export is missing", () => {
    for (const name of ["RenderSponsorshipVideo", "SmogRenderer"]) {
      const without = WORKER.split("\n")
        .filter((line) => !line.includes(`export { ${name} }`))
        .join("\n");
      expect(checkRenderClassExports(without)).toEqual([
        `apps/site/src/worker.ts: must export ${name} (a class deployed once must stay exported; the render gate binds it)`,
      ]);
    }
  });

  test("an export inside a comment or a string does not count", () => {
    const commented = [
      "// export { RenderSponsorshipVideo } from './a';",
      "/* export class SmogRenderer {} */",
      'const s = "export { SmogRenderer }";',
      "export default {};",
    ].join("\n");
    expect(checkRenderClassExports(commented)).toHaveLength(2);
    expect(
      checkRenderClassExports(
        "export class RenderSponsorshipVideo {}\nexport { SmogRenderer } from './r';"
      )
    ).toEqual([]);
  });
});

describe("checkRequiredConfig follows each env's RENDER_MODE (task 1 Minor 5)", () => {
  test("passes on the real files", () => {
    expect(
      checkRequiredConfig({
        devVarsExample: DEV_VARS_EXAMPLE,
        wrangler: WRANGLER,
      })
    ).toEqual([]);
  });

  test("staging flipped to container needs the Mux trio", () => {
    const flipped = withRenderMode("staging", "container");
    // Derived from the file: the trio is required, and documented.
    expect(
      checkRequiredConfig({
        devVarsExample: DEV_VARS_EXAMPLE,
        wrangler: flipped,
      })
    ).toEqual([]);
    const undocumented = DEV_VARS_EXAMPLE.replace(
      "# MUX_TOKEN_SECRET=",
      "# (removed)"
    );
    expect(undocumented).not.toBe(DEV_VARS_EXAMPLE);
    expect(
      checkRequiredConfig({ devVarsExample: undocumented, wrangler: flipped })
    ).toContain(
      "apps/site/.dev.vars.example: must document MUX_TOKEN_SECRET (required in staging)"
    );
  });

  test("a required list made for fake fails a container env", () => {
    const errors = checkRequiredConfig({
      devVarsExample: DEV_VARS_EXAMPLE,
      required: REQUIRED_WORKER_CONFIG,
      wrangler: withRenderMode("staging", "container"),
    });
    expect(errors).toEqual(
      ["MUX_TOKEN_ID", "MUX_TOKEN_SECRET", "MUX_WEBHOOK_SECRET"].map(
        (key) =>
          `REQUIRED_WORKER_CONFIG.staging: RENDER_MODE=container needs ${key}`
      )
    );
  });
});

describe("the four release lanes (ruling 16)", () => {
  test("ci.yml runs core, tests, mobile and render", () => {
    expect(checkCiWorkflow(CI)).toEqual([]);
    expect(
      checkCiWorkflow(
        CI.replace("core, tests, mobile, render", "core, tests, mobile")
      )
    ).toContain(
      "ci.yml: release:check matrix must include core, tests, mobile and render"
    );
  });

  test("package.json has a script per lane, and release:check runs each", () => {
    expect(checkReleaseScripts(PACKAGE)).toEqual([]);
    const parsed = JSON.parse(PACKAGE) as { scripts: Record<string, string> };
    const withoutRender = structuredClone(parsed);
    withoutRender.scripts["release:check"] = String(
      parsed.scripts["release:check"]
    ).replace(" && bun run release:check:render", "");
    expect(checkReleaseScripts(JSON.stringify(withoutRender))).toEqual([
      "package.json: release:check must run release:check:render",
    ]);
    const noDryRun = structuredClone(parsed);
    noDryRun.scripts["release:check:core"] = String(
      parsed.scripts["release:check:core"]
    ).replace(" && bun -F @smog/site deploy:dry", "");
    expect(checkReleaseScripts(JSON.stringify(noDryRun))).toEqual([
      "package.json: release:check:core must run `bun -F @smog/site deploy:dry`",
    ]);
    const noScript = structuredClone(parsed);
    Reflect.deleteProperty(noScript.scripts, "release:check:render");
    expect(checkReleaseScripts(JSON.stringify(noScript))).toContain(
      "package.json: missing the release:check:render script"
    );
  });
});
