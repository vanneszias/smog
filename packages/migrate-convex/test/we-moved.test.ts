import { afterEach, beforeEach, describe, expect, test } from "bun:test";
import {
  existsSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { emailMessageSchema } from "@smog/jobs";
import type { Timer } from "../src/cli/remote";
import {
  batchMessages,
  buildMessages,
  CLOUDFLARE_API,
  maskEmail,
  QUEUES_BATCH_MAX_BYTES,
  QUEUES_BATCH_MAX_MESSAGES,
  RECIPIENTS_SQL,
  type Recipient,
  readSiteConfig,
  runWeMoved,
  SITE_WRANGLER_CONFIG,
  WE_MOVED_LEDGER,
  type WeMovedContext,
  type WeMovedMessage,
} from "../src/cli/we-moved";
import { createFakeWrangler, createWrangler } from "../src/cli/wrangler";

const TOKEN = "fake-cloudflare-token-value";
const ACCOUNT = "fake-account-id";
const QUEUE_ID = "queue-email-production-id";
const SITE = "https://smog-site-production.example";

function fakeTimer(): { sleeps: number[]; timer: Timer } {
  let now = Date.parse("2026-10-04T12:00:00.000Z");
  const sleeps: number[] = [];
  return {
    sleeps,
    timer: {
      now: () => now,
      sleep: (ms) => {
        sleeps.push(ms);
        now += ms;
        return Promise.resolve();
      },
    },
  };
}

function capture() {
  const lines: { error: string[]; log: string[] } = { error: [], log: [] };
  return {
    all: () => [...lines.log, ...lines.error].join("\n"),
    lines,
    out: {
      error: (text: string) => lines.error.push(text),
      log: (text: string) => lines.log.push(text),
    },
  };
}

interface FakeQueuesOptions {
  /** Answer the n-th batch POST (from 1) with this status instead. */
  failBatch?: { headers?: Record<string, string>; nth: number; status: number };
  /** The queue list's pages. */
  pages?: { queue_id: string; queue_name: string }[][];
}

/**
 * The Cloudflare Queues HTTP API as `we-moved` calls it: the queue list
 * (paged) and the batch push, with the token checked. It keeps every
 * batch it accepted.
 */
function fakeQueuesApi(options: FakeQueuesOptions = {}) {
  const pages = options.pages ?? [
    [
      { queue_id: "other", queue_name: "smog-production-sponsorship-events" },
      { queue_id: QUEUE_ID, queue_name: "smog-production-email" },
    ],
  ];
  const batches: { content_type: string; body: WeMovedMessage }[][] = [];
  const requests: { method: string; path: string }[] = [];
  let posts = 0;
  const fetchImpl: WeMovedContext["fetch"] = (input, init) =>
    Promise.resolve(answer(input, init));
  const answer = (input: RequestInfo | URL, init?: RequestInit): Response => {
    const url = new URL(String(input));
    const method = init?.method ?? "GET";
    const path = url.pathname.replace(new URL(CLOUDFLARE_API).pathname, "");
    requests.push({ method, path: `${path}${url.search}` });
    const headers = new Headers(init?.headers);
    if (headers.get("authorization") !== `Bearer ${TOKEN}`) {
      return Response.json(
        {
          errors: [{ code: 10_000, message: "Authentication error" }],
          success: false,
        },
        { status: 403 }
      );
    }
    if (method === "GET" && path === `/accounts/${ACCOUNT}/queues`) {
      const page = Number(url.searchParams.get("page") ?? "1");
      return Response.json({
        errors: [],
        result: pages[page - 1] ?? [],
        result_info: { page, total_pages: pages.length },
        success: true,
      });
    }
    if (
      method === "POST" &&
      path === `/accounts/${ACCOUNT}/queues/${QUEUE_ID}/messages/batch`
    ) {
      posts += 1;
      const failure = options.failBatch;
      if (failure && failure.nth === posts) {
        return Response.json(
          { errors: [{ code: 1, message: "Fake failure" }], success: false },
          { headers: failure.headers ?? {}, status: failure.status }
        );
      }
      const body = JSON.parse(String(init?.body)) as {
        messages: { body: WeMovedMessage; content_type: string }[];
      };
      batches.push(body.messages);
      return Response.json({ errors: [], result: {}, success: true });
    }
    return Response.json(
      { errors: [{ code: 7003, message: "No route" }], success: false },
      { status: 404 }
    );
  };
  return { batches, fetch: fetchImpl, requests };
}

/** A missing locale (nl), French, English, in turn. */
const LOCALE_CYCLE = [null, "fr", "en"] as const;

function recipients(count: number): Recipient[] {
  return Array.from({ length: count }, (_, index) => {
    const n = String(index).padStart(4, "0");
    return {
      email: `person.${n}@example.test`,
      id: `user-${n}`,
      locale: LOCALE_CYCLE[index % LOCALE_CYCLE.length] ?? null,
    };
  });
}

let dir: string;
let wranglerConfig: string;

beforeEach(() => {
  dir = mkdtempSync(join(tmpdir(), "smog-we-moved-"));
  writeFileSync(
    join(dir, "manifest.json"),
    JSON.stringify({ target: "production", version: 1 })
  );
  wranglerConfig = join(dir, "wrangler.jsonc");
  writeFileSync(
    wranglerConfig,
    `{
  // A comment, as in the real file.
  "env": {
    "production": {
      "vars": { "SITE_URL": "${SITE}" },
      "queues": {
        "producers": [
          { "binding": "EMAIL_QUEUE", "queue": "smog-production-email" },
        ],
      },
    },
  },
}
`
  );
});

afterEach(() => {
  rmSync(dir, { force: true, recursive: true });
});

function setup(
  rows: Recipient[],
  queues: ReturnType<typeof fakeQueuesApi> = fakeQueuesApi(),
  env: WeMovedContext["env"] = {
    CLOUDFLARE_ACCOUNT_ID: ACCOUNT,
    CLOUDFLARE_API_TOKEN: TOKEN,
  }
) {
  const wrangler = createFakeWrangler({
    d1: (query) => {
      expect(query).toMatchObject({
        command: RECIPIENTS_SQL,
        env: "production",
        remote: true,
      });
      return [rows];
    },
  });
  const { sleeps, timer } = fakeTimer();
  const context: WeMovedContext = {
    env,
    fetch: queues.fetch,
    timer,
    wrangler: createWrangler("production", wrangler.run),
    wranglerConfigPath: wranglerConfig,
  };
  return { context, queues, sleeps, wrangler };
}

const RUN = { apply: false, env: "production", outDir: "" };

describe("we-moved refusals", () => {
  test("runs on production only", async () => {
    for (const env of ["staging", "dev"]) {
      const { context, wrangler } = setup(recipients(1));
      // biome-ignore lint/performance/noAwaitInLoops: one env after the other.
      await expect(
        runWeMoved({ ...RUN, env, outDir: dir }, context, capture().out)
      ).rejects.toThrow("we-moved runs on production only");
      expect(wrangler.calls).toEqual([]);
    }
  });

  test("refuses a plan made for staging, and a folder without a plan", async () => {
    const { context, wrangler } = setup(recipients(1));
    writeFileSync(
      join(dir, "manifest.json"),
      JSON.stringify({ target: "staging", version: 1 })
    );
    await expect(
      runWeMoved({ ...RUN, outDir: dir }, context, capture().out)
    ).rejects.toThrow("was made for staging, not production");
    rmSync(join(dir, "manifest.json"));
    await expect(
      runWeMoved({ ...RUN, outDir: dir }, context, capture().out)
    ).rejects.toThrow("manifest.json does not exist");
    expect(wrangler.calls).toEqual([]);
  });

  test("names the missing Cloudflare env vars", async () => {
    const { context, wrangler } = setup(recipients(1), fakeQueuesApi(), {});
    await expect(
      runWeMoved({ ...RUN, outDir: dir }, context, capture().out)
    ).rejects.toThrow(
      "CLOUDFLARE_API_TOKEN and CLOUDFLARE_ACCOUNT_ID must be set in the environment"
    );
    expect(wrangler.calls).toEqual([]);
  });
});

describe("we-moved dry run", () => {
  test("reads the recipients and the queue id, prints counts and one masked sample, queues nothing", async () => {
    const rows = recipients(3);
    const { context, queues } = setup(rows);
    const { all, lines, out } = capture();

    expect(await runWeMoved({ ...RUN, outDir: dir }, context, out)).toBe(0);

    expect(queues.requests).toEqual([
      { method: "GET", path: `/accounts/${ACCOUNT}/queues?page=1` },
    ]);
    expect(queues.batches).toEqual([]);
    expect(existsSync(join(dir, WE_MOVED_LEDGER))).toBe(false);
    const log = lines.log.join("\n");
    expect(log).toContain(
      `3 migrated account(s); 0 already queued (ledger); 3 to queue in 1 batch(es) to smog-production-email (${QUEUE_ID})`
    );
    expect(log).toContain('the "new address" sentence is shown');
    expect(log).toContain("nl subject: SMOG is verhuisd");
    expect(log).toContain('"to":"p***@e***.test"');
    expect(log).toContain('"idempotencyKey":"we_moved:user-0000"');
    expect(log).toContain("Run again with --apply");
    for (const row of rows) {
      expect(all()).not.toContain(row.email);
    }
    expect(all()).not.toContain(TOKEN);
  });

  test("finds the queue on a later page", async () => {
    const queues = fakeQueuesApi({
      pages: [
        [{ queue_id: "a", queue_name: "smog-staging-email" }],
        [{ queue_id: QUEUE_ID, queue_name: "smog-production-email" }],
      ],
    });
    const { context } = setup(recipients(1), queues);
    expect(
      await runWeMoved({ ...RUN, outDir: dir }, context, capture().out)
    ).toBe(0);
    expect(queues.requests.map((request) => request.path)).toEqual([
      `/accounts/${ACCOUNT}/queues?page=1`,
      `/accounts/${ACCOUNT}/queues?page=2`,
    ]);
  });

  test("says which permission a refused token needs", async () => {
    const { context } = setup(recipients(1), fakeQueuesApi(), {
      CLOUDFLARE_ACCOUNT_ID: ACCOUNT,
      CLOUDFLARE_API_TOKEN: "wrong",
    });
    await expect(
      runWeMoved({ ...RUN, outDir: dir }, context, capture().out)
    ).rejects.toThrow("The token needs Queues: Edit");
  });
});

describe("we-moved --apply", () => {
  test("queues every migrated user in batches of at most 100, each body a valid email message", async () => {
    const rows = recipients(250);
    const { context, queues } = setup(rows);
    const { lines, out } = capture();

    expect(
      await runWeMoved({ ...RUN, apply: true, outDir: dir }, context, out)
    ).toBe(0);

    expect(queues.batches.map((batch) => batch.length)).toEqual([100, 100, 50]);
    const sent = queues.batches.flat();
    expect(sent.map((entry) => entry.body.to)).toEqual(
      rows.map((row) => row.email)
    );
    for (const [index, entry] of sent.entries()) {
      expect(entry.content_type).toBe("json");
      expect(emailMessageSchema.parse(entry.body)).toEqual(entry.body);
      expect(entry.body).toMatchObject({
        idempotencyKey: `we_moved:${rows[index]?.id}`,
        locale: rows[index]?.locale ?? "nl",
        props: { url: SITE },
        template: "transactional/we-moved",
      });
    }
    const ledger = JSON.parse(readFileSync(join(dir, WE_MOVED_LEDGER), "utf8"));
    expect(Object.keys(ledger.entries)).toHaveLength(250);
    expect(ledger.entries["user-0000"].messageId).toBe(sent[0]?.body.id);
    expect(lines.log.at(-1)).toContain(
      "Queued 250 we_moved email(s) in 3 batch(es)"
    );
  });

  test("a re-run queues only who the ledger does not hold", async () => {
    const queues = fakeQueuesApi({ failBatch: { nth: 2, status: 500 } });
    const first = setup(recipients(150), queues);
    const { lines, out } = capture();
    await expect(
      runWeMoved({ ...RUN, apply: true, outDir: dir }, first.context, out)
    ).rejects.toThrow("The Queues API answered 500 to batch 2");
    expect(lines.error.join("\n")).toContain(
      "100 email(s) were queued and are in the ledger"
    );
    expect(queues.batches.map((batch) => batch.length)).toEqual([100]);

    const again = setup(recipients(150), queues);
    expect(
      await runWeMoved(
        { ...RUN, apply: true, outDir: dir },
        again.context,
        capture().out
      )
    ).toBe(0);
    expect(queues.batches.map((batch) => batch.length)).toEqual([100, 50]);
    const ids = queues.batches.flat().map((entry) => entry.body.idempotencyKey);
    expect(new Set(ids).size).toBe(150);

    const third = setup(recipients(150), queues);
    await runWeMoved(
      { ...RUN, apply: true, outDir: dir },
      third.context,
      capture().out
    );
    expect(queues.batches).toHaveLength(2);
  });

  test("waits out a 429's Retry-After and then queues the batch", async () => {
    const queues = fakeQueuesApi({
      failBatch: { headers: { "retry-after": "5" }, nth: 1, status: 429 },
    });
    const { context, sleeps } = setup(recipients(2), queues);
    expect(
      await runWeMoved(
        { ...RUN, apply: true, outDir: dir },
        context,
        capture().out
      )
    ).toBe(0);
    expect(sleeps).toContain(5000);
    expect(queues.batches.map((batch) => batch.length)).toEqual([2]);
  });

  test("skips an unusable address by id and never prints it", async () => {
    const rows = [
      ...recipients(1),
      { email: "not an address", id: "user-bad", locale: "nl" },
    ];
    const { context, queues } = setup(rows);
    const { all, lines, out } = capture();
    await runWeMoved({ ...RUN, apply: true, outDir: dir }, context, out);
    expect(queues.batches.flat()).toHaveLength(1);
    expect(lines.error).toContain(
      "[migrate-convex] warning: no usable address for user(s) user-bad; they get no email."
    );
    expect(all()).not.toContain("not an address");
  });
});

describe("batches", () => {
  test("hold at most 256 KB of request body", () => {
    const messages = Array.from({ length: 40 }, (_, index) => ({
      message: {
        id: crypto.randomUUID(),
        idempotencyKey: `we_moved:u${index}`,
        locale: "nl" as const,
        props: { pad: "x".repeat(20_000), url: SITE },
        template: "transactional/we-moved" as const,
        to: `p${index}@example.test`,
      },
      userId: `u${index}`,
    }));
    const batches = batchMessages(messages);
    expect(batches.length).toBeGreaterThan(1);
    for (const batch of batches) {
      expect(
        new TextEncoder().encode(batch.body).byteLength
      ).toBeLessThanOrEqual(QUEUES_BATCH_MAX_BYTES);
      expect(batch.userIds.length).toBeLessThanOrEqual(
        QUEUES_BATCH_MAX_MESSAGES
      );
      expect(JSON.parse(batch.body).messages[0].content_type).toBe("json");
    }
    expect(batches.flatMap((batch) => batch.userIds)).toEqual(
      messages.map((entry) => entry.userId)
    );
  });

  test("buildMessages maps a missing locale to nl", () => {
    const { messages } = buildMessages(
      [{ email: " a@example.test ", id: "u1", locale: null }],
      SITE,
      () => "00000000-0000-4000-8000-000000000001"
    );
    expect(messages[0]?.message).toEqual({
      id: "00000000-0000-4000-8000-000000000001",
      idempotencyKey: "we_moved:u1",
      locale: "nl",
      props: { url: SITE },
      template: "transactional/we-moved",
      to: "a@example.test",
    });
  });

  test("maskEmail keeps only the first letters and the top-level domain", () => {
    expect(maskEmail("bea.fixture@example.test")).toBe("b***@e***.test");
  });
});

describe("the site config", () => {
  test("reads production's SITE_URL and email queue from apps/site/wrangler.jsonc", () => {
    const config = readSiteConfig(readFileSync(SITE_WRANGLER_CONFIG, "utf8"));
    expect(config.queueName).toBe("smog-production-email");
    expect(new URL(config.siteUrl).protocol).toBe("https:");
  });
});
