import { describe, expect, test } from "bun:test";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import {
  corsRules,
  type DeployEnv,
  type EnsureMode,
  ensureResources,
  isPlaceholderOrigin,
  parseEnsureArgs,
  planResources,
  type ResourcePlan,
  type WranglerRunner,
} from "./ensure-cloudflare-resources";

const ROOT = join(import.meta.dir, "..");
const WRANGLER = readFileSync(
  join(ROOT, "apps", "site", "wrangler.jsonc"),
  "utf8"
);
const STAGING_ORIGIN = "https://smog-site-staging.zias.workers.dev";
const LAUNCH_ORIGIN = "https://smog.example";

interface FakeAccount {
  buckets: Set<string>;
  cors: Map<string, string>;
  queues: Set<string>;
}

interface FakeOptions {
  /** Overrides the answer to one command (its args joined with spaces). */
  answers?: Record<string, { code: number; stderr?: string; stdout?: string }>;
  /** Every call fails with this output. */
  lookupError?: string;
}

/** `wrangler r2 bucket cors list` output of one rule (`formatLabelledValues`). */
function corsTable(origins: string, methods: string, headers = "content-type") {
  return [
    `allowed_origins:  ${origins}`,
    `allowed_methods:  ${methods}`,
    `allowed_headers:  ${headers}`,
    "exposed_headers:  (no exposed headers)",
    "max_age_seconds:  3600",
  ].join("\n");
}

/**
 * A fake `wrangler` that answers like the real one (wrangler 4.143's
 * source): `queues info` prints `Queue Name: …` or fails with
 * `Queue "…" does not exist`; `r2 bucket list` prints `name:` /
 * `creation_date:` blocks; `r2 bucket cors list` prints the rules or says
 * there are none; `r2 bucket create` of a taken name fails with 10004.
 * Every call is recorded, with the CORS file's content.
 */
function fakeWrangler(state: FakeAccount, options: FakeOptions = {}) {
  const calls: string[][] = [];
  const corsFiles: unknown[] = [];
  const ok = (stdout: string) =>
    Promise.resolve({ code: 0, stderr: "", stdout });
  const fail = (stderr: string) =>
    Promise.resolve({ code: 1, stderr, stdout: "" });
  const run: WranglerRunner = (args) => {
    calls.push(args);
    const answer = options.answers?.[args.join(" ")];
    if (answer) {
      return Promise.resolve({
        code: answer.code,
        stderr: answer.stderr ?? "",
        stdout: answer.stdout ?? "",
      });
    }
    if (options.lookupError) {
      return fail(options.lookupError);
    }
    const [a, b, c, d] = args;
    if (a === "queues" && b === "info" && c) {
      return state.queues.has(c)
        ? ok(`Queue Name: ${c}\nQueue ID: 123\nNumber of Producers: 0`)
        : fail(
            `✘ [ERROR] Queue "${c}" does not exist. To create it, run: wrangler queues create ${c}`
          );
    }
    if (a === "queues" && b === "create" && c) {
      state.queues.add(c);
      return ok(`🌀 Creating queue '${c}'\n✅ Created queue '${c}'.`);
    }
    if (a === "r2" && b === "bucket" && c === "list") {
      const blocks = [...state.buckets].map(
        (name) =>
          `name:           ${name}\ncreation_date:  2026-10-02T00:00:00.000Z`
      );
      return ok(`Listing buckets...\n${blocks.join("\n\n")}`);
    }
    if (a === "r2" && b === "bucket" && c === "create" && d) {
      if (state.buckets.has(d)) {
        return fail(
          "✘ [ERROR] A request to the Cloudflare API failed.\n  The bucket you tried to create already exists, and you own it. [code: 10004]"
        );
      }
      state.buckets.add(d);
      return ok(
        `Created bucket '${d}' with default storage class of Standard.`
      );
    }
    if (a === "r2" && b === "bucket" && c === "cors" && d === "list") {
      const bucket = args[4] ?? "";
      const rules = state.cors.get(bucket);
      return rules
        ? ok(`Listing CORS rules for bucket '${bucket}'...\n${rules}`)
        : ok(
            `Listing CORS rules for bucket '${bucket}'...\nThere is no CORS configuration defined for bucket '${bucket}'.`
          );
    }
    if (a === "r2" && b === "bucket" && c === "cors" && d === "set") {
      const bucket = args[4] ?? "";
      const file = args[args.indexOf("--file") + 1] ?? "";
      const content = JSON.parse(readFileSync(file, "utf8"));
      corsFiles.push(content);
      const { allowed } = content.rules[0];
      state.cors.set(
        bucket,
        corsTable(
          allowed.origins.join(", "),
          allowed.methods.join(", "),
          allowed.headers.join(", ")
        )
      );
      return ok(`Set CORS configuration for bucket '${bucket}'.`);
    }
    return fail(`unexpected command: ${args.join(" ")}`);
  };
  return { calls, corsFiles, run };
}

