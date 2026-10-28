import {
  createExecutionContext,
  createMessageBatch,
  getQueueResult,
} from "cloudflare:test";
import { env } from "cloudflare:workers";
import { createDb } from "@smog/db/client";
import {
  DLQ_MAX_RETRIES,
  DLQ_RETRY_DELAY_SECONDS,
  lostCounterKey,
} from "@smog/jobs";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import worker from "../../../../../apps/site/src/worker";
import { processDeadLetter } from "../../../../../apps/site/src/worker/dlq-queue";
import { kv, testDb } from "../../sponsorships/site/sponsorships";

/*
 * The DLQ consumers (phase 9 ruling 5): storage, deduplication, what is
 * never stored (ruling 5c), the retry with a delay while D1 is down, and
 * the `lost` line and counter after the last delivery (ruling 5b).
 */

const EMAIL_DLQ = "smog-dev-email-dlq";
const EVENTS_DLQ = "smog-dev-sponsorship-events-dlq";
const NOW = new Date("2026-10-20T12:00:00Z");
const db = testDb();
if (!env.DB) {
  throw new Error("[test] The DB binding is missing");
}
const d1: D1Database = env.DB;
const ADDRESS = "alex@smog.example";
const OTP_CODE = "482913";
const TOKEN = "tok_9f8e7d6c5b4a39281706f5e4d3c2b1a0";

interface Row {
  attempts: number;
  body: string | null;
  discarded_at: number | null;
  error: string | null;
  id: string;
  origin_queue: string;
  queue: string;
  received_at: number;
  replayable: number;
  replayed_at: number | null;
  type: string;
}

async function rows(): Promise<Row[]> {
  return (await d1.prepare("SELECT * FROM dead_letter ORDER BY id").all<Row>())
    .results;
}

function email(overrides: Record<string, unknown> = {}) {
  return {
    id: crypto.randomUUID(),
    idempotencyKey: `welcome:${crypto.randomUUID()}`,
    locale: "nl",
    props: { name: "Alex", url: "https://smog.example" },
    template: "transactional/welcome",
    to: ADDRESS,
    ...overrides,
  };
}

function delivery(id: string, body: unknown, attempts = 7) {
  return { attempts, body, id };
}

beforeEach(async () => {
  await d1.prepare("DELETE FROM dead_letter").run();
  const keys = await kv().list({ prefix: "dlq-lost:" });
  await Promise.all(keys.keys.map((key) => kv().delete(key.name)));
  vi.spyOn(console, "error").mockImplementation(() => undefined);
  vi.spyOn(console, "warn").mockImplementation(() => undefined);
});

afterEach(() => {
  vi.restoreAllMocks();
});

const deps = { db, kv: kv(), now: () => NOW };

