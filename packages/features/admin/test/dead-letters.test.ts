import { env } from "cloudflare:workers";
import { MemoryEmailSender } from "@smog/email";
import { processEmailMessage } from "@smog/jobs";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  type Authed,
  auditMark,
  auditRowsSince,
  callAs,
  expectAudit,
  signedUp,
} from "./helpers";
import { clearQueues, enqueued, queueFaults } from "./sponsorship-fakes";

/*
 * `admin.deadLetters.*` (phase 9 task 4, ruling 5): the list never returns
 * a body; replay re-enqueues with the original idempotency key and refuses
 * what cannot be replayed safely; replay twice is one effect; discard; the
 * audit entry is in the same batch as the write.
 */

const ADDRESS = "alex@smog.example";
const EMAIL_DLQ = "smog-dev-email-dlq";

interface Row {
  attempts?: number;
  body: string | null;
  discardedAt?: number | null;
  error?: string | null;
  id: string;
  origin?: "email" | "events";
  receivedAt?: number;
  replayable?: boolean;
  replayedAt?: number | null;
  type?: string;
}

async function insert(row: Row): Promise<string> {
  await env.DB.prepare(
    "INSERT INTO dead_letter (id, queue, origin_queue, type, attempts, received_at, body, replayable, replayed_at, discarded_at, error) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)"
  )
    .bind(
      row.id,
      row.origin === "events" ? "smog-dev-sponsorship-events-dlq" : EMAIL_DLQ,
      row.origin ?? "email",
      row.type ?? "transactional/welcome",
      row.attempts ?? 6,
      row.receivedAt ?? Date.now(),
      row.body,
      (row.replayable ?? row.body !== null) ? 1 : 0,
      row.replayedAt ?? null,
      row.discardedAt ?? null,
      row.error ?? null
    )
    .run();
  return row.id;
}

function welcomeBody(overrides: Record<string, unknown> = {}): string {
  return JSON.stringify({
    id: crypto.randomUUID(),
    idempotencyKey: `welcome:${crypto.randomUUID()}`,
    locale: "nl",
    props: { name: "Alex", url: "https://smog.example" },
    template: "transactional/welcome",
    to: ADDRESS,
    ...overrides,
  });
}

async function stored(id: string) {
  return await env.DB.prepare(
    "SELECT replayed_at AS replayedAt, discarded_at AS discardedAt FROM dead_letter WHERE id = ?"
  )
    .bind(id)
    .first<{ discardedAt: number | null; replayedAt: number | null }>();
}

let admin: Authed;

beforeEach(async () => {
  admin = await signedUp("admin");
  clearQueues();
  queueFaults.events = false;
  await env.DB.prepare("DELETE FROM dead_letter").run();
});

afterEach(() => {
  queueFaults.events = false;
  vi.restoreAllMocks();
});

interface PageOf {
  items: { id: string; queue: string; status: string; type: string }[];
  nextCursor: string | null;
}

describe("admin.deadLetters.list", () => {
  it("never returns a body, an address or a code, whatever is stored", async () => {
    await insert({ body: welcomeBody(), id: "dl-1" });
    await insert({
      body: JSON.stringify({ code: "482913", to: ADDRESS }),
      id: "dl-2",
      type: "auth/otp",
    });

    const page = await callAs<PageOf>(admin, "deadLetters.list", {});

    expect(page.items.map((item) => item.id).sort()).toEqual(["dl-1", "dl-2"]);
    for (const item of page.items) {
      expect(Object.keys(item).sort()).toEqual([
        "attempts",
        "discardedAt",
        "error",
        "id",
        "queue",
        "receivedAt",
        "replayable",
        "replayedAt",
        "status",
        "type",
      ]);
    }
    const json = JSON.stringify(page);
    expect(json).not.toContain(ADDRESS);
    expect(json).not.toContain("482913");
    expect(json).not.toContain("body");
  });

  it("filters by status (default open) and queue, newest first, with a keyset", async () => {
    const t = Date.now();
    await insert({ body: welcomeBody(), id: "a", receivedAt: t - 3000 });
    await insert({
      body: JSON.stringify({ paymentId: "p", type: "payment.settled" }),
      id: "b",
      origin: "events",
      receivedAt: t - 2000,
      type: "payment.settled",
    });
    await insert({
      body: welcomeBody(),
      id: "c",
      receivedAt: t - 1000,
      replayedAt: t,
    });
    await insert({ body: null, discardedAt: t, id: "d", receivedAt: t - 500 });

    const open = await callAs<PageOf>(admin, "deadLetters.list", {});
    expect(open.items.map((item) => item.id)).toEqual(["b", "a"]);
    const events = await callAs<PageOf>(admin, "deadLetters.list", {
      queue: "events",
    });
    expect(events.items.map((item) => item.id)).toEqual(["b"]);
    const replayed = await callAs<PageOf>(admin, "deadLetters.list", {
      status: "replayed",
    });
    expect(replayed.items.map((item) => [item.id, item.status])).toEqual([
      ["c", "replayed"],
    ]);
    const discarded = await callAs<PageOf>(admin, "deadLetters.list", {
      status: "discarded",
    });
    expect(discarded.items.map((item) => item.id)).toEqual(["d"]);

    const first = await callAs<PageOf>(admin, "deadLetters.list", { limit: 1 });
    expect(first.items.map((item) => item.id)).toEqual(["b"]);
    expect(first.nextCursor).not.toBeNull();
    const second = await callAs<PageOf>(admin, "deadLetters.list", {
      cursor: first.nextCursor,
      limit: 1,
    });
    expect(second.items.map((item) => item.id)).toEqual(["a"]);
    expect(second.nextCursor).toBeNull();
  });

  it("refuses a foreign cursor with VALIDATION", async () => {
    await expect(
      callAs(admin, "deadLetters.list", { cursor: "nonsense" })
    ).rejects.toMatchObject({ code: "VALIDATION" });
  });
});

