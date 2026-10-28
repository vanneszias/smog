import { describe, expect, it } from "vitest";
import {
  countLost,
  deadLetterOrigin,
  digestMarkerKey,
  lostCounterKey,
  toDeadLetter,
  toReplayMessage,
} from "../../../../../jobs/src/index";

const EMAIL_DLQ = "smog-staging-email-dlq";
const EVENTS_DLQ = "smog-staging-sponsorship-events-dlq";

function welcome(overrides: Record<string, unknown> = {}) {
  return {
    id: crypto.randomUUID(),
    idempotencyKey: "welcome:u-1",
    locale: "nl",
    props: { name: "Alex", url: "https://smog.example" },
    template: "transactional/welcome",
    to: "alex@smog.example",
    ...overrides,
  };
}

describe("deadLetterOrigin", () => {
  it("names the two DLQs by suffix, whatever the env, and nothing else", () => {
    expect(deadLetterOrigin("smog-dev-email-dlq")).toBe("email");
    expect(deadLetterOrigin("smog-production-sponsorship-events-dlq")).toBe(
      "events"
    );
    expect(deadLetterOrigin("smog-dev-email")).toBeNull();
    expect(deadLetterOrigin("smog-dev-sponsorship-events")).toBeNull();
    expect(deadLetterOrigin("other-dlq")).toBeNull();
  });
});

describe("toDeadLetter", () => {
  it("keeps a keyed, secret-free email's body", () => {
    const body = welcome();
    const record = toDeadLetter(EMAIL_DLQ, { attempts: 6, body, id: "m" });
    expect(record).toMatchObject({
      attempts: 6,
      error: null,
      id: "m",
      originQueue: "email",
      queue: EMAIL_DLQ,
      replayable: true,
      type: "transactional/welcome",
    });
    expect(JSON.parse(record?.body ?? "null")).toEqual(body);
  });

  it("drops the body of a secret template, a key-less email and an invalid message", () => {
    const secret = toDeadLetter(EMAIL_DLQ, {
      attempts: 1,
      body: welcome({
        props: { code: "123456", minutes: 5 },
        template: "auth/otp",
      }),
      id: "a",
    });
    const keyless = toDeadLetter(EMAIL_DLQ, {
      attempts: 1,
      body: welcome({ idempotencyKey: undefined }),
      id: "b",
    });
    const invalid = toDeadLetter(EMAIL_DLQ, {
      attempts: 1,
      body: { to: "x" },
      id: "c",
    });
    expect(
      [secret, keyless, invalid].map((r) => [r?.body, r?.error, r?.replayable])
    ).toEqual([
      [null, "secret_template", false],
      [null, "no_idempotency_key", false],
      [null, "invalid_message", false],
    ]);
  });

  it("is null for a queue that is not a DLQ", () => {
    expect(
      toDeadLetter("smog-staging-email", { attempts: 1, body: {}, id: "x" })
    ).toBeNull();
  });

  it("stores an event with its ids", () => {
    const record = toDeadLetter(EVENTS_DLQ, {
      attempts: 11,
      body: { renderJobId: "j-1", type: "render.requested" },
      id: "e",
    });
    expect(record).toMatchObject({
      replayable: true,
      type: "render.requested",
    });
  });
});

describe("toReplayMessage", () => {
  it("returns the email without its old id, for a keyed message", () => {
    const replay = toReplayMessage("email", JSON.stringify(welcome()));
    expect(replay.kind).toBe("email");
    if (replay.kind === "email") {
      expect(replay.email).not.toHaveProperty("id");
      expect(replay.email.idempotencyKey).toBe("welcome:u-1");
    }
  });

  it("refuses a message without an idempotency key", () => {
    expect(
      toReplayMessage(
        "email",
        JSON.stringify(welcome({ idempotencyKey: undefined }))
      )
    ).toEqual({ kind: "refused", reason: "no_idempotency_key" });
  });

  it("refuses a secret template, even if one was stored", () => {
    expect(
      toReplayMessage(
        "email",
        JSON.stringify(
          welcome({ props: { code: "1", minutes: 5 }, template: "auth/otp" })
        )
      )
    ).toEqual({ kind: "refused", reason: "secret_template" });
  });

  it("refuses no body and a broken body", () => {
    expect(toReplayMessage("email", null)).toEqual({
      kind: "refused",
      reason: "no_body",
    });
    expect(toReplayMessage("email", "{")).toEqual({
      kind: "refused",
      reason: "invalid_message",
    });
    expect(toReplayMessage("events", JSON.stringify({ type: "nope" }))).toEqual(
      {
        kind: "refused",
        reason: "invalid_message",
      }
    );
  });

  it("returns an event as it is", () => {
    expect(
      toReplayMessage(
        "events",
        JSON.stringify({ paymentId: "p-1", type: "payment.settled" })
      )
    ).toEqual({
      event: { paymentId: "p-1", type: "payment.settled" },
      kind: "event",
    });
  });
});

describe("the loss counter", () => {
  it("counts per UTC day, with a TTL, and never throws", async () => {
    const store = new Map<string, { ttl: number; value: string }>();
    const kv = {
      get: (key: string) => Promise.resolve(store.get(key)?.value ?? null),
      put: (key: string, value: string, options: { expirationTtl: number }) => {
        store.set(key, { ttl: options.expirationTtl, value });
        return Promise.resolve();
      },
    };
    const now = new Date("2026-10-20T23:59:59Z");
    await countLost(kv, now);
    await countLost(kv, now);
    expect(store.get("dlq-lost:2026-10-20")).toEqual({
      ttl: 3 * 86_400,
      value: "2",
    });
    expect(lostCounterKey(now)).toBe("dlq-lost:2026-10-20");
    expect(digestMarkerKey(now)).toBe("dlq-digest:2026-10-20");
    await expect(
      countLost(
        {
          get: () => Promise.reject(new Error("KV down")),
          put: () => Promise.reject(new Error("KV down")),
        },
        now
      )
    ).resolves.toBeUndefined();
  });
});
