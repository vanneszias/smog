import { describe, expect, test } from "bun:test";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import {
  type CommandRunner,
  type EnsureMode,
  ensureResources,
  planResources,
  renderPipelineEnabled,
  type WranglerResult,
} from "./ensure-cloudflare-resources";

/**
 * The render pipeline's probes (phase 7 ruling 2): only when the env's
 * `RENDER_MODE` is `container` and `SMOG_RENDER_PIPELINE=1`, the deploy job
 * checks, before anything else, that the token reaches Workflows, that
 * Docker runs, and that Containers are reachable. It creates nothing.
 */

const ROOT = join(import.meta.dir, "..");
const WRANGLER = readFileSync(
  join(ROOT, "apps", "site", "wrangler.jsonc"),
  "utf8"
);
const ORIGIN = "https://smog-site-staging.zias.workers.dev";

const ok = (stdout = ""): WranglerResult => ({ code: 0, stderr: "", stdout });
const fail = (stderr: string): WranglerResult => ({
  code: 1,
  stderr,
  stdout: "",
});

/** An account where every queue, the bucket and its CORS already exist. */
function provisioned(args: string[]): WranglerResult {
  const [a, b, c, d] = args;
  if (a === "queues" && b === "info" && c) {
    return ok(`Queue Name: ${c}\nQueue ID: 1`);
  }
  if (a === "r2" && b === "bucket" && c === "list") {
    return ok("name:           smog-staging-media\ncreation_date:  x");
  }
  if (a === "r2" && b === "bucket" && c === "cors" && d === "list") {
    return ok(
      [
        `allowed_origins:  ${ORIGIN}`,
        "allowed_methods:  PUT",
        "allowed_headers:  content-type",
      ].join("\n")
    );
  }
  return fail(`unexpected command: ${args.join(" ")}`);
}

interface Answers {
  containers?: WranglerResult;
  docker?: WranglerResult;
  workflows?: WranglerResult;
}

async function ensure(
  mode: EnsureMode,
  pipeline: boolean,
  answers: Answers = {}
) {
  const calls: string[] = [];
  const run = (args: string[]) => {
    calls.push(`wrangler ${args.join(" ")}`);
    if (args[0] === "workflows" && args[1] === "list") {
      return Promise.resolve(answers.workflows ?? ok("[]"));
    }
    if (args[0] === "containers" && args[1] === "list") {
      return Promise.resolve(answers.containers ?? ok("[]"));
    }
    return Promise.resolve(provisioned(args));
  };
  const docker: CommandRunner = (args) => {
    calls.push(`docker ${args.join(" ")}`);
    return Promise.resolve(answers.docker ?? ok("Server Version: 28"));
  };
  const lines: string[] = [];
  const outcome = ensureResources({
    docker,
    env: "staging",
    log: {
      log: (line) => lines.push(line),
      warn: (line) => lines.push(`warn: ${line}`),
    },
    mode,
    pipeline,
    plan: planResources(WRANGLER, "staging"),
    run,
  });
  try {
    const result = await outcome;
    return { calls, error: null, lines, result };
  } catch (error) {
    return {
      calls,
      error: error instanceof Error ? error.message : String(error),
      lines,
      result: null,
    };
  }
}

const PROBES = [
  "wrangler workflows list",
  "docker info",
  "wrangler containers list",
];

describe("renderPipelineEnabled", () => {
  const withMode = (mode: string) =>
    WRANGLER.replace(
      '"ENVIRONMENT": "staging",\n        "MEDIA_BUCKET": "smog-staging-media",\n        "RENDER_MODE": "fake"',
      `"ENVIRONMENT": "staging",\n        "MEDIA_BUCKET": "smog-staging-media",\n        "RENDER_MODE": "${mode}"`
    );

  test("is on only for container with SMOG_RENDER_PIPELINE=1", () => {
    expect(withMode("container")).not.toBe(WRANGLER);
    expect(renderPipelineEnabled(withMode("container"), "staging", "1")).toBe(
      true
    );
    for (const flag of [undefined, "", "0"]) {
      expect(
        renderPipelineEnabled(withMode("container"), "staging", flag)
      ).toBe(false);
    }
    expect(renderPipelineEnabled(WRANGLER, "staging", "1")).toBe(false);
  });

  test("staging today (fake) is off, and production without the flag is off", () => {
    expect(renderPipelineEnabled(WRANGLER, "staging", undefined)).toBe(false);
    expect(renderPipelineEnabled(WRANGLER, "production", undefined)).toBe(
      false
    );
    expect(renderPipelineEnabled(WRANGLER, "production", "1")).toBe(true);
  });
});