function account(partial: Partial<FakeAccount> = {}): FakeAccount {
  return {
    buckets: partial.buckets ?? new Set(),
    cors: partial.cors ?? new Map(),
    queues: partial.queues ?? new Set(),
  };
}

/** Wrangler verbs that change or remove what exists. */
const MODIFYING = /\b(delete|update|remove|purge|pause|resume)\b/;

const STAGING_QUEUES = [
  "smog-staging-email",
  "smog-staging-email-dlq",
  "smog-staging-sponsorship-events",
  "smog-staging-sponsorship-events-dlq",
];

const silent = { log: () => undefined, warn: () => undefined };

/** The production plan with a launch origin instead of the placeholder. */
function productionPlan(): ResourcePlan {
  const plan = planResources(WRANGLER, "production");
  return {
    ...plan,
    buckets: plan.buckets.map((bucket) => ({
      ...bucket,
      corsOrigin: LAUNCH_ORIGIN,
    })),
  };
}

async function ensure(
  mode: EnsureMode,
  state: FakeAccount,
  env: DeployEnv = "staging",
  options: FakeOptions & { plan?: ResourcePlan } = {}
) {
  const fake = fakeWrangler(state, options);
  const lines: string[] = [];
  const result = await ensureResources({
    env,
    log: {
      log: (line) => lines.push(line),
      warn: (line) => lines.push(`warn: ${line}`),
    },
    mode,
    plan:
      options.plan ??
      (env === "production" ? productionPlan() : planResources(WRANGLER, env)),
    run: fake.run,
  });
  return { ...fake, lines, output: lines.join("\n"), result };
}

async function failure(promise: Promise<unknown>): Promise<string> {
  try {
    await promise;
  } catch (error) {
    return error instanceof Error ? error.message : String(error);
  }
  throw new Error("expected a failure");
}

describe("isPlaceholderOrigin (phase 8 ruling 2)", () => {
  test("a workers.dev host needs <script>.<subdomain>.workers.dev", () => {
    expect(
      isPlaceholderOrigin("https://smog-site-production.workers.dev")
    ).toBe(true);
    expect(isPlaceholderOrigin("https://workers.dev")).toBe(true);
    expect(isPlaceholderOrigin("https://a.b.c.workers.dev")).toBe(true);
    expect(isPlaceholderOrigin(STAGING_ORIGIN)).toBe(false);
    expect(
      isPlaceholderOrigin("https://smog-site-production.zias.workers.dev")
    ).toBe(false);
    expect(isPlaceholderOrigin("https://SMOG.ZIAS.WORKERS.DEV.")).toBe(false);
  });

  test("any other host is not a placeholder", () => {
    expect(isPlaceholderOrigin("https://app.smog.vlaanderen")).toBe(false);
    expect(isPlaceholderOrigin(LAUNCH_ORIGIN)).toBe(false);
    expect(isPlaceholderOrigin("https://notworkers.dev")).toBe(false);
  });

  test("an unparsable origin is a placeholder", () => {
    expect(isPlaceholderOrigin("")).toBe(true);
    expect(isPlaceholderOrigin("not a url")).toBe(true);
  });
});

describe("planResources", () => {
  test("reads the queues, DLQs and bucket of an env from wrangler.jsonc", () => {
    expect(planResources(WRANGLER, "staging")).toEqual({
      buckets: [{ corsOrigin: STAGING_ORIGIN, name: "smog-staging-media" }],
      queues: STAGING_QUEUES,
    });
    expect(planResources(WRANGLER, "production").queues).toEqual(
      STAGING_QUEUES.map((name) => name.replace("staging", "production"))
    );
  });

  test("refuses a bucket without a SITE_URL to take the CORS origin from (M4)", () => {
    const config = Bun.JSONC.parse(WRANGLER) as {
      env: { staging: { vars: Record<string, unknown> } };
    };
    config.env.staging.vars.SITE_URL = "";
    expect(() => planResources(JSON.stringify(config), "staging")).toThrow(
      "SITE_URL"
    );
  });

  test("allows PUT with content-type from the site's origin only", () => {
    expect(corsRules(LAUNCH_ORIGIN)).toEqual({
      rules: [
        {
          allowed: {
            headers: ["content-type"],
            methods: ["PUT"],
            origins: [LAUNCH_ORIGIN],
          },
          maxAgeSeconds: 3600,
        },
      ],
    });
  });
});