describe("admin.deadLetters.replay", () => {
  it("puts an email back on its queue with its idempotency key, marks it replayed and audits it", async () => {
    const body = JSON.parse(welcomeBody());
    const id = await insert({ body: JSON.stringify(body), id: "dl-replay" });
    const mark = await auditMark();

    const result = await callAs<{ replayedAt: number }>(
      admin,
      "deadLetters.replay",
      { id }
    );

    expect(enqueued.emails).toHaveLength(1);
    expect(enqueued.emails[0]).toMatchObject({
      idempotencyKey: body.idempotencyKey,
      template: "transactional/welcome",
      to: ADDRESS,
    });
    expect(await stored(id)).toEqual({
      discardedAt: null,
      replayedAt: result.replayedAt,
    });
    await expectAudit("deadLetters.replay", {
      actorId: admin.user.id,
      data: { queue: "email", type: "transactional/welcome" },
      mark,
      targetId: id,
      targetType: "dead_letter",
    });
  });

  it("puts an event back on the events queue", async () => {
    const event = { paymentId: "p-9", type: "payment.settled" };
    const id = await insert({
      body: JSON.stringify(event),
      id: "dl-event",
      origin: "events",
      type: "payment.settled",
    });

    await callAs(admin, "deadLetters.replay", { id });

    expect(enqueued.events).toEqual([event]);
    expect(enqueued.emails).toEqual([]);
  });

  it("replayed twice is one effect: one message, one audit entry, the second refused", async () => {
    const id = await insert({ body: welcomeBody(), id: "dl-twice" });
    const mark = await auditMark();

    await callAs(admin, "deadLetters.replay", { id });
    await expect(
      callAs(admin, "deadLetters.replay", { id })
    ).rejects.toMatchObject({
      code: "INVALID_STATE",
      data: { reason: "alreadyHandled" },
    });

    expect(enqueued.emails).toHaveLength(1);
    expect(await auditRowsSince(mark)).toHaveLength(1);
  });

  it("two admins replaying at once: one claims it, and the consumer sends one email either way", async () => {
    const id = await insert({ body: welcomeBody(), id: "dl-race" });
    const mark = await auditMark();

    const outcomes = await Promise.allSettled([
      callAs(admin, "deadLetters.replay", { id }),
      callAs(admin, "deadLetters.replay", { id }),
    ]);

    expect(outcomes.filter((o) => o.status === "fulfilled")).toHaveLength(1);
    expect(await auditRowsSince(mark)).toHaveLength(1);
    // Both may have reached the queue; the idempotency key makes the second a no-op.
    expect(enqueued.emails.length).toBeGreaterThanOrEqual(1);
    const sender = new MemoryEmailSender();
    const deps = {
      env: {
        EMAIL_FROM: "SMOG & Co <noreply@smog.example>",
        EMAIL_REPLY_TO: "info@smog.example",
        SITE_URL: "https://smog.example",
      },
      kv: env.KV,
      sender,
    };
    vi.spyOn(console, "log").mockImplementation(() => undefined);
    for (const message of enqueued.emails) {
      // biome-ignore lint/performance/noAwaitInLoops: the consumer handles one message at a time.
      await processEmailMessage(
        { attempts: 1, body: message, id: message.id, timestamp: new Date() },
        deps as never
      );
    }
    expect(sender.sent).toHaveLength(1);
  });

  it("refuses a message without an idempotency key, even when it is marked replayable", async () => {
    const id = await insert({
      body: welcomeBody({ idempotencyKey: undefined }),
      id: "dl-nokey",
      replayable: true,
    });
    const mark = await auditMark();

    await expect(
      callAs(admin, "deadLetters.replay", { id })
    ).rejects.toMatchObject({
      code: "INVALID_STATE",
      data: { reason: "notReplayable" },
    });

    expect(enqueued.emails).toEqual([]);
    expect(await stored(id)).toEqual({ discardedAt: null, replayedAt: null });
    expect(await auditRowsSince(mark)).toEqual([]);
  });

  it("refuses a stored secret template, a missing body and a row flagged not replayable", async () => {
    const otp = await insert({
      body: welcomeBody({
        props: { code: "482913", minutes: 5 },
        template: "auth/otp",
      }),
      id: "dl-otp",
      replayable: true,
      type: "auth/otp",
    });
    const noBody = await insert({ body: null, id: "dl-nobody" });
    const flagged = await insert({
      body: welcomeBody(),
      id: "dl-flagged",
      replayable: false,
    });

    for (const id of [otp, noBody, flagged]) {
      // biome-ignore lint/performance/noAwaitInLoops: three small calls in order.
      await expect(
        callAs(admin, "deadLetters.replay", { id })
      ).rejects.toMatchObject({
        code: "INVALID_STATE",
        data: { reason: "notReplayable" },
      });
    }
    expect(enqueued.emails).toEqual([]);
  });

  it("refuses a message that was discarded, and an unknown one", async () => {
    const id = await insert({
      body: welcomeBody(),
      discardedAt: Date.now(),
      id: "dl-gone",
    });
    await expect(
      callAs(admin, "deadLetters.replay", { id })
    ).rejects.toMatchObject({
      code: "INVALID_STATE",
      data: { reason: "alreadyHandled" },
    });
    await expect(
      callAs(admin, "deadLetters.replay", { id: "nope" })
    ).rejects.toMatchObject({ code: "NOT_FOUND" });
  });

  it("changes nothing when the queue is down", async () => {
    vi.spyOn(console, "error").mockImplementation(() => undefined);
    queueFaults.events = true;
    const id = await insert({
      body: JSON.stringify({ paymentId: "p", type: "payment.settled" }),
      id: "dl-down",
      origin: "events",
      type: "payment.settled",
    });
    const mark = await auditMark();

    await expect(
      callAs(admin, "deadLetters.replay", { id })
    ).rejects.toBeDefined();

    expect(await stored(id)).toEqual({ discardedAt: null, replayedAt: null });
    expect(await auditRowsSince(mark)).toEqual([]);
  }, 20_000);

  it("is admin only", async () => {
    const user = await signedUp("user");
    await expect(
      callAs(user, "deadLetters.replay", { id: "x" })
    ).rejects.toMatchObject({ code: "FORBIDDEN" });
  });
});

