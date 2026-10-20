import { env } from "cloudflare:workers";
import type { EmailMessage, QueueProducer } from "@smog/jobs";
import { DAY_MS } from "@smog/utils";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  type DeadLetterDigestDeps,
  type DigestRecipient,
  runDeadLetterDigest,
} from "../src/server";
import { testDb } from "./helpers";
import { seedCheckout } from "./sponsorship-helpers";

/*
 * The daily dead-letter digest (phase 9 task 4, ruling 5): one
 * `admin_dead_letter` email per admin, at most once a day, only when there
 * is something to report; the KV marker is written after the enqueue
 * succeeded, so a failed send does not skip the day.
 */

const NOW = new Date("2026-10-20T03:15:00Z");
const ADMINS: DigestRecipient[] = [
  { email: "ada@smog.example", id: "admin-1", locale: "nl" },
  { email: "bo@smog.example", id: "admin-2", locale: "en" },
];

function kv(): KVNamespace {
  if (!env.KV) {
    throw new Error("[test] The KV binding is missing");
  }
  return env.KV;
}

function queue(sent: EmailMessage[], failAt = -1): QueueProducer<EmailMessage> {
  let calls = 0;
  return {
    send: (body) => {
      const call = calls;
      calls += 1;
      // From the `failAt`-th send on, every send fails (the producer retries).
      if (failAt >= 0 && call >= failAt) {
        return Promise.reject(new Error("EMAIL_QUEUE is down"));
      }
      sent.push(body);
      return Promise.resolve();
    },
  };
}

function deps(
  sent: EmailMessage[],
  overrides: Partial<DeadLetterDigestDeps> = {}
): DeadLetterDigestDeps {
  return {
    db: testDb(),
    kv: kv(),
    now: NOW,
    queue: queue(sent),
    recipients: () => Promise.resolve(ADMINS),
    siteUrl: "https://smog.example",
    ...overrides,
  };
}

async function openLetter(
  id: string,
  type = "transactional/welcome",
  origin: "email" | "events" = "email",
  state: { discardedAt?: number; replayedAt?: number } = {}
): Promise<void> {
  await env.DB.prepare(
    "INSERT INTO dead_letter (id, queue, origin_queue, type, attempts, received_at, body, replayable, replayed_at, discarded_at) VALUES (?, 'q', ?, ?, 6, ?, ?, 1, ?, ?)"
  )
    .bind(
      id,
      origin,
      type,
      NOW.getTime() - 1000,
      JSON.stringify({ to: "secret.recipient@smog.example" }),
      state.replayedAt ?? null,
      state.discardedAt ?? null
    )
    .run();
}

async function clean(): Promise<void> {
  await env.DB.prepare("DELETE FROM dead_letter").run();
  // Earlier tests' failed renders must not count in this one.
  await env.DB.prepare(
    "UPDATE sponsorship SET status = 'cancelled' WHERE status = 'render_failed'"
  ).run();
  const keys = [
    ...(await kv().list({ prefix: "dlq-lost:" })).keys,
    ...(await kv().list({ prefix: "dlq-digest:" })).keys,
  ];
  await Promise.all(keys.map((key) => kv().delete(key.name)));
}

beforeEach(async () => {
  await clean();
  vi.spyOn(console, "log").mockImplementation(() => undefined);
  vi.spyOn(console, "warn").mockImplementation(() => undefined);
  vi.spyOn(console, "error").mockImplementation(() => undefined);
});

afterEach(() => {
  vi.restoreAllMocks();
});