describe("the dead-letter consumer: what is stored", () => {
  it("stores a keyed, secret-free email with its body, replayable, and acks", async () => {
    const body = email();
    const decision = await processDeadLetter(
      EMAIL_DLQ,
      delivery("m-1", body),
      deps
    );

    expect(decision).toEqual({ action: "ack" });
    const [row] = await rows();
    expect(row).toMatchObject({
      attempts: 7,
      discarded_at: null,
      error: null,
      id: "m-1",
      origin_queue: "email",
      queue: EMAIL_DLQ,
      received_at: NOW.getTime(),
      replayable: 1,
      replayed_at: null,
      type: "transactional/welcome",
    });
    expect(JSON.parse(row?.body ?? "null")).toMatchObject({
      idempotencyKey: body.idempotencyKey,
      to: ADDRESS,
    });
  });

  it("stores a message once however often it is delivered", async () => {
    const body = email();
    await processDeadLetter(EMAIL_DLQ, delivery("m-dup", body), deps);
    await processDeadLetter(EMAIL_DLQ, delivery("m-dup", body, 8), deps);
    expect(await rows()).toHaveLength(1);
  });

  it.each([
    ["auth/otp", { code: OTP_CODE, minutes: 5 }],
    [
      "auth/magic-link",
      {
        minutes: 5,
        url: `https://smog.example/api/auth/magic-link/verify?token=${TOKEN}`,
      },
    ],
    [
      "auth/reset-password",
      {
        minutes: 60,
        name: "Alex",
        url: `https://smog.example/reset-password?token=${TOKEN}`,
      },
    ],
    [
      "auth/verify-email",
      {
        minutes: 60,
        url: `https://smog.example/api/auth/verify-email?token=${TOKEN}`,
      },
    ],
    [
      "transactional/renewal-reminder",
      {
        endsAt: "2027-10-02T08:00:00.000Z",
        gestureName: "Hond",
        name: "Alex",
        url: `https://smog.example/sponsor/renew#token=${TOKEN}`,
      },
    ],
  ])(
    "stores %s with no body, and nothing of its code, token or address",
    async (template, props) => {
      await processDeadLetter(
        EMAIL_DLQ,
        delivery("m-secret", email({ props, template })),
        deps
      );

      const [row] = await rows();
      expect(row).toMatchObject({
        body: null,
        error: "secret_template",
        replayable: 0,
        type: template,
      });
      const everything = JSON.stringify(row);
      expect(everything).not.toContain(OTP_CODE);
      expect(everything).not.toContain(TOKEN);
      expect(everything).not.toContain(ADDRESS);
    }
  );

  it("stores a key-less email with no body (a replay could not be made safe)", async () => {
    await processDeadLetter(
      EMAIL_DLQ,
      delivery("m-nokey", email({ idempotencyKey: undefined })),
      deps
    );
    const [row] = await rows();
    expect(row).toMatchObject({
      body: null,
      error: "no_idempotency_key",
      replayable: 0,
    });
    expect(JSON.stringify(row)).not.toContain(ADDRESS);
  });

  it("stores an invalid message with no body, by its template when it names one", async () => {
    await processDeadLetter(
      EMAIL_DLQ,
      delivery("m-bad", { template: "transactional/welcome", to: ADDRESS }),
      deps
    );
    await processDeadLetter(EMAIL_DLQ, delivery("m-bad-2", "garbage"), deps);
    const stored = await rows();
    expect(stored.map((row) => [row.type, row.body, row.error])).toEqual([
      ["transactional/welcome", null, "invalid_message"],
      ["unknown", null, "invalid_message"],
    ]);
    expect(JSON.stringify(stored)).not.toContain(ADDRESS);
  });

  it("stores an events message with its body (ids only), replayable", async () => {
    await processDeadLetter(
      EVENTS_DLQ,
      delivery("e-1", { paymentId: "p-1", type: "payment.settled" }),
      deps
    );
    const [row] = await rows();
    expect(row).toMatchObject({
      error: null,
      origin_queue: "events",
      queue: EVENTS_DLQ,
      replayable: 1,
      type: "payment.settled",
    });
    expect(JSON.parse(row?.body ?? "null")).toEqual({
      paymentId: "p-1",
      type: "payment.settled",
    });
  });

  it("acks a message from a queue that is not a DLQ of this app, storing nothing", async () => {
    expect(
      await processDeadLetter("smog-dev-email", delivery("x", {}), deps)
    ).toEqual({ action: "ack" });
    expect(await rows()).toEqual([]);
  });
});

/** A D1 whose every statement fails, as during an outage. */
function downDb() {
  const down = new Proxy(d1, {
    get(target, key, receiver) {
      if (key === "prepare" || key === "batch") {
        return () => {
          throw new Error("D1 is down");
        };
      }
      const value = Reflect.get(target, key, receiver);
      return typeof value === "function" ? value.bind(target) : value;
    },
  });
  return createDb(down);
}

