import { afterEach, describe, expect, it, vi } from "vitest";
import {
  type EmailMessage,
  type EventMessage,
  enqueueOutputs,
  type QueueProducer,
} from "../src";

afterEach(() => {
  vi.restoreAllMocks();
});

const EMAIL = {
  idempotencyKey: "welcome:u-1",
  locale: "nl",
  props: { name: "Alex", url: "https://smog.example" },
  template: "transactional/welcome",
  to: "alex@smog.example",
} as const;

const EVENT: EventMessage = { paymentId: "p-1", type: "payment.settled" };

function queue<T>({ fail = false } = {}) {
  const sent: T[] = [];
  const producer: QueueProducer<T> = {
    send: (body) => {
      if (fail) {
        return Promise.reject(new Error("down"));
      }
      sent.push(body);
      return Promise.resolve();
    },
  };
  return { producer, sent };
}

const noWait = { sleep: () => Promise.resolve() };

describe("enqueueOutputs", () => {
  it("puts the events and then the emails on their queues", async () => {
    const email = queue<EmailMessage>();
    const events = queue<EventMessage>();
    expect(
      await enqueueOutputs(
        { email: email.producer, events: events.producer },
        { events: [EVENT], notify: [EMAIL] }
      )
    ).toBe(true);
    expect(events.sent).toEqual([EVENT]);
    expect(email.sent).toEqual([expect.objectContaining(EMAIL)]);
  });

  it("throws in throw mode when a queue stays down or is not bound", async () => {
    vi.spyOn(console, "error").mockImplementation(() => undefined);
    const down = queue<EmailMessage>({ fail: true });
    const events = queue<EventMessage>();
    await expect(
      enqueueOutputs(
        { email: down.producer, events: events.producer },
        { events: [EVENT], notify: [EMAIL] },
        { ...noWait, onFailure: "throw" }
      )
    ).rejects.toThrow("down");
    // The events went out before the email failed (a partial failure).
    expect(events.sent).toEqual([EVENT]);
    await expect(
      enqueueOutputs(
        {},
        { events: [EVENT], notify: [] },
        { onFailure: "throw" }
      )
    ).rejects.toThrow("[jobs] The EVENTS_QUEUE binding is missing");
  });

  it("logs and answers false in the default mode", async () => {
    const error = vi
      .spyOn(console, "error")
      .mockImplementation(() => undefined);
    const down = queue<EventMessage>({ fail: true });
    expect(
      await enqueueOutputs(
        { events: down.producer },
        { events: [EVENT], notify: [EMAIL] },
        noWait
      )
    ).toBe(false);
    expect(error).toHaveBeenCalledWith(
      "[jobs] The EMAIL_QUEUE binding is missing"
    );
  });

  it("drops an invalid email, logged, and still enqueues the others, even in throw mode (fix wave, jobs M-1)", async () => {
    const error = vi
      .spyOn(console, "error")
      .mockImplementation(() => undefined);
    const email = queue<EmailMessage>();
    const events = queue<EventMessage>();
    const bad = { ...EMAIL, idempotencyKey: "welcome:u-2", to: "not-an-email" };
    const good = { ...EMAIL, idempotencyKey: "welcome:u-3" };
    for (const onFailure of ["log", "throw"] as const) {
      email.sent.length = 0;
      // biome-ignore lint/performance/noAwaitInLoops: one mode after the other.
      const all = await enqueueOutputs(
        { email: email.producer, events: events.producer },
        { events: [EVENT], notify: [EMAIL, bad, good] },
        { ...noWait, onFailure }
      );
      expect(all).toBe(false);
      expect(email.sent.map((m) => m.idempotencyKey)).toEqual([
        "welcome:u-1",
        "welcome:u-3",
      ]);
    }
    expect(error).toHaveBeenCalledWith(
      "[jobs] Dropped an invalid transactional/welcome message"
    );
  });

  it("does nothing for empty outputs, bound queues or not", async () => {
    expect(await enqueueOutputs({}, { events: [], notify: [] })).toBe(true);
  });
});