describe("the render probes", () => {
  test("gate off: nothing new runs", async () => {
    const runs = await Promise.all([
      ensure("create", false),
      ensure("check", false),
    ]);
    for (const { calls, result } of runs) {
      expect(result?.ok).toBe(true);
      for (const probe of PROBES) {
        expect(calls).not.toContain(probe);
      }
      expect(calls.every((call) => call.startsWith("wrangler "))).toBe(true);
      expect(calls.some((call) => call.includes("workflows"))).toBe(false);
      expect(calls.some((call) => call.includes("containers"))).toBe(false);
    }
    const dry = await ensure("dry-run", false);
    expect(dry.lines.join("\n")).not.toContain("workflows");
    expect(dry.lines.join("\n")).not.toContain("docker");
  });

  test("gate on, all fine: the three probes run first, then the resources", async () => {
    const runs = await Promise.all([
      ensure("create", true),
      ensure("check", true),
    ]);
    for (const { calls, lines, result } of runs) {
      expect(result?.ok).toBe(true);
      expect(calls.slice(0, 3)).toEqual(PROBES);
      expect(calls.length).toBeGreaterThan(3);
      expect(lines.join("\n")).toContain(
        "[provision] staging: Workflows and Containers are reachable, and Docker runs."
      );
    }
  });

  test("Workflows refused: names it and stops before anything else", async () => {
    const { calls, error } = await ensure("create", true, {
      workflows: fail(
        "✘ [ERROR] A request to the Cloudflare API (/accounts/x/workflows) failed.\n  Authentication error [code: 10000]"
      ),
    });
    expect(error).toContain(
      "[provision] Workflows: the token cannot list Workflows (wrangler workflows list exited 1)"
    );
    expect(error).toContain("Authentication error [code: 10000]");
    expect(calls).toEqual(["wrangler workflows list"]);
  });

  test("Docker missing: names it", async () => {
    const { calls, error } = await ensure("create", true, {
      docker: fail(
        "Cannot connect to the Docker daemon at unix:///var/run/docker.sock."
      ),
    });
    expect(error).toContain(
      "[provision] Containers: Docker is not running in the deploy job (docker info exited 1)"
    );
    expect(calls).toEqual(["wrangler workflows list", "docker info"]);
  });

  test("Containers refused: names it", async () => {
    const { calls, error } = await ensure("check", true, {
      containers: fail(
        "✘ [ERROR] You need 'containers:write', try logging in again or creating an appropiate API token"
      ),
    });
    expect(error).toContain(
      "[provision] Containers: the token cannot list Containers (wrangler containers list exited 1)"
    );
    expect(calls).toEqual(PROBES);
  });

  test("a docker that cannot start at all is Docker missing", async () => {
    const { error } = await ensure("create", true, {
      docker: { code: 127, stderr: "docker: command not found", stdout: "" },
    });
    expect(error).toContain("[provision] Containers: Docker is not running");
  });

  test("dry-run prints the probes when the gate is on, and calls nothing", async () => {
    const { calls, lines } = await ensure("dry-run", true);
    expect(calls).toEqual([]);
    const output = lines.join("\n");
    expect(output).toContain("(cd apps/site && bunx wrangler workflows list)");
    expect(output).toContain("docker info");
    expect(output).toContain("(cd apps/site && bunx wrangler containers list)");
  });
});
