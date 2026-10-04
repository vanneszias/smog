import { describe, expect, test } from "bun:test";
import { chmodSync, mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import {
  checkDeployConfig,
  D1_PLACEHOLDER_ID,
  explainSecretListFailure,
  KV_PLACEHOLDER_ID,
  parseSecretList,
  runCheck,
} from "./check-deploy-config";
import type {
  CommandRunner,
  WranglerResult,
} from "./ensure-cloudflare-resources";

const ROOT = join(import.meta.dir, "..");
const WRANGLER = readFileSync(
  join(ROOT, "apps", "site", "wrangler.jsonc"),
  "utf8"
);

const STAGING_SECRETS = ["BETTER_AUTH_SECRET", "TURNSTILE_SECRET_KEY"];
const MUX_TRIO = ["MUX_TOKEN_ID", "MUX_TOKEN_SECRET", "MUX_WEBHOOK_SECRET"];
const PRODUCTION_SECRETS = [
  "BETTER_AUTH_SECRET",
  "TURNSTILE_SECRET_KEY",
  "MOLLIE_API_KEY",
  ...MUX_TRIO,
  "R2_ACCESS_KEY_ID",
  "R2_SECRET_ACCESS_KEY",
];

/** `wrangler secret list --format json` of wrangler 4.147.0: `JSON.stringify(secrets, null, "  ")`. */
function secretListOutput(names: readonly string[]): string {
  return JSON.stringify(
    names.map((name) => ({ name, type: "secret_text" })),
    null,
    "  "
  );
}

/** The real wrangler 4.147.0 message for a Worker that does not exist. */
const WORKER_NOT_FOUND = [
  "",
  '✘ [ERROR] Worker "smog-site-production" (env: production) not found.',
  "",
  "  If this is a new Worker, run `wrangler deploy` first to create it.",
  "  Otherwise, check that the Worker name is correct and you're logged into the right account.",
  "",
].join("\n");

const AUTH_FAILURE = [
  "✘ [ERROR] A request to the Cloudflare API (/accounts/abc/workers/scripts/smog-site-staging/secrets) failed.",
  "",
  "  Authentication error [code: 10000]",
].join("\n");

const NO_TOKEN =
  "✘ [ERROR] In a non-interactive environment, it's necessary to set a CLOUDFLARE_API_TOKEN environment variable for wrangler to work.";

interface EnvBlock {
  d1_databases?: Record<string, unknown>[];
  kv_namespaces?: Record<string, unknown>[];
  vars: Record<string, unknown>;
}

interface Config {
  env: Partial<Record<"staging" | "production", EnvBlock>>;
}

function envBlock(config: Config, name: "staging" | "production"): EnvBlock {
  const block = config.env[name];
  if (!block) {
    throw new Error(`wrangler.jsonc has no env.${name}`);
  }
  return block;
}

/** The real `wrangler.jsonc` with `change` applied to a copy. */
function wranglerWith(change: (config: Config) => void): string {
  const config = Bun.JSONC.parse(WRANGLER) as Config;
  change(config);
  return JSON.stringify(config);
}

function stagingVars(vars: Record<string, unknown>): string {
  return wranglerWith((config) => {
    Object.assign(envBlock(config, "staging").vars, vars);
  });
}

/** Production with its launch values filled in (no placeholder left). */
const PRODUCTION_READY = wranglerWith((config) => {
  const production = envBlock(config, "production");
  production.vars.R2_ACCOUNT_ID = "0123456789abcdef0123456789abcdef";
  production.vars.TURNSTILE_SITE_KEY = "0x4AAAAAAAreal";
  for (const kv of production.kv_namespaces ?? []) {
    kv.id = "a1b2c3d4e5f60718293a4b5c6d7e8f90";
  }
  for (const d1 of production.d1_databases ?? []) {
    d1.database_id = "4a2f0e2c-9d31-4b77-8f5a-2a9d1c3e4b5f";
  }
});

describe("checkDeployConfig: the files (offline)", () => {
  test("staging as committed passes", () => {
    expect(
      checkDeployConfig({ env: "staging", secrets: null, wrangler: WRANGLER })
    ).toEqual({ errors: [], recommended: [], warnings: [] });
  });

  test("production as committed lists the pre-launch placeholders", () => {
    const { errors } = checkDeployConfig({
      env: "production",
      secrets: null,
      wrangler: WRANGLER,
    });
    expect(errors).toHaveLength(4);
    expect(errors.join("\n")).toContain("TURNSTILE_SITE_KEY");
    expect(errors.join("\n")).toContain("R2_ACCOUNT_ID");
    expect(errors.join("\n")).toContain(D1_PLACEHOLDER_ID);
    expect(errors.join("\n")).toContain(KV_PLACEHOLDER_ID);
    expect(errors.join("\n")).not.toContain("SITE_URL");
  });

  test("production with its launch values passes", () => {
    expect(
      checkDeployConfig({
        env: "production",
        secrets: null,
        wrangler: PRODUCTION_READY,
      }).errors
    ).toEqual([]);
  });

  test("a required var that is empty or blank is refused", () => {
    for (const value of ["", "   ", undefined]) {
      const wrangler = wranglerWith((config) => {
        const production = envBlock(config, "production");
        Object.assign(
          production,
          envBlock(Bun.JSONC.parse(PRODUCTION_READY) as Config, "production")
        );
        production.vars.TURNSTILE_SITE_KEY = value;
      });
      const { errors } = checkDeployConfig({
        env: "production",
        secrets: null,
        wrangler,
      });
      expect(errors).toEqual([
        expect.stringContaining("vars.TURNSTILE_SITE_KEY"),
      ]);
    }
  });

  test("only the exact D1 and KV placeholders are refused", () => {
    const withIds = (kv: string, d1: string): string =>
      wranglerWith((config) => {
        const staging = envBlock(config, "staging");
        for (const binding of staging.kv_namespaces ?? []) {
          binding.id = kv;
        }
        for (const binding of staging.d1_databases ?? []) {
          binding.database_id = d1;
        }
      });
    const refused = checkDeployConfig({
      env: "staging",
      secrets: null,
      wrangler: withIds(KV_PLACEHOLDER_ID, D1_PLACEHOLDER_ID),
    }).errors;
    expect(refused).toHaveLength(2);
    expect(refused.join("\n")).toContain("kv_namespaces");
    expect(refused.join("\n")).toContain("d1_databases");
    expect(
      checkDeployConfig({
        env: "staging",
        secrets: null,
        wrangler: withIds(
          "00000000000000000000000000000001",
          "00000000-0000-4000-8000-000000000001"
        ),
      }).errors
    ).toEqual([]);
  });

  test("a missing env block is refused", () => {
    const wrangler = wranglerWith((config) => {
      Reflect.deleteProperty(config.env, "staging");
    });
    expect(
      checkDeployConfig({ env: "staging", secrets: null, wrangler }).errors
    ).toEqual([expect.stringContaining("env.staging")]);
  });
});

describe("checkDeployConfig: SITE_URL", () => {
  const refused = [
    "",
    "not a url",
    "http://smog-site-staging.zias.workers.dev",
    "https://smog-site-staging.zias.workers.dev/",
    "https://smog-site-staging.zias.workers.dev/app",
    "https://smog-site-staging.zias.workers.dev?x=1",
    "https://smog-site-production.workers.dev",
    "https://a.b.zias.workers.dev",
    "https://localhost:5173",
    "https://smog.example.com",
    "https://smog.test",
  ];
  for (const siteUrl of refused) {
    test(`refuses ${JSON.stringify(siteUrl)}`, () => {
      const { errors } = checkDeployConfig({
        env: "staging",
        secrets: null,
        wrangler: stagingVars({ SITE_URL: siteUrl }),
      });
      expect(errors).toEqual([expect.stringContaining("SITE_URL")]);
    });
  }

  test("accepts a four-label workers.dev origin and a custom domain", () => {
    for (const siteUrl of [
      "https://smog-site-production.zias.workers.dev",
      "https://app.smog.vlaanderen",
    ]) {
      expect(
        checkDeployConfig({
          env: "staging",
          secrets: null,
          wrangler: stagingVars({ SITE_URL: siteUrl }),
        }).errors
      ).toEqual([]);
    }
  });
});

describe("checkDeployConfig: the render mode", () => {
  test("staging container adds the Mux trio", () => {
    const wrangler = stagingVars({ RENDER_MODE: "container" });
    const { errors } = checkDeployConfig({
      env: "staging",
      secrets: STAGING_SECRETS,
      wrangler,
    });
    expect(errors).toHaveLength(3);
    for (const key of MUX_TRIO) {
      expect(errors.join("\n")).toContain(key);
    }
    expect(
      checkDeployConfig({
        env: "staging",
        secrets: [...STAGING_SECRETS, ...MUX_TRIO],
        wrangler,
      }).errors
    ).toEqual([]);
  });

  test("an unset RENDER_MODE is fake (no Mux needed)", () => {
    const wrangler = wranglerWith((config) => {
      Reflect.deleteProperty(envBlock(config, "staging").vars, "RENDER_MODE");
    });
    expect(
      checkDeployConfig({
        env: "staging",
        secrets: STAGING_SECRETS,
        wrangler,
      }).errors
    ).toEqual([]);
  });

  test("local and unknown modes are refused outside dev", () => {
    for (const mode of ["local", "bogus"]) {
      expect(
        checkDeployConfig({
          env: "staging",
          secrets: null,
          wrangler: stagingVars({ RENDER_MODE: mode }),
        }).errors
      ).toEqual([expect.stringContaining("RENDER_MODE")]);
    }
  });

  test("production needs its whole list", () => {
    expect(
      checkDeployConfig({
        env: "production",
        secrets: PRODUCTION_SECRETS,
        wrangler: PRODUCTION_READY,
      }).errors
    ).toEqual([]);
    const { errors } = checkDeployConfig({
      env: "production",
      secrets: ["BETTER_AUTH_SECRET"],
      wrangler: PRODUCTION_READY,
    });
    expect(errors).toHaveLength(PRODUCTION_SECRETS.length - 1);
    expect(errors.join("\n")).toContain("wrangler secret put MOLLIE_API_KEY");
  });
});

describe("checkDeployConfig: the secrets (online)", () => {
  const check = (secrets: string[], wrangler = WRANGLER) =>
    checkDeployConfig({ env: "staging", secrets, wrangler });

  test("a missing required secret is refused with its command", () => {
    const { errors } = check(["BETTER_AUTH_SECRET"]);
    expect(errors).toEqual([
      expect.stringContaining(
        "wrangler secret put TURNSTILE_SECRET_KEY --env staging"
      ),
    ]);
  });

  test("neither provider: recommended only, never an error", () => {
    const result = check(STAGING_SECRETS);
    expect(result.errors).toEqual([]);
    expect(result.warnings).toEqual([]);
    expect(result.recommended).toEqual([
      "Google sign-in: not configured (GOOGLE_CLIENT_ID, GOOGLE_CLIENT_SECRET)",
      "Sign in with Apple: not configured (APPLE_CLIENT_ID, APPLE_CLIENT_SECRET, APPLE_APP_BUNDLE_IDENTIFIER)",
      "OpenPanel relay: not configured (OPENPANEL_CLIENT_ID, OPENPANEL_CLIENT_SECRET)",
    ]);
  });

  test("one Google key alone is an error", () => {
    const { errors, recommended } = check([
      ...STAGING_SECRETS,
      "GOOGLE_CLIENT_ID",
    ]);
    expect(errors).toEqual([
      expect.stringContaining("Google sign-in is partly configured"),
    ]);
    expect(errors[0]).toContain("GOOGLE_CLIENT_SECRET");
    expect(recommended.join("\n")).not.toContain("Google");
  });

  test("two of the three Apple keys is an error", () => {
    const { errors } = check([
      ...STAGING_SECRETS,
      "APPLE_CLIENT_ID",
      "APPLE_CLIENT_SECRET",
    ]);
    expect(errors).toEqual([
      expect.stringContaining("Sign in with Apple is partly configured"),
    ]);
    expect(errors[0]).toContain("APPLE_APP_BUNDLE_IDENTIFIER");
  });

  test("whole providers pass and leave the recommended list", () => {
    const { errors, recommended } = check([
      ...STAGING_SECRETS,
      "GOOGLE_CLIENT_ID",
      "GOOGLE_CLIENT_SECRET",
      "APPLE_CLIENT_ID",
      "APPLE_CLIENT_SECRET",
      "APPLE_APP_BUNDLE_IDENTIFIER",
      "OPENPANEL_CLIENT_ID",
      "OPENPANEL_CLIENT_SECRET",
    ]);
    expect(errors).toEqual([]);
    expect(recommended).toEqual([]);
  });

  test("half the OpenPanel pair is a warning, not an error", () => {
    const { errors, warnings } = check([
      ...STAGING_SECRETS,
      "OPENPANEL_CLIENT_ID",
    ]);
    expect(errors).toEqual([]);
    expect(warnings).toEqual([
      expect.stringContaining("OPENPANEL_CLIENT_SECRET"),
    ]);
  });

  test("the R2 tokens come together, with R2_ACCOUNT_ID and MEDIA_BUCKET", () => {
    const half = check([...STAGING_SECRETS, "R2_ACCESS_KEY_ID"]).errors;
    expect(half.join("\n")).toContain("R2_SECRET_ACCESS_KEY");
    // Staging's R2_ACCOUNT_ID is empty in the file.
    const whole = check([
      ...STAGING_SECRETS,
      "R2_ACCESS_KEY_ID",
      "R2_SECRET_ACCESS_KEY",
    ]).errors;
    expect(whole).toEqual([expect.stringContaining("vars.R2_ACCOUNT_ID")]);
    expect(
      check(
        [...STAGING_SECRETS, "R2_ACCESS_KEY_ID", "R2_SECRET_ACCESS_KEY"],
        stagingVars({ R2_ACCOUNT_ID: "0123456789abcdef0123456789abcdef" })
      ).errors
    ).toEqual([]);
  });
});

describe("parseSecretList (wrangler 4.147.0)", () => {
  test("reads the JSON array wrangler prints", () => {
    expect(parseSecretList(secretListOutput(STAGING_SECRETS))).toEqual(
      STAGING_SECRETS
    );
    expect(parseSecretList("[]")).toEqual([]);
  });

  test("skips banner lines before and notices after the array", () => {
    const stdout = [
      "",
      " ⛅️ wrangler 4.147.0",
      "───────────────────",
      "▲ [WARNING] The version of Wrangler you are using is now out-of-date.",
      secretListOutput(STAGING_SECRETS),
      '🪵  Logs were written to "~/.wrangler/logs/x.log"',
    ].join("\n");
    expect(parseSecretList(stdout)).toEqual(STAGING_SECRETS);
  });

  test("refuses output that is not the array", () => {
    for (const stdout of [
      "",
      "Secret Name: BETTER_AUTH_SECRET",
      "<html>502 Bad Gateway</html>",
      "[1, 2]",
      '[{"type": "secret_text"}]',
      "[ not json",
    ]) {
      expect(() => parseSecretList(stdout)).toThrow("secret list");
    }
  });
});

describe("explainSecretListFailure", () => {
  const failed = (stderr: string): WranglerResult => ({
    code: 1,
    stderr,
    stdout: "",
  });

  test("a Worker that does not exist yet: set its secrets first", () => {
    const message = explainSecretListFailure(
      failed(WORKER_NOT_FOUND),
      "production"
    );
    expect(message).toContain("does not exist yet");
    expect(message).toContain("wrangler secret put");
    expect(message).toContain("--env production");
    expect(message).toContain("creates the Worker");
  });

  test("an auth failure names the permission", () => {
    const message = explainSecretListFailure(failed(AUTH_FAILURE), "staging");
    expect(message).toContain("Workers Scripts: Read");
    expect(message).toContain("CLOUDFLARE_ACCOUNT_ID");
  });

  test("no token at all names CLOUDFLARE_API_TOKEN", () => {
    expect(explainSecretListFailure(failed(NO_TOKEN), "staging")).toContain(
      "CLOUDFLARE_API_TOKEN is not set"
    );
  });

  test("anything else keeps the exit code and wrangler's last line", () => {
    const message = explainSecretListFailure(
      { code: 7, stderr: "first\nsomething odd happened\n\n", stdout: "" },
      "staging"
    );
    expect(message).toContain("exit 7");
    expect(message).toContain("something odd happened");
  });
});

function recorder() {
  const lines: string[] = [];
  return {
    lines,
    log: {
      error: (line: string) => lines.push(`error: ${line}`),
      log: (line: string) => lines.push(line),
    },
    output: () => lines.join("\n"),
  };
}

function answering(result: WranglerResult) {
  const calls: string[][] = [];
  const run: CommandRunner = (args) => {
    calls.push(args);
    return Promise.resolve(result);
  };
  return { calls, run };
}

const throwing: CommandRunner = () =>
  Promise.reject(new Error("spawn bunx ENOENT"));

const FAILURES: [string, CommandRunner][] = [
  ["a runner that throws", throwing],
  [
    "wrangler exiting 1",
    answering({ code: 1, stderr: AUTH_FAILURE, stdout: "" }).run,
  ],
  [
    "output that is not JSON",
    answering({ code: 0, stderr: "", stdout: "<html>proxy error</html>" }).run,
  ],
  [
    "a missing Worker",
    answering({ code: 1, stderr: WORKER_NOT_FOUND, stdout: "" }).run,
  ],
];

describe("runCheck", () => {
  const read = () => Promise.resolve(WRANGLER);

  test("staging --offline passes without calling wrangler", async () => {
    const { calls, run } = answering({ code: 1, stderr: "", stdout: "" });
    const out = recorder();
    expect(
      await runCheck(["--env", "staging", "--offline"], run, out.log, read)
    ).toBe(0);
    expect(calls).toEqual([]);
    expect(out.output()).toContain("secrets not checked (--offline)");
  });

  test("production --offline fails on the pre-launch placeholders", async () => {
    const out = recorder();
    expect(
      await runCheck(
        ["--env", "production", "--offline"],
        throwing,
        out.log,
        read
      )
    ).toBe(1);
    expect(out.output()).toContain("error: [deploy-config]");
    expect(out.output()).not.toContain("::warning::");
  });

  test("staging online lists the secrets with wrangler's JSON format", async () => {
    const { calls, run } = answering({
      code: 0,
      stderr: "",
      stdout: secretListOutput(STAGING_SECRETS),
    });
    const out = recorder();
    expect(await runCheck(["--env", "staging"], run, out.log, read)).toBe(0);
    expect(calls).toEqual([
      ["secret", "list", "--env", "staging", "--format", "json"],
    ]);
    expect(out.output()).toContain("recommended, not configured: Google");
  });

  test("production --warn-only is refused, whatever else is passed", async () => {
    const runs = [
      ["--env", "production", "--warn-only"],
      ["--warn-only", "--offline", "--env", "production"],
      ["--env=production", "--warn-only"],
    ].map(async (argv) => {
      const { calls, run } = answering({ code: 0, stderr: "", stdout: "[]" });
      const out = recorder();
      const code = await runCheck(argv, run, out.log, read);
      return { calls, code, output: out.output() };
    });
    for (const { calls, code, output } of await Promise.all(runs)) {
      expect(code).toBe(1);
      expect(calls).toEqual([]);
      expect(output).toContain("--warn-only is refused for production");
      expect(output).not.toContain("::warning::");
    }
  });

  for (const [name, run] of FAILURES) {
    test(`--warn-only turns ${name} into a ::warning:: and exits 0`, async () => {
      const out = recorder();
      expect(
        await runCheck(["--env", "staging", "--warn-only"], run, out.log, read)
      ).toBe(0);
      expect(out.output()).toContain("::warning::[deploy-config]");
      expect(out.output()).not.toContain("error:");
    });

    test(`without --warn-only, ${name} fails`, async () => {
      const out = recorder();
      expect(await runCheck(["--env", "staging"], run, out.log, read)).toBe(1);
      expect(out.output()).toContain("error: [deploy-config]");
    });
  }

  test("--warn-only also catches a config that cannot be read", async () => {
    const out = recorder();
    const broken = () => Promise.reject(new Error("ENOENT wrangler.jsonc"));
    expect(
      await runCheck(
        ["--env", "staging", "--warn-only"],
        throwing,
        out.log,
        broken
      )
    ).toBe(0);
    expect(out.output()).toContain("::warning::");
    expect(out.output()).toContain("ENOENT wrangler.jsonc");
  });

  test("--warn-only also catches unparsable JSONC", async () => {
    const out = recorder();
    expect(
      await runCheck(
        ["--env", "staging", "--warn-only", "--offline"],
        throwing,
        out.log,
        () => Promise.resolve("{ not jsonc")
      )
    ).toBe(0);
    expect(out.output()).toContain("::warning::");
  });

  test("--warn-only also catches config errors and a logger that throws", async () => {
    const out = recorder();
    const wrangler = stagingVars({ SITE_URL: "http://x" });
    expect(
      await runCheck(
        ["--env", "staging", "--warn-only", "--offline"],
        throwing,
        out.log,
        () => Promise.resolve(wrangler)
      )
    ).toBe(0);
    expect(out.output()).toContain("::warning::[deploy-config]");

    let calls = 0;
    const flaky = {
      error: () => undefined,
      log: (_line: string) => {
        calls += 1;
        if (calls === 1) {
          throw new Error("EPIPE");
        }
      },
    };
    expect(
      await runCheck(
        ["--env", "staging", "--warn-only", "--offline"],
        throwing,
        flaky,
        read
      )
    ).toBe(0);
  });

  test("refuses bad arguments, but only warns about them under --warn-only", async () => {
    const codes = await Promise.all(
      [[], ["--env", "dev"], ["--env", "staging", "--offine"]].map((argv) =>
        runCheck(argv, throwing, recorder().log, read)
      )
    );
    expect(codes).toEqual([1, 1, 1]);
    const out = recorder();
    expect(
      await runCheck(
        ["--env", "staging", "--offine", "--warn-only"],
        throwing,
        out.log,
        read
      )
    ).toBe(0);
    expect(out.output()).toContain("::warning::");
  });
});

/**
 * The `Check deploy config` step of `deploy.yml`, run as GitHub runs it
 * (`bash -eo pipefail`), with a fake `bunx` first on PATH that plays
 * wrangler: whatever wrangler does, staging stays green unless the owner
 * set SMOG_REQUIRE_SECRETS=1, and production never passes --warn-only.
 */
describe("deploy.yml's Check deploy config step", () => {
  const workflow = Bun.YAML.parse(
    readFileSync(join(ROOT, ".github", "workflows", "deploy.yml"), "utf8")
  ) as {
    jobs: { deploy: { steps: { name?: string; run?: string }[] } };
  };
  const step = workflow.jobs.deploy.steps.find(
    (candidate) => candidate.name === "Check deploy config"
  );
  const script = step?.run ?? "";

  const FAKES = {
    auth: `cat >&2 <<'EOF'\n${AUTH_FAILURE}\nEOF\nexit 1`,
    killed: "kill -9 $$",
    "not found": `cat >&2 <<'EOF'\n${WORKER_NOT_FOUND}\nEOF\nexit 1`,
    "not JSON": "echo '<html>502 Bad Gateway</html>'\nexit 0",
  };

  function fakeBunx(body: string): string {
    const dir = mkdtempSync(join(tmpdir(), "smog-fake-wrangler-"));
    const path = join(dir, "bunx");
    writeFileSync(path, `#!/bin/sh\n${body}\n`);
    chmodSync(path, 0o755);
    return dir;
  }

  function runStep(
    env: "staging" | "production",
    body: string,
    requireSecrets?: string
  ) {
    const fake = fakeBunx(body);
    const result = Bun.spawnSync(
      ["bash", "--noprofile", "--norc", "-eo", "pipefail", "-c", script],
      {
        cwd: ROOT,
        env: {
          ...process.env,
          CLOUDFLARE_ENV: env,
          PATH: `${fake}:${process.env.PATH ?? ""}`,
          SMOG_REQUIRE_SECRETS: requireSecrets ?? "",
        },
        stderr: "pipe",
        stdout: "pipe",
      }
    );
    return {
      code: result.exitCode,
      output: `${result.stdout.toString()}${result.stderr.toString()}`,
    };
  }

  test("exists", () => {
    expect(script).toContain("scripts/check-deploy-config.ts");
  });

  for (const [name, body] of Object.entries(FAKES)) {
    test(`staging warns and stays green when wrangler gives ${name}`, () => {
      const { code, output } = runStep("staging", body);
      expect(code).toBe(0);
      expect(output).toContain("::warning::");
    });
  }

  test("staging with SMOG_REQUIRE_SECRETS=1 enforces", () => {
    const { code, output } = runStep("staging", FAKES.auth, "1");
    expect(code).not.toBe(0);
    expect(output).toContain("Workers Scripts: Read");
    expect(output).not.toContain("::warning::[deploy-config]");
  });

  test("staging passes when wrangler lists the secrets", () => {
    const body = `cat <<'EOF'\n${secretListOutput(STAGING_SECRETS)}\nEOF`;
    const { code, output } = runStep("staging", body, "1");
    expect(code).toBe(0);
    expect(output).toContain("[deploy-config] staging: ok");
  });

  test("production enforces and is never passed --warn-only", () => {
    for (const requireSecrets of [undefined, "0", "1"]) {
      const { code, output } = runStep(
        "production",
        FAKES["not found"],
        requireSecrets
      );
      expect(code).toBe(1);
      expect(output).toContain("does not exist yet");
      expect(output).not.toContain("--warn-only is refused");
      expect(output).not.toContain("::warning::[deploy-config]");
    }
  });
});
