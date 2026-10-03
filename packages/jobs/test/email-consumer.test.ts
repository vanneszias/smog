import { env } from "cloudflare:workers";
import {
  DEV_MAIL_KEY,
  DevEmailSender,
  type EmailSender,
  MemoryEmailSender,
  readDevMail,
} from "@smog/email";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  EMAIL_SENT_TTL_SECONDS,
  type EmailMessage,
  emailRetryDelaySeconds,
  emailSentKey,
  processEmailMessage,
} from "../src";

const SEND_FAILED =
  /^\[email\] Failed to send transactional\/welcome \(message .+, attempt 3\); retrying in 120 s:$/;
const MARK_FAILED = /^\[email\] Failed to mark /;
const DROPPED_INVALID = /^\[email\] Dropped an invalid message /;
const DROPPED_UNRENDERABLE =
  /^\[email\] Dropped transactional\/payment-confirmed \(message .+\): it cannot be rendered$/;

const DELIVERY_ENV = {
  EMAIL_FROM: "SMOG & Co <noreply@smog.example>",
  EMAIL_REPLY_TO: "info@smog.example",
  SITE_URL: "https://smog.example",
};

function welcome(overrides: Partial<EmailMessage> = {}): EmailMessage {
  return {
    id: crypto.randomUUID(),
    idempotencyKey: `welcome:${crypto.randomUUID()}`,
    locale: "en",
    props: { name: "Alex", url: DELIVERY_ENV.SITE_URL },
    template: "transactional/welcome",
    to: "alex@smog.example",
    ...overrides,
  } as EmailMessage;
}

function delivery(body: unknown, attempts = 1) {
  return { attempts, body, id: crypto.randomUUID() };
}

function deps(sender: EmailSender) {
  return { env: DELIVERY_ENV, kv: env.KV, sender };
}

beforeEach(async () => {
  await env.KV.delete(DEV_MAIL_KEY);
});

afterEach(() => {
  vi.restoreAllMocks();
});

describe("emailRetryDelaySeconds", () => {
  it("doubles from 30 s per attempt and stops at an hour", () => {
    expect([1, 2, 3, 4, 5, 6, 7, 8, 9].map(emailRetryDelaySeconds)).toEqual([
      30, 60, 120, 240, 480, 960, 1920, 3600, 3600,
    ]);
  });
});

