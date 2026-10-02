import { describe, expect, test } from "bun:test";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import {
  corsRules,
  type DeployEnv,
  type EnsureMode,
  ensureResources,
  parseEnsureArgs,
  planResources,
  type WranglerRunner,
} from "./ensure-cloudflare-resources";

const ROOT = join(import.meta.dir, "..");
const WRANGLER = readFileSync(
  join(ROOT, "apps", "site", "wrangler.jsonc"),
  "utf8"
);

interface FakeAccount {
  buckets: Set<string>;
  cors: Map<string, string>;
  queues: Set<string>;
}

/**
 * A fake `wrangler` that answers like the real one (wrangler 4.143's
 * output): `queues info` prints `Queue Name: …` or fails with
 * `Queue "…" does not exist`, `r2 bucket info --json` prints JSON or fails
 * with code 10006, `r2 bucket cors list` prints the rules or says there are
 * none. Every call is recorded, with the CORS file's content.
 */
function fakeWrangler(
  state: FakeAccount,
  options: { lookupError?: string } = {}
) {
  const calls: string[][] = [];
  const corsFiles: unknown[] = [];
  const run: WranglerRunner = (args) => {
    calls.push(args);
    const ok = (stdout: string) =>
      Promise.resolve({ code: 0, stderr: "", stdout });
    const fail = (stderr: string) =>
      Promise.resolve({ code: 1, stderr, stdout: "" });
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
      return ok(`Creating queue '${c}'\nCreated queue '${c}'.`);
    }
    if (a === "r2" && b === "bucket" && c === "info" && d) {
      return state.buckets.has(d)
        ? ok(JSON.stringify({ name: d }))
        : fail(
            "✘ [ERROR] A request to the Cloudflare API failed.\n  The specified bucket does not exist. [code: 10006]"
          );
    }
    if (a === "r2" && b === "bucket" && c === "create" && d) {
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
      state.cors.set(
        bucket,
        `allowed_origins: ${content.rules[0].allowed.origins.join(", ")}\nallowed_methods: PUT`
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

async function ensure(
  mode: EnsureMode,
  state: FakeAccount,
  env: DeployEnv = "staging"
) {
  const fake = fakeWrangler(state);
  const lines: string[] = [];
  const result = await ensureResources({
    env,
    log: {
      log: (line) => lines.push(line),
      warn: (line) => lines.push(`warn: ${line}`),
    },
    mode,
    plan: planResources(WRANGLER, env),
    run: fake.run,
  });
  return { ...fake, lines, result };
}

describe("planResources", () => {
  test("reads the queues, DLQs and bucket of an env from wrangler.jsonc", () => {
    expect(planResources(WRANGLER, "staging")).toEqual({
      buckets: [
        {
          corsOrigin: "https://smog-site-staging.zias.workers.dev",
          name: "smog-staging-media",
        },
      ],
      queues: STAGING_QUEUES,
    });
    expect(planResources(WRANGLER, "production").queues).toEqual(
      STAGING_QUEUES.map((name) => name.replace("staging", "production"))
    );
  });

  test("allows PUT with content-type from the site's origin only", () => {
    expect(corsRules("https://smog.example")).toEqual({
      rules: [
        {
          allowed: {
            headers: ["content-type"],
            methods: ["PUT"],
            origins: ["https://smog.example"],
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
    expect(corsFiles).toEqual([
      corsRules("https://smog-site-staging.zias.workers.dev"),
    ]);
    expect(calls.filter((call) => call.includes("create")).length).toBe(5);
  });

  test("creates only what is missing and changes nothing that exists", async () => {
    const state = account({
      buckets: new Set(["smog-staging-media"]),
      cors: new Map([
        [
          "smog-staging-media",
          "allowed_origins: https://other.example\nallowed_methods: GET",
        ],
      ]),
      queues: new Set(["smog-staging-email", "smog-staging-email-dlq"]),
    });
    const { calls, lines, result } = await ensure("create", state);

    expect(result.created).toEqual([
      "smog-staging-sponsorship-events",
      "smog-staging-sponsorship-events-dlq",
    ]);
    // The existing CORS differs: reported, never overwritten.
    expect(calls.some((call) => call.includes("set"))).toBe(false);
    expect(lines.join("\n")).toContain(
      "warn: smog-staging-media already has a CORS configuration"
    );
    expect(state.cors.get("smog-staging-media")).toContain("other.example");
  });

  test("sets CORS on an existing bucket that has none", async () => {
    const state = account({
      buckets: new Set(["smog-staging-media"]),
      queues: new Set(STAGING_QUEUES),
    });
    const { result } = await ensure("create", state);
    expect(result.created).toEqual(["cors:smog-staging-media"]);
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

  test("stops on a lookup it cannot read, before creating anything", async () => {
    const fake = fakeWrangler(account(), {
      lookupError: "✘ [ERROR] Authentication error [code: 10000]",
    });
    await expect(
      ensureResources({
        env: "staging",
        log: silent,
        mode: "create",
        plan: planResources(WRANGLER, "staging"),
        run: fake.run,
      })
    ).rejects.toThrow("Authentication error");
    expect(fake.calls.some((call) => call.includes("create"))).toBe(false);
  });
});

describe("ensureResources --check", () => {
  test("fails with the exact wrangler commands for what is missing, and creates nothing", async () => {
    const state = account({ queues: new Set(["smog-production-email"]) });
    const { calls, lines, result } = await ensure("check", state, "production");

    expect(result.ok).toBe(false);
    expect(result.created).toEqual([]);
    expect(result.missing).toEqual([
      "smog-production-email-dlq",
      "smog-production-sponsorship-events",
      "smog-production-sponsorship-events-dlq",
      "smog-production-media",
      "cors:smog-production-media",
    ]);
    const output = lines.join("\n");
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

  test("passes when everything exists", async () => {
    const state = account();
    await ensure("create", state, "production");
    const { result } = await ensure("check", state, "production");
    expect(result).toEqual({ created: [], missing: [], ok: true });
  });
});

describe("ensureResources --dry-run", () => {
  test("prints the plan and never calls wrangler", async () => {
    const { calls, lines, result } = await ensure("dry-run", account());
    expect(calls).toEqual([]);
    expect(result.ok).toBe(true);
    expect(lines.join("\n")).toContain(
      "bunx wrangler queues info smog-staging-email"
    );
    expect(lines.join("\n")).toContain(
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