describe("ensureResources --create", () => {
  test("creates everything on an empty account, with the bucket's CORS", async () => {
    const state = account();
    const { calls, corsFiles, result } = await ensure("create", state);

    expect(result).toEqual({
      created: [
        ...STAGING_QUEUES,
        "smog-staging-media",
        "cors:smog-staging-media",
      ],
      missing: [],
      ok: true,
    });
    expect([...state.queues].sort()).toEqual(STAGING_QUEUES);
    expect([...state.buckets]).toEqual(["smog-staging-media"]);
    expect(corsFiles).toEqual([corsRules(STAGING_ORIGIN)]);
    expect(calls.filter((call) => call.includes("create")).length).toBe(5);
  });

  test("never runs `r2 bucket info` (it also queries analytics, M3)", async () => {
    const state = account();
    await ensure("create", state);
    const { calls } = await ensure("create", state);
    expect(
      calls.some((call) => call.includes("info") && call[0] === "r2")
    ).toBe(false);
  });

  test("creates only what is missing and changes nothing that exists", async () => {
    const state = account({
      buckets: new Set(["smog-staging-media"]),
      cors: new Map([["smog-staging-media", corsTable(STAGING_ORIGIN, "PUT")]]),
      queues: new Set(["smog-staging-email", "smog-staging-email-dlq"]),
    });
    const { calls, result } = await ensure("create", state);

    expect(result).toEqual({
      created: [
        "smog-staging-sponsorship-events",
        "smog-staging-sponsorship-events-dlq",
      ],
      missing: [],
      ok: true,
    });
    expect(calls.some((call) => call.includes("set"))).toBe(false);
  });

  test("sets CORS on an existing bucket that has none, also when wrangler answers 10059", async () => {
    const state = account({
      buckets: new Set(["smog-staging-media"]),
      queues: new Set(STAGING_QUEUES),
    });
    expect((await ensure("create", state)).result.created).toEqual([
      "cors:smog-staging-media",
    ]);

    const again = account({
      buckets: new Set(["smog-staging-media"]),
      queues: new Set(STAGING_QUEUES),
    });
    const { result } = await ensure("create", again, "staging", {
      answers: {
        "r2 bucket cors list smog-staging-media": {
          code: 1,
          stderr:
            "✘ [ERROR] A request to the Cloudflare API failed.\n  The CORS configuration does not exist. [code: 10059]",
        },
      },
    });
    expect(result.created).toEqual(["cors:smog-staging-media"]);
  });

  test("a CORS that does not allow the PUT from SITE_URL fails, prints the fix and is never overwritten (I2)", async () => {
    const stale = corsTable("https://old.example", "PUT");
    const state = account({
      buckets: new Set(["smog-staging-media"]),
      cors: new Map([["smog-staging-media", stale]]),
    });
    const { calls, output, result } = await ensure("create", state);

    expect(result.ok).toBe(false);
    expect(result.created).toEqual(STAGING_QUEUES);
    expect(result.missing).toEqual(["cors-mismatch:smog-staging-media"]);
    expect(calls.some((call) => call.includes("set"))).toBe(false);
    expect(state.cors.get("smog-staging-media")).toBe(stale);
    expect(output).toContain(
      "bunx wrangler r2 bucket cors set smog-staging-media --file cors.json --force"
    );
    expect(output).toContain(STAGING_ORIGIN);
  });

  test("reads the CORS table exactly: the right origin with GET only, or a missing header, is a mismatch", async () => {
    for (const rules of [
      corsTable(STAGING_ORIGIN, "GET"),
      corsTable(STAGING_ORIGIN, "PUT", "(no headers)"),
      corsTable(`${STAGING_ORIGIN}.evil.example`, "PUT"),
    ]) {
      const state = account({
        buckets: new Set(["smog-staging-media"]),
        cors: new Map([["smog-staging-media", rules]]),
        queues: new Set(STAGING_QUEUES),
      });
      // biome-ignore lint/performance/noAwaitInLoops: one fake account at a time.
      const { result } = await ensure("check", state);
      expect(result.missing, rules).toEqual([
        "cors-mismatch:smog-staging-media",
      ]);
    }
  });

  test("a bucket the list missed but that exists (10004 on create) is treated as existing", async () => {
    const state = account({ queues: new Set(STAGING_QUEUES) });
    state.buckets.add("smog-staging-media");
    const { result } = await ensure("create", state, "staging", {
      answers: {
        "r2 bucket list": { code: 0, stdout: "Listing buckets...\n" },
      },
    });
    expect(result).toEqual({
      created: ["cors:smog-staging-media"],
      missing: [],
      ok: true,
    });
  });

  test("matches bucket names exactly in `r2 bucket list`", async () => {
    const state = account({
      buckets: new Set(["smog-staging-media-old"]),
      queues: new Set(STAGING_QUEUES),
    });
    const { result } = await ensure("check", state);
    expect(result.missing).toEqual([
      "smog-staging-media",
      "cors:smog-staging-media",
    ]);
  });

  test("is a no-op the second time", async () => {
    const state = account();
    await ensure("create", state);
    const { calls, result } = await ensure("create", state);
    expect(result).toEqual({ created: [], missing: [], ok: true });
    expect(
      calls.every((call) =>
        ["info", "list"].some((verb) => call.includes(verb))
      )
    ).toBe(true);
  });

  test("never runs a delete, update or other modifying command", async () => {
    const { calls } = await ensure("create", account());
    for (const call of calls) {
      const verbs = call.filter((arg) => !arg.startsWith("-")).slice(0, 4);
      expect(verbs.join(" ")).not.toMatch(MODIFYING);
    }
  });

  test("refuses a workers.dev origin without the account subdomain (the four-label rule)", async () => {
    const placeholder = "https://smog-site-production.workers.dev";
    const messages = await Promise.all(
      (["staging", "production"] as const).map((env) => {
        const plan = planResources(WRANGLER, env);
        return failure(
          ensure("create", account(), env, {
            plan: {
              ...plan,
              buckets: plan.buckets.map((bucket) => ({
                ...bucket,
                corsOrigin: placeholder,
              })),
            },
          })
        );
      })
    );
    for (const message of messages) {
      expect(message).toContain("[provision]");
      expect(message).toContain("placeholder");
      expect(message).toContain("<script>.<subdomain>.workers.dev");
    }
  });

  test("staging's own host still passes --create", async () => {
    expect(planResources(WRANGLER, "staging").buckets[0]?.corsOrigin).toBe(
      STAGING_ORIGIN
    );
    const { result } = await ensure("create", account(), "staging");
    expect(result.ok).toBe(true);
  });

  test("production's workers.dev origin in wrangler.jsonc is not a placeholder", async () => {
    const plan = planResources(WRANGLER, "production");
    expect(plan.buckets[0]?.corsOrigin).toBe(
      "https://smog-site-production.zias.workers.dev"
    );
    const { result } = await ensure("create", account(), "production", {
      plan,
    });
    expect(result.ok).toBe(true);
  });
});