describe("admin.deadLetters.discard", () => {
  it("discards an open message (a non-replayable one too) and audits it", async () => {
    const id = await insert({ body: null, id: "dl-discard", type: "auth/otp" });
    const mark = await auditMark();

    const result = await callAs<{ discardedAt: number }>(
      admin,
      "deadLetters.discard",
      { id }
    );

    expect(await stored(id)).toEqual({
      discardedAt: result.discardedAt,
      replayedAt: null,
    });
    expect(enqueued.emails).toEqual([]);
    await expectAudit("deadLetters.discard", {
      actorId: admin.user.id,
      data: { queue: "email", type: "auth/otp" },
      mark,
      targetId: id,
      targetType: "dead_letter",
    });
  });

  it("refuses a second discard and a discard after a replay", async () => {
    const first = await insert({ body: welcomeBody(), id: "dl-d1" });
    await callAs(admin, "deadLetters.discard", { id: first });
    await expect(
      callAs(admin, "deadLetters.discard", { id: first })
    ).rejects.toMatchObject({
      code: "INVALID_STATE",
      data: { reason: "alreadyHandled" },
    });

    const second = await insert({ body: welcomeBody(), id: "dl-d2" });
    await callAs(admin, "deadLetters.replay", { id: second });
    await expect(
      callAs(admin, "deadLetters.discard", { id: second })
    ).rejects.toMatchObject({
      code: "INVALID_STATE",
      data: { reason: "alreadyHandled" },
    });
    await expect(
      callAs(admin, "deadLetters.discard", { id: "nope" })
    ).rejects.toMatchObject({ code: "NOT_FOUND" });
  });

  it("the audit entry holds the queue and the type, never the stored body", async () => {
    const id = await insert({ body: welcomeBody(), id: "dl-audit" });
    const mark = await auditMark();
    await callAs(admin, "deadLetters.discard", { id });
    const rows = await auditRowsSince(mark);
    expect(JSON.stringify(rows)).not.toContain(ADDRESS);
  });
});
