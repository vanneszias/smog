import { describe, expect, test } from "bun:test";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import {
  type Api,
  type ApiResponse,
  assertPrepared,
  ensureStores,
  existingSecrets,
  inventory,
  parseOpen,
  parsePr,
  previewConfig,
  previewNames,
  previewNumber,
  secretsToSet,
  sweepTargets,
  TURNSTILE_TEST_SECRET,
  teardown,
  workersSubdomain,
} from "../../../../../scripts/preview-env";

const ROOT = new URL("../../../../..", import.meta.url).pathname;
const WRANGLER = readFileSync(
  join(ROOT, "apps", "site", "wrangler.jsonc"),
  "utf8"
);
const IDS = {
  databaseId: "00000000-0000-4000-8000-000000000042",
  kvId: "0000000000000000000000000000002a",
};
const silent = { log: () => undefined, warn: () => undefined };

function ok(result: unknown, status = 200): ApiResponse {
  return { errors: [], result, status, success: true };
}

function fail(status: number, code = 0): ApiResponse {
  return {
    errors: [{ code, message: "nope" }],
    result: null,
    status,
    success: false,
  };
}

/** A fake API: answers by "METHOD path" (query string included), records calls. */
function fakeApi(answers: Record<string, ApiResponse>) {
  const calls: string[] = [];
  const api: Api = (method, path, body) => {
    const key = `${method} ${path}`;
    calls.push(body === undefined ? key : `${key} ${JSON.stringify(body)}`);
    return Promise.resolve(answers[key] ?? ok(method === "GET" ? [] : {}));
  };
  return { api, calls };
}

describe("names", () => {
  test("every resource of a PR carries its number", () => {
    expect(previewNames(7)).toEqual({
      bucket: "smog-pr-7-media",
      database: "smog-pr-7",
      kv: "smog-pr-7",
      queuePrefix: "smog-pr-7-",
      worker: "smog-site-pr-7",
    });
  });

  test("previewNumber reads only preview names", () => {
    expect(previewNumber("smog-site-pr-12")).toBe(12);
    expect(previewNumber("smog-pr-12")).toBe(12);
    expect(previewNumber("smog-pr-12-email-dlq")).toBe(12);
    expect(previewNumber("smog-pr-120x")).toBeNull();
    expect(previewNumber("smog-staging")).toBeNull();
    expect(previewNumber("smog-site-staging")).toBeNull();
    expect(previewNumber("smog-staging-email")).toBeNull();
  });

  test("parsePr takes a positive number only", () => {
    expect(parsePr("12")).toBe(12);
    for (const bad of [undefined, "", "0", "-1", "1.5", "12; rm", "01"]) {
      expect(() => parsePr(bad)).toThrow("--pr");
    }
  });

  test("parseOpen accepts an empty list and refuses a missing one", () => {
    expect([...parseOpen("")]).toEqual([]);
    expect([...parseOpen("3 5,8")]).toEqual([3, 5, 8]);
    expect(() => parseOpen(undefined)).toThrow("--open");
  });
});