describe("the queue lookup (M1, M2)", () => {
  test("needs the exact `Queue Name:` line", async () => {
    const message = await failure(
      ensure("check", account(), "staging", {
        answers: {
          "queues info smog-staging-email": {
            code: 0,
            stdout: "Queue Name: smog-staging-email-dlq\nQueue ID: 1",
          },
        },
      })
    );
    expect(message).toContain("Failed to look up the queue smog-staging-email");
  });

  test("an answer without the name is not a lookup", async () => {
    const message = await failure(
      ensure("check", account(), "staging", {
        answers: { "queues info smog-staging-email": { code: 0, stdout: "" } },
      })
    );
    expect(message).toContain("smog-staging-email");
  });

  test('only `Queue "<name>" does not exist` means missing', async () => {
    const message = await failure(
      ensure("check", account(), "staging", {
        answers: {
          "queues info smog-staging-email": {
            code: 1,
            stderr: "✘ [ERROR] The account does not exist [code: 7003]",
          },
        },
      })
    );
    expect(message).toContain("code: 7003");
  });
});

describe("the prerequisites hints (I1)", () => {
  test("an authentication error names the token permissions", async () => {
    const fake = fakeWrangler(account(), {
      lookupError: "✘ [ERROR] Authentication error [code: 10000]",
    });
    const message = await failure(
      ensureResources({
        env: "staging",
        log: silent,
        mode: "create",
        plan: planResources(WRANGLER, "staging"),
        run: fake.run,
      })
    );
    expect(message).toContain("[provision]");
    expect(message).toContain("Workers R2 Storage: Edit");
    expect(message).toContain("Workers Scripts: Edit");
    expect(fake.calls.some((call) => call.includes("create"))).toBe(false);
  });

  test("R2 not enabled (10042) says to enable R2", async () => {
    const message = await failure(
      ensure("create", account(), "staging", {
        answers: {
          "r2 bucket list": {
            code: 1,
            stderr:
              "✘ [ERROR] A request to the Cloudflare API failed.\n  Please enable R2 through the Cloudflare Dashboard. [code: 10042]",
          },
        },
      })
    );
    expect(message).toContain("[provision] R2 is not enabled");
  });

  test("a 403 or a missing paid plan is explained too", async () => {
    const forbidden = await failure(
      ensure("create", account(), "staging", {
        answers: {
          "queues create smog-staging-email": {
            code: 1,
            stderr: "✘ [ERROR] A request to the Cloudflare API failed. (403)",
          },
        },
      })
    );
    expect(forbidden).toContain("Workers Scripts: Edit");
    const paid = await failure(
      ensure("create", account(), "staging", {
        answers: {
          "queues create smog-staging-email": {
            code: 1,
            stderr:
              "✘ [ERROR] Queues are only available on the Workers Paid plan. [code: 100129]",
          },
        },
      })
    );
    expect(paid).toContain("Workers Paid");
  });
});