describe("the dead-letter consumer while D1 is down (ruling 5b)", () => {
  it("retries with the 300 s delay, losing nothing before the last delivery", async () => {
    expect(DLQ_RETRY_DELAY_SECONDS).toBe(300);
    const decision = await processDeadLetter(
      EMAIL_DLQ,
      delivery("m-down", email(), DLQ_MAX_RETRIES),
      { ...deps, db: downDb() }
    );
    expect(decision).toEqual({ action: "retry", delaySeconds: 300 });
    expect(await kv().get(lostCounterKey(NOW))).toBeNull();
  });

  it("logs [dlq] lost without the body after the last delivery, and counts it", async () => {
    const error = vi.spyOn(console, "error");
    const body = email();
    const down = { ...deps, db: downDb() };

    const decision = await processDeadLetter(
      EMAIL_DLQ,
      delivery("m-lost", body, DLQ_MAX_RETRIES + 1),
      down
    );
    await processDeadLetter(
      EMAIL_DLQ,
      delivery("m-lost-2", body, DLQ_MAX_RETRIES + 1),
      down
    );

    expect(decision).toEqual({ action: "ack" });
    expect(error).toHaveBeenCalledWith(
      `[dlq] lost ${JSON.stringify({ id: "m-lost", queue: EMAIL_DLQ, type: "transactional/welcome" })}`
    );
    expect(JSON.stringify(error.mock.calls)).not.toContain(ADDRESS);
    expect(await kv().get("dlq-lost:2026-10-20")).toBe("2");
  });

  it("stores the message once D1 is back, on a retry", async () => {
    const body = email();
    await processDeadLetter(EMAIL_DLQ, delivery("m-back", body, 3), {
      ...deps,
      db: downDb(),
    });
    await processDeadLetter(EMAIL_DLQ, delivery("m-back", body, 4), deps);
    expect(await rows()).toHaveLength(1);
  });
});

describe("an environment that fails before the store (ruling 5b)", () => {
  const broken = () => {
    throw new Error("env validation failed");
  };

  it("retries with the delay while deliveries remain", async () => {
    expect(
      await processDeadLetter(EMAIL_DLQ, delivery("m-env", email(), 2), broken)
    ).toEqual({ action: "retry", delaySeconds: 300 });
  });

  it("logs [dlq] lost on the last delivery instead of dropping silently", async () => {
    const error = vi.spyOn(console, "error");

    const decision = await processDeadLetter(
      EMAIL_DLQ,
      delivery("m-env-lost", email(), DLQ_MAX_RETRIES + 1),
      broken
    );

    expect(decision).toEqual({ action: "ack" });
    expect(error).toHaveBeenCalledWith(
      `[dlq] lost ${JSON.stringify({ id: "m-env-lost", queue: EMAIL_DLQ, type: "transactional/welcome" })}`
    );
    expect(JSON.stringify(error.mock.calls)).not.toContain(ADDRESS);
  });
});

describe("the queue() handler for the two DLQs", () => {
  async function run(queue: string, messages: { body: unknown; id: string }[]) {
    const batch = createMessageBatch(
      queue,
      messages.map((m) => ({ ...m, attempts: 1, timestamp: new Date() }))
    );
    const ctx = createExecutionContext();
    await worker.queue(batch, env, ctx);
    return await getQueueResult(batch, ctx);
  }

  it("stores and acks each message of an email DLQ batch", async () => {
    const result = await run(EMAIL_DLQ, [
      { body: email(), id: "w-1" },
      {
        body: email({
          props: { code: OTP_CODE, minutes: 5 },
          template: "auth/otp",
        }),
        id: "w-2",
      },
    ]);
    expect(result.explicitAcks.sort()).toEqual(["w-1", "w-2"]);
    expect(result.retryMessages).toEqual([]);
    expect((await rows()).map((row) => row.id)).toEqual(["w-1", "w-2"]);
  });

  it("stores and acks an events DLQ batch", async () => {
    const result = await run(EVENTS_DLQ, [
      { body: { renderJobId: "j-1", type: "render.requested" }, id: "e-1" },
    ]);
    expect(result.explicitAcks).toEqual(["e-1"]);
    expect((await rows())[0]).toMatchObject({ origin_queue: "events" });
  });
});