describe("previewConfig", () => {
  const { config, siteUrl } = previewConfig(WRANGLER, 42, IDS);
  const env = config.env as Record<string, Record<string, unknown>>;
  const staging = env.staging as Record<string, unknown>;

  test("the PR's origin is on the staging workers.dev subdomain", () => {
    expect(siteUrl).toBe("https://smog-site-pr-42.zias.workers.dev");
    expect(workersSubdomain("https://a.b.workers.dev")).toBe("b");
    expect(() => workersSubdomain("https://app.smog.vlaanderen")).toThrow(
      "workers.dev"
    );
  });

  test("env.staging becomes the PR's Worker with its own resources", () => {
    expect(staging.name).toBe("smog-site-pr-42");
    expect(staging.workers_dev).toBe(true);
    expect(staging.kv_namespaces).toEqual([{ binding: "KV", id: IDS.kvId }]);
    expect(staging.d1_databases).toEqual([
      expect.objectContaining({
        binding: "DB",
        database_id: IDS.databaseId,
        database_name: "smog-pr-42",
      }),
    ]);
    const vars = staging.vars as Record<string, string>;
    expect(vars.SITE_URL).toBe(siteUrl);
    expect(vars.MEDIA_BUCKET).toBe("smog-pr-42-media");
    expect(vars.ENVIRONMENT).toBe("staging");
    expect(vars.SENTRY_DSN).toBe("");
  });

  test("no staging queue, bucket, database or id survives", () => {
    const text = JSON.stringify(staging);
    expect(text).not.toContain("smog-staging");
    expect(text).not.toContain("e9e96b50c93342e992a9da54621bad2a");
    expect(text).not.toContain("8903bac9-695b-4475-9fa2-6dfa94b16320");
    const queues = staging.queues as {
      consumers: { dead_letter_queue?: string; queue: string }[];
      producers: { queue: string }[];
    };
    for (const name of [
      ...queues.producers.map((producer) => producer.queue),
      ...queues.consumers.flatMap((consumer) =>
        [consumer.queue, consumer.dead_letter_queue].filter(Boolean)
      ),
    ]) {
      expect(name).toStartWith("smog-pr-42-");
    }
  });

  test("production is removed from the checkout", () => {
    expect(Object.keys(env).sort()).toEqual(["dev", "staging"]);
  });

  test("assertPrepared accepts the rewrite and refuses the real staging", () => {
    expect(assertPrepared(JSON.stringify(config), 42)).toEqual(IDS);
    expect(() => assertPrepared(JSON.stringify(config), 43)).toThrow(
      "not prepared for PR 43"
    );
    expect(() => assertPrepared(WRANGLER, 42)).toThrow("not prepared");
  });
});

describe("secretsToSet", () => {
  test("a new Worker gets a random auth secret and the Turnstile test secret", () => {
    expect(secretsToSet(new Set(), {}, () => "r".repeat(64))).toEqual({
      BETTER_AUTH_SECRET: "r".repeat(64),
      TURNSTILE_SECRET_KEY: TURNSTILE_TEST_SECRET,
    });
  });

  test("an existing auth secret is kept, so sessions survive a push", () => {
    const secrets = secretsToSet(new Set(["BETTER_AUTH_SECRET"]), {}, () => {
      throw new Error("not called");
    });
    expect(secrets).not.toHaveProperty("BETTER_AUTH_SECRET");
  });

  test("forwards the optional secrets and refuses a live Mollie key", () => {
    const secrets = secretsToSet(
      new Set(["BETTER_AUTH_SECRET"]),
      { MOLLIE_API_KEY: "test_abc", MUX_TOKEN_ID: "id", MUX_TOKEN_SECRET: "" },
      () => ""
    );
    expect(secrets).toEqual({
      MOLLIE_API_KEY: "test_abc",
      MUX_TOKEN_ID: "id",
      TURNSTILE_SECRET_KEY: TURNSTILE_TEST_SECRET,
    });
    expect(() =>
      secretsToSet(new Set(), { MOLLIE_API_KEY: "live_abc" }, () => "x")
    ).toThrow("test_");
  });
});