describe("ensureResources --check", () => {
  test("fails with the exact wrangler commands for what is missing, and creates nothing", async () => {
    const state = account({ queues: new Set(["smog-production-email"]) });
    const { calls, output, result } = await ensure(
      "check",
      state,
      "production"
    );

    expect(result.ok).toBe(false);
    expect(result.created).toEqual([]);
    expect(result.missing).toEqual([
      "smog-production-email-dlq",
      "smog-production-sponsorship-events",
      "smog-production-sponsorship-events-dlq",
      "smog-production-media",
      "cors:smog-production-media",
    ]);
    expect(output).toContain(
      "bunx wrangler queues create smog-production-email-dlq"
    );
    expect(output).toContain(
      "bunx wrangler r2 bucket create smog-production-media --no-update-config"
    );
    expect(output).toContain(
      "bunx wrangler r2 bucket cors set smog-production-media --file"
    );
    expect(
      calls.some((call) => call.includes("create") || call.includes("set"))
    ).toBe(false);
  });

  test("fails on a production CORS that does not match SITE_URL (I2)", async () => {
    const state = account();
    await ensure("create", state, "production");
    const { output, result } = await ensure("check", state, "production", {
      plan: {
        ...productionPlan(),
        buckets: [
          {
            corsOrigin: "https://smog.vlaanderen",
            name: "smog-production-media",
          },
        ],
      },
    });
    expect(result).toEqual({
      created: [],
      missing: ["cors-mismatch:smog-production-media"],
      ok: false,
    });
    expect(output).toContain("https://smog.vlaanderen");
  });

  test("passes when everything exists", async () => {
    const state = account();
    await ensure("create", state, "production");
    const { result } = await ensure("check", state, "production");
    expect(result).toEqual({ created: [], missing: [], ok: true });
  });
});

describe("ensureResources --dry-run", () => {
  test("prints the plan and never calls wrangler", async () => {
    const { calls, output, result } = await ensure("dry-run", account());
    expect(calls).toEqual([]);
    expect(result.ok).toBe(true);
    expect(output).toContain("bunx wrangler queues info smog-staging-email");
    expect(output).toContain(
      "bunx wrangler r2 bucket cors set smog-staging-media"
    );
  });
});

describe("parseEnsureArgs", () => {
  test("takes an env and one mode", () => {
    expect(parseEnsureArgs(["--env", "staging", "--create"], {})).toEqual({
      env: "staging",
      mode: "create",
    });
    expect(parseEnsureArgs(["--env", "production", "--check"], {})).toEqual({
      env: "production",
      mode: "check",
    });
    expect(parseEnsureArgs(["--env", "staging", "--dry-run"], {}).mode).toBe(
      "dry-run"
    );
  });

  test("refuses dev, a missing mode or two modes", () => {
    expect(() => parseEnsureArgs(["--env", "dev", "--create"], {})).toThrow(
      "--env"
    );
    expect(() => parseEnsureArgs(["--env", "staging"], {})).toThrow("mode");
    expect(() =>
      parseEnsureArgs(["--env", "staging", "--create", "--check"], {})
    ).toThrow("mode");
  });

  test("creates in production only with SMOG_PROVISION_PRODUCTION=1", () => {
    expect(() =>
      parseEnsureArgs(["--env", "production", "--create"], {})
    ).toThrow("SMOG_PROVISION_PRODUCTION");
    expect(
      parseEnsureArgs(["--env", "production", "--create"], {
        SMOG_PROVISION_PRODUCTION: "1",
      }).mode
    ).toBe("create");
  });
});
