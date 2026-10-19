import { env } from "cloudflare:workers";
import { afterEach, describe, expect, it, vi } from "vitest";
import {
  type EmailMessage,
  ENQUEUE_RETRY_DELAYS_MS,
  type EventMessage,
  enqueueEmail,
  enqueueEvent,
  QueueEmailOutbox,
  type QueueProducer,
} from "../src";

const EMAIL = {
  idempotencyKey: "welcome:u-1",
  locale: "nl",
  props: { name: "Alex", url: "https://smog.example" },
  template: "transactional/welcome",
  to: "alex@smog.example",
} as const;

const UUID = /^[0-9a-f-]{36}$/;

/** A queue that fails its first `failures` sends, and records the rest. */
function flakyQueue<T>(failures: number) {
  const sent: T[] = [];
  const options: unknown[] = [];
  let calls = 0;
  const queue: QueueProducer<T> = {
    send: (body, sendOptions) => {
      calls += 1;
      options.push(sendOptions);
      if (calls <= failures) {
        return Promise.reject(new Error(`queue down (${calls})`));
      }
      sent.push(body);
      return Promise.resolve();
    },
  };
  return { calls: () => calls, options, queue, sent };
}

const waits: number[] = [];
const sleep = (ms: number): Promise<void> => {
  waits.push(ms);
  return Promise.resolve();
};

afterEach(() => {
  waits.length = 0;
  vi.restoreAllMocks();
});

describe("enqueueEmail", () => {
  it("sends a validated message with a new id on the real queue binding", async () => {
    const message = await enqueueEmail(
      env.EMAIL_QUEUE as unknown as QueueProducer<EmailMessage>,
      EMAIL
    );
    expect(message?.id).toMatch(UUID);
    expect(message).toMatchObject(EMAIL);
  });

  it("retries 3 times, at 100, 400 and 1600 ms, then sends", async () => {
    expect(ENQUEUE_RETRY_DELAYS_MS).toEqual([100, 400, 1600]);
    const flaky = flakyQueue<EmailMessage>(3);
    const message = await enqueueEmail(flaky.queue, EMAIL, { sleep });
    expect(flaky.calls()).toBe(4);
    expect(waits).toEqual([100, 400, 1600]);
    expect(flaky.sent).toEqual([message]);
  });

  it("after the retries, logs `[jobs] Failed to enqueue <template>` and swallows by default", async () => {
    const log = vi.spyOn(console, "error").mockImplementation(() => undefined);
    const flaky = flakyQueue<EmailMessage>(10);
    expect(await enqueueEmail(flaky.queue, EMAIL, { sleep })).toBeNull();
    expect(flaky.calls()).toBe(4);
    expect(log).toHaveBeenCalledWith(
      "[jobs] Failed to enqueue transactional/welcome:",
      expect.any(Error)
    );
  });

  it("rethrows after the retries with onFailure: throw", async () => {
    vi.spyOn(console, "error").mockImplementation(() => undefined);
    const flaky = flakyQueue<EmailMessage>(10);
    await expect(
      enqueueEmail(flaky.queue, EMAIL, { onFailure: "throw", sleep })
    ).rejects.toThrow("queue down (4)");
  });

  it("refuses an invalid or oversized message without sending it", async () => {
    vi.spyOn(console, "error").mockImplementation(() => undefined);
    const flaky = flakyQueue<EmailMessage>(0);
    await expect(
      enqueueEmail(flaky.queue, { ...EMAIL, to: "nope" } as never, { sleep })
    ).rejects.toThrow("[jobs]");
    await expect(
      enqueueEmail(
        flaky.queue,
        {
          ...EMAIL,
          props: { name: "x".repeat(130 * 1024), url: "https://smog.example" },
        },
        { sleep }
      )
    ).rejects.toThrow("128 KB");
    expect(flaky.calls()).toBe(0);
  });
});

describe("the message format (M7)", () => {
  it("sends JSON, so the 128 KB guard measures what the queue stores", async () => {
    const emails = flakyQueue<EmailMessage>(0);
    await enqueueEmail(emails.queue, EMAIL, { sleep });
    const events = flakyQueue<EventMessage>(0);
    await enqueueEvent(
      events.queue,
      { paymentId: "p-1", type: "payment.settled" },
      { sleep }
    );
    expect([...emails.options, ...events.options]).toEqual([
      { contentType: "json" },
      { contentType: "json" },
    ]);
  });
});

describe("enqueueEvent", () => {
  it("sends an event on the real queue binding", async () => {
    const sent = await enqueueEvent(
      env.EVENTS_QUEUE as unknown as QueueProducer<EventMessage>,
      { paymentId: "p-1", type: "payment.settled" }
    );
    expect(sent).toBe(true);
  });

  it("retries, then logs `[jobs] Failed to enqueue <type>` (or throws for the webhook)", async () => {
    const log = vi.spyOn(console, "error").mockImplementation(() => undefined);
    const flaky = flakyQueue<EventMessage>(10);
    expect(
      await enqueueEvent(
        flaky.queue,
        { renderJobId: "r-1", type: "render.requested" },
        { sleep }
      )
    ).toBe(false);
    expect(log).toHaveBeenCalledWith(
      "[jobs] Failed to enqueue render.requested:",
      expect.any(Error)
    );
    await expect(
      enqueueEvent(
        flaky.queue,
        { paymentId: "p-1", type: "payment.settled" },
        { onFailure: "throw", sleep }
      )
    ).rejects.toThrow("queue down");
  });

  it("refuses an invalid event", async () => {
    vi.spyOn(console, "error").mockImplementation(() => undefined);
    const flaky = flakyQueue<EventMessage>(0);
    await expect(
      enqueueEvent(flaky.queue, { type: "payment.settled" } as never, { sleep })
    ).rejects.toThrow("[jobs]");
    expect(flaky.calls()).toBe(0);
  });
});

describe("QueueEmailOutbox", () => {
  it("puts each email on the queue and throws when the queue stays down", async () => {
    const ok = flakyQueue<EmailMessage>(0);
    await new QueueEmailOutbox(ok.queue, { sleep }).send(EMAIL);
    expect(ok.sent).toHaveLength(1);
    expect(ok.sent[0]).toMatchObject(EMAIL);

    vi.spyOn(console, "error").mockImplementation(() => undefined);
    const down = flakyQueue<EmailMessage>(10);
    await expect(
      new QueueEmailOutbox(down.queue, { sleep }).send(EMAIL)
    ).rejects.toThrow("queue down");
  });
});