describe("the Cloudflare API", () => {
  test("ensureStores reuses what exists and creates what is missing", async () => {
    const { api, calls } = fakeApi({
      "GET /d1/database?name=smog-pr-9&page=1&per_page=100": ok([
        { name: "smog-pr-90", uuid: "other" },
        { name: "smog-pr-9", uuid: "db-9" },
      ]),
      "POST /storage/kv/namespaces": ok({ id: "kv-9", title: "smog-pr-9" }),
    });
    expect(await ensureStores(api, 9, silent)).toEqual({
      databaseId: "db-9",
      kvId: "kv-9",
    });
    expect(calls).not.toContain('POST /d1/database {"name":"smog-pr-9"}');
    expect(calls).toContain(
      'POST /storage/kv/namespaces {"title":"smog-pr-9"}'
    );
  });

  test("existingSecrets of a Worker that does not exist yet is empty", async () => {
    const { api } = fakeApi({
      "GET /workers/scripts/smog-site-pr-9/secrets": fail(404, 10_007),
    });
    expect([...(await existingSecrets(api, "smog-site-pr-9"))]).toEqual([]);
  });

  test("inventory groups preview resources by PR and ignores the rest", async () => {
    const { api } = fakeApi({
      "GET /d1/database?name=smog-pr-&page=1&per_page=100": ok([
        { name: "smog-staging", uuid: "s" },
        { name: "smog-pr-3", uuid: "d3" },
        { name: "smog-pr-5", uuid: "d5" },
      ]),
      "GET /queues?page=1&per_page=100": ok([
        { queue_id: "q1", queue_name: "smog-staging-email" },
        { queue_id: "q2", queue_name: "smog-pr-3-email" },
      ]),
      "GET /r2/buckets?name_contains=smog-pr-&per_page=1000": ok({
        buckets: [{ name: "smog-pr-3-media" }, { name: "smog-staging-media" }],
      }),
      "GET /storage/kv/namespaces?page=1&per_page=100": ok([
        { id: "k3", title: "smog-pr-3" },
      ]),
      "GET /workers/scripts": ok([
        { id: "smog-site-staging" },
        { id: "smog-site-pr-3" },
      ]),
    });
    const found = await inventory(api);
    expect([...found.keys()].sort()).toEqual([3, 5]);
    expect(found.get(3)).toEqual({
      buckets: ["smog-pr-3-media"],
      databases: [{ id: "d3", name: "smog-pr-3" }],
      namespaces: [{ id: "k3", title: "smog-pr-3" }],
      queues: [{ id: "q2", name: "smog-pr-3-email" }],
      workers: ["smog-site-pr-3"],
    });
    expect(sweepTargets(found, new Set([3]))).toEqual([5]);
  });

  test("teardown deletes the Worker first and empties the bucket", async () => {
    const { api, calls } = fakeApi({
      "GET /r2/buckets/smog-pr-3-media/objects?per_page=1000": ok([
        { key: "teacher/drawings/a b.png" },
      ]),
    });
    const failures = await teardown(
      { api, log: silent, run: () => Promise.reject(new Error("unused")) },
      3,
      {
        buckets: ["smog-pr-3-media"],
        databases: [{ id: "d3", name: "smog-pr-3" }],
        namespaces: [{ id: "k3", title: "smog-pr-3" }],
        queues: [{ id: "q2", name: "smog-pr-3-email" }],
        workers: ["smog-site-pr-3"],
      }
    );
    expect(failures).toEqual([]);
    expect(calls.filter((call) => call.startsWith("DELETE"))).toEqual([
      "DELETE /workers/scripts/smog-site-pr-3?force=true",
      "DELETE /queues/q2",
      "DELETE /d1/database/d3",
      "DELETE /storage/kv/namespaces/k3",
      "DELETE /r2/buckets/smog-pr-3-media/objects/teacher/drawings/a%20b.png",
      "DELETE /r2/buckets/smog-pr-3-media",
    ]);
  });

  test("teardown keeps going after a failure and expires a bucket it cannot list", async () => {
    const { api } = fakeApi({
      "DELETE /queues/q2": fail(400),
      "DELETE /r2/buckets/smog-pr-3-media": fail(409, 10_008),
      "GET /r2/buckets/smog-pr-3-media/objects?per_page=1000": fail(404),
    });
    const commands: string[][] = [];
    const failures = await teardown(
      {
        api,
        log: silent,
        run: (command) => {
          commands.push(command);
          return Promise.resolve({ code: 0, stderr: "", stdout: "" });
        },
      },
      3,
      {
        buckets: ["smog-pr-3-media"],
        databases: [{ id: "d3", name: "smog-pr-3" }],
        namespaces: [],
        queues: [{ id: "q2", name: "smog-pr-3-email" }],
        workers: [],
      }
    );
    expect(failures).toHaveLength(2);
    expect(commands[0]).toContain("lifecycle");
    expect(commands[0]).toContain("smog-pr-3-media");
  });
});