describe("runDeadLetterDigest", () => {
  it("sends nothing, and writes no marker, when nothing is wrong", async () => {
    const sent: EmailMessage[] = [];
    // Handled letters and a fresh render_failed do not count.
    await openLetter("dl-r", "transactional/welcome", "email", {
      replayedAt: 1,
    });
    await openLetter("dl-d", "transactional/welcome", "email", {
      discardedAt: 1,
    });
    await seedCheckout({
      createdAt: new Date(NOW.getTime() - DAY_MS + 60_000),
      status: "render_failed",
    });

    expect(await runDeadLetterDigest(deps(sent))).toEqual({ digestSent: 0 });

    expect(sent).toEqual([]);
    expect(await kv().get("dlq-digest:2026-10-20")).toBeNull();
  });

  it("sends one email per admin with counts and types only, then writes the marker", async () => {
    const sent: EmailMessage[] = [];
    await openLetter("dl-1", "transactional/welcome");
    await openLetter("dl-2", "transactional/welcome");
    await openLetter("dl-3", "payment.settled", "events");

    const result = await runDeadLetterDigest(deps(sent));

    expect(result).toEqual({ digestSent: 2 });
    expect(sent.map((message) => [message.to, message.locale])).toEqual([
      ["ada@smog.example", "nl"],
      ["bo@smog.example", "en"],
    ]);
    expect(sent.map((message) => message.idempotencyKey)).toEqual([
      "admin_dead_letter:2026-10-20:admin-1",
      "admin_dead_letter:2026-10-20:admin-2",
    ]);
    expect(sent[0]).toMatchObject({
      props: {
        emailOpen: 2,
        eventsOpen: 1,
        lost: 0,
        renderFailed: 0,
        types: [
          { count: 2, type: "transactional/welcome" },
          { count: 1, type: "payment.settled" },
        ],
        url: "https://smog.example/admin/dead-letters",
      },
      template: "transactional/admin-dead-letter",
    });
    // Counts and types only: nothing of a stored body.
    expect(JSON.stringify(sent)).not.toContain("secret.recipient");
    expect(await kv().get("dlq-digest:2026-10-20")).toBe("1");
  });

  it("sends once a day: a second run the same day does nothing, the next day sends again", async () => {
    const sent: EmailMessage[] = [];
    await openLetter("dl-1");

    await runDeadLetterDigest(deps(sent));
    const again = await runDeadLetterDigest(deps(sent));
    const tomorrow = await runDeadLetterDigest(
      deps(sent, { now: new Date(NOW.getTime() + DAY_MS) })
    );

    expect(again).toEqual({ digestSent: 0 });
    expect(tomorrow).toEqual({ digestSent: 2 });
    expect(sent).toHaveLength(4);
  });

  it("keeps a loss counted while the digest was being sent for the next report", async () => {
    const sent: EmailMessage[] = [];
    await kv().put("dlq-lost:2026-10-20", "2");
    // A late DLQ failure: the counter moves after the digest read it.
    const racing: QueueProducer<EmailMessage> = {
      send: async (body) => {
        await kv().put("dlq-lost:2026-10-20", "5");
        sent.push(body);
      },
    };

    await runDeadLetterDigest(deps(sent, { queue: racing }));

    expect(sent[0]).toMatchObject({ props: { lost: 2 } });
    // 5 counted, 2 reported: the 3 not yet reported stay.
    expect(await kv().get("dlq-lost:2026-10-20")).toBe("3");
    const next: EmailMessage[] = [];
    await runDeadLetterDigest(
      deps(next, { now: new Date(NOW.getTime() + DAY_MS) })
    );
    expect(next[0]).toMatchObject({ props: { lost: 3 } });
    expect(await kv().get("dlq-lost:2026-10-20")).toBeNull();
  });

  it("reports messages lost while D1 was down, once, and clears the counters", async () => {
    const sent: EmailMessage[] = [];
    await kv().put("dlq-lost:2026-10-19", "2");
    await kv().put("dlq-lost:2026-10-20", "1");

    const result = await runDeadLetterDigest(deps(sent));

    expect(result).toEqual({ digestSent: 2 });
    expect(sent[0]).toMatchObject({
      props: { emailOpen: 0, eventsOpen: 0, lost: 3, renderFailed: 0 },
    });
    expect(await kv().get("dlq-lost:2026-10-19")).toBeNull();
    expect(await kv().get("dlq-lost:2026-10-20")).toBeNull();
    // Reported: the next day has nothing to say.
    const next = await runDeadLetterDigest(
      deps(sent, { now: new Date(NOW.getTime() + DAY_MS) })
    );
    expect(next).toEqual({ digestSent: 0 });
  });

  it("reports a sponsorship that has been render_failed for more than 24 hours", async () => {
    const sent: EmailMessage[] = [];
    await seedCheckout({
      createdAt: new Date(NOW.getTime() - DAY_MS - 60_000),
      status: "render_failed",
    });

    await runDeadLetterDigest(deps(sent));

    expect(sent[0]).toMatchObject({
      props: { emailOpen: 0, eventsOpen: 0, lost: 0 },
    });
    const props = (sent[0]?.props ?? {}) as { renderFailed?: number };
    expect(props.renderFailed).toBeGreaterThanOrEqual(1);
  });

  it("does not write the marker when a send fails, so a re-run the same day sends again", async () => {
    const sent: EmailMessage[] = [];
    await openLetter("dl-1");

    await expect(
      runDeadLetterDigest(deps(sent, { queue: queue(sent, 1) }))
    ).rejects.toThrow("EMAIL_QUEUE is down");
    expect(await kv().get("dlq-digest:2026-10-20")).toBeNull();
    // The first admin was reached before the failure.
    expect(sent.map((message) => message.to)).toEqual(["ada@smog.example"]);

    const retry: EmailMessage[] = [];
    expect(await runDeadLetterDigest(deps(retry))).toEqual({ digestSent: 2 });
    expect(await kv().get("dlq-digest:2026-10-20")).toBe("1");
    // Same per-admin keys as the first run: the consumer drops the duplicate.
    expect(retry[0]?.idempotencyKey).toBe(sent[0]?.idempotencyKey);
  }, 20_000);

  it("waits for an admin to exist, and writes no marker meanwhile", async () => {
    const sent: EmailMessage[] = [];
    await openLetter("dl-1");

    const result = await runDeadLetterDigest(
      deps(sent, { recipients: () => Promise.resolve([]) })
    );

    expect(result).toEqual({ digestSent: 0 });
    expect(sent).toEqual([]);
    expect(await kv().get("dlq-digest:2026-10-20")).toBeNull();
  });

  it("gives the marker and the lost counter a TTL of three days", async () => {
    const put = vi.spyOn(kv(), "put");
    const sent: EmailMessage[] = [];
    await openLetter("dl-1");

    await runDeadLetterDigest(deps(sent));

    expect(put).toHaveBeenCalledWith("dlq-digest:2026-10-20", "1", {
      expirationTtl: 3 * 86_400,
    });
  });
});
