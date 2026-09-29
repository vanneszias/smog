import { env } from "cloudflare:workers";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  CloudflareEmailSender,
  createEmailSender,
  DEV_MAIL_KEY,
  DEV_MAIL_LIMIT,
  DevEmailSender,
  type EmailMessage,
  MemoryEmailSender,
  readDevMail,
  sendEmail,
} from "../src";

function message(overrides: Partial<EmailMessage> = {}): EmailMessage {
  return {
    from: "SMOG & Co <noreply@smog.vlaanderen>",
    html: "<p>Hi</p>",
    subject: "Hello",
    text: "Hi",
    to: "a@b.test",
    ...overrides,
  };
}

beforeEach(async () => {
  await env.KV.delete(DEV_MAIL_KEY);
});

afterEach(() => {
  vi.restoreAllMocks();
});

describe("MemoryEmailSender", () => {
  it("records every message in order", async () => {
    const sender = new MemoryEmailSender();
    await sender.send(message({ to: "one@b.test" }));
    await sender.send(message({ to: "two@b.test" }));

    expect(sender.sent.map((m) => m.to)).toEqual(["one@b.test", "two@b.test"]);
  });
});

describe("DevEmailSender", () => {
  it("logs the message and stores it in KV, newest first", async () => {
    const log = vi.spyOn(console, "log").mockImplementation(() => undefined);
    const sender = new DevEmailSender(env.KV);

    await sender.send(message({ subject: "First" }));
    await sender.send(message({ subject: "Second" }));

    const mail = await readDevMail(env.KV);
    expect(mail.map((m) => m.subject)).toEqual(["Second", "First"]);
    expect(mail[0]?.sentAt).toEqual(expect.any(Number));
    expect(log).toHaveBeenCalledWith(
      expect.stringContaining("[email] a@b.test: Second")
    );
  });

  it(`keeps only the latest ${DEV_MAIL_LIMIT} messages`, async () => {
    vi.spyOn(console, "log").mockImplementation(() => undefined);
    const sender = new DevEmailSender(env.KV);

    for (let i = 0; i < DEV_MAIL_LIMIT + 5; i += 1) {
      // biome-ignore lint/performance/noAwaitInLoops: the mailbox is read-modify-write, so sends run in order.
      await sender.send(message({ subject: `m${i}` }));
    }

    const mail = await readDevMail(env.KV);
    expect(mail).toHaveLength(DEV_MAIL_LIMIT);
    expect(mail[0]?.subject).toBe(`m${DEV_MAIL_LIMIT + 4}`);
    expect(mail.at(-1)?.subject).toBe("m5");
  });

  it("reads an empty list when nothing was sent", async () => {
    expect(await readDevMail(env.KV)).toEqual([]);
  });
});

describe("CloudflareEmailSender", () => {
  it("sends through the send_email binding with a parsed From address", async () => {
    const send = vi.fn(async () => ({ messageId: "m-1" }));
    const sender = new CloudflareEmailSender({ send });

    await sender.send(message({ replyTo: "info@smog.vlaanderen" }));

    expect(send).toHaveBeenCalledWith({
      from: { email: "noreply@smog.vlaanderen", name: "SMOG & Co" },
      html: "<p>Hi</p>",
      replyTo: "info@smog.vlaanderen",
      subject: "Hello",
      text: "Hi",
      to: "a@b.test",
    });
  });

  it("passes a bare From address through and rethrows binding errors", async () => {
    vi.spyOn(console, "error").mockImplementation(() => undefined);
    const send = vi.fn(() =>
      Promise.reject(new Error("E_SENDER_NOT_VERIFIED"))
    );
    const sender = new CloudflareEmailSender({ send });

    await expect(
      sender.send(message({ from: "noreply@smog.vlaanderen" }))
    ).rejects.toThrow("E_SENDER_NOT_VERIFIED");
    expect(send).toHaveBeenCalledWith(
      expect.objectContaining({ from: "noreply@smog.vlaanderen" })
    );
  });
});

describe("createEmailSender", () => {
  it("uses the dev sender in dev and the binding elsewhere", () => {
    const binding = { send: vi.fn() };
    expect(
      createEmailSender({ binding, environment: "dev", kv: env.KV })
    ).toBeInstanceOf(DevEmailSender);
    expect(
      createEmailSender({ binding, environment: "staging", kv: env.KV })
    ).toBeInstanceOf(CloudflareEmailSender);
    expect(
      createEmailSender({ binding, environment: "production", kv: env.KV })
    ).toBeInstanceOf(CloudflareEmailSender);
  });

  it("fails when staging or production has no EMAIL binding", () => {
    expect(() =>
      createEmailSender({ environment: "production", kv: env.KV })
    ).toThrow("EMAIL");
  });
});

describe("sendEmail", () => {
  it("renders the template in the locale and sends it", async () => {
    const sender = new MemoryEmailSender();

    await sendEmail(sender, {
      from: "SMOG & Co <noreply@smog.vlaanderen>",
      locale: "en",
      props: { code: "123456", minutes: 5 },
      replyTo: "info@smog.vlaanderen",
      template: "auth/otp",
      to: "a@b.test",
    });

    expect(sender.sent).toHaveLength(1);
    const [sent] = sender.sent;
    expect(sent?.subject).toBe("123456 is your SMOG & Co code");
    expect(sent?.replyTo).toBe("info@smog.vlaanderen");
    expect(sent?.to).toBe("a@b.test");
    expect(sent?.text).toContain("123456");
  });
});