describe("processEmailMessage", () => {
  it("sends a keyed message once, however often it is delivered", async () => {
    const sender = new MemoryEmailSender();
    const body = welcome();

    const first = await processEmailMessage(delivery(body), deps(sender));
    const second = await processEmailMessage(delivery(body, 2), deps(sender));

    expect(first).toEqual({ action: "ack", outcome: "sent" });
    expect(second).toEqual({ action: "ack", outcome: "duplicate" });
    expect(sender.sent).toHaveLength(1);
    const [message] = sender.sent;
    expect(message?.subject).toBe("Welcome to SMOG & Co");
    expect(message?.from).toBe(DELIVERY_ENV.EMAIL_FROM);
    expect(message?.replyTo).toBe(DELIVERY_ENV.EMAIL_REPLY_TO);
    expect(message?.to).toBe("alex@smog.example");
  });

  it("marks a sent key in KV for 7 days", async () => {
    const body = welcome();
    const before = Math.floor(Date.now() / 1000);

    await processEmailMessage(delivery(body), deps(new MemoryEmailSender()));

    const key = emailSentKey(body.idempotencyKey ?? "");
    expect(key).toBe(`email:sent:${body.idempotencyKey}`);
    const { keys } = await env.KV.list({ prefix: key });
    expect(keys).toHaveLength(1);
    expect(keys[0]?.expiration).toBeGreaterThanOrEqual(
      before + EMAIL_SENT_TTL_SECONDS
    );
    expect(EMAIL_SENT_TTL_SECONDS).toBe(7 * 24 * 60 * 60);
  });

  it("sends a message without a key every time (auth emails)", async () => {
    const sender = new MemoryEmailSender();
    const body = welcome({
      idempotencyKey: undefined,
      props: { code: "482913", minutes: 5 },
      template: "auth/otp",
    } as Partial<EmailMessage>);

    await processEmailMessage(delivery(body), deps(sender));
    await processEmailMessage(delivery(body), deps(sender));

    expect(sender.sent.map((message) => message.subject)).toEqual([
      "482913 is your SMOG & Co code",
      "482913 is your SMOG & Co code",
    ]);
  });

  it("retries a failed send with backoff and marks nothing", async () => {
    const error = vi
      .spyOn(console, "error")
      .mockImplementation(() => undefined);
    const failing: EmailSender = {
      send: () => Promise.reject(new Error("binding down")),
    };
    const body = welcome();

    const first = await processEmailMessage(delivery(body, 1), deps(failing));
    const third = await processEmailMessage(delivery(body, 3), deps(failing));

    expect(first).toEqual({ action: "retry", delaySeconds: 30 });
    expect(third).toEqual({ action: "retry", delaySeconds: 120 });
    expect(
      await env.KV.get(emailSentKey(body.idempotencyKey ?? ""))
    ).toBeNull();
    expect(error).toHaveBeenCalledWith(
      expect.stringMatching(SEND_FAILED),
      expect.any(Error)
    );
  });

  it("retries when the idempotency check cannot read KV", async () => {
    vi.spyOn(console, "error").mockImplementation(() => undefined);
    const sender = new MemoryEmailSender();
    const kv = {
      get: () => Promise.reject(new Error("KV down")),
      put: () => Promise.resolve(),
    };

    const decision = await processEmailMessage(delivery(welcome()), {
      env: DELIVERY_ENV,
      kv,
      sender,
    });

    expect(decision).toEqual({ action: "retry", delaySeconds: 30 });
    expect(sender.sent).toEqual([]);
  });

  it("acks after a send when only the marker could not be written", async () => {
    const error = vi
      .spyOn(console, "error")
      .mockImplementation(() => undefined);
    const sender = new MemoryEmailSender();
    const kv = {
      get: () => Promise.resolve(null),
      put: () => Promise.reject(new Error("KV down")),
    };

    const decision = await processEmailMessage(delivery(welcome()), {
      env: DELIVERY_ENV,
      kv,
      sender,
    });

    expect(decision).toEqual({ action: "ack", outcome: "sent" });
    expect(sender.sent).toHaveLength(1);
    expect(error).toHaveBeenCalledWith(
      expect.stringMatching(MARK_FAILED),
      expect.any(Error)
    );
  });

  it.each([
    ["not an object", "hello"],
    ["an unknown template", { ...welcome(), template: "transactional/nope" }],
    ["a bad address", { ...welcome(), to: "not-an-address" }],
    ["a bad locale", { ...welcome(), locale: "de" }],
  ])(
    "acks an invalid message (%s) without sending or retrying",
    async (_name, body) => {
      const error = vi
        .spyOn(console, "error")
        .mockImplementation(() => undefined);
      const sender = new MemoryEmailSender();

      const decision = await processEmailMessage(
        delivery(body, 1),
        deps(sender)
      );

      expect(decision).toEqual({ action: "ack", outcome: "invalid" });
      expect(sender.sent).toEqual([]);
      expect(error).toHaveBeenCalledWith(
        expect.stringMatching(DROPPED_INVALID)
      );
    }
  );

  it("acks a message whose props cannot be rendered (retrying cannot help)", async () => {
    const error = vi
      .spyOn(console, "error")
      .mockImplementation(() => undefined);
    const sender = new MemoryEmailSender();
    const body = welcome({
      props: {},
      template: "transactional/payment-confirmed",
    } as Partial<EmailMessage>);

    const decision = await processEmailMessage(delivery(body), deps(sender));

    expect(decision).toEqual({ action: "ack", outcome: "unrenderable" });
    expect(sender.sent).toEqual([]);
    expect(error).toHaveBeenCalledWith(
      expect.stringMatching(DROPPED_UNRENDERABLE),
      expect.any(Error)
    );
  });

  it("puts the email in the dev mailbox in dev (DevEmailSender)", async () => {
    vi.spyOn(console, "log").mockImplementation(() => undefined);
    const body = welcome({ locale: "nl" });

    await processEmailMessage(delivery(body), deps(new DevEmailSender(env.KV)));

    const [stored] = await readDevMail(env.KV);
    expect(stored?.to).toBe("alex@smog.example");
    expect(stored?.subject).toBe("Welkom bij SMOG & Co");
    expect(stored?.html).toContain(
      `${DELIVERY_ENV.SITE_URL}/brand/email-logo.png`
    );
  });
});
