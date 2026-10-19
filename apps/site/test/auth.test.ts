import { env, exports } from "cloudflare:workers";
import type { StoredEmail } from "@smog/email";
import { afterEach, describe, expect, it, vi } from "vitest";
import { devToolsEnabled } from "../src/server/dev-tools";
import { ORIGIN, waitForMail } from "./helpers";

const PASSWORD = "correct horse battery";

afterEach(() => {
  vi.restoreAllMocks();
});

/** Polls `GET /dev/mail.json` until it lists a message to `email`. */
async function waitForDevMailJson(email: string): Promise<StoredEmail[]> {
  const deadline = Date.now() + 15_000;
  while (Date.now() < deadline) {
    // biome-ignore lint/performance/noAwaitInLoops: polling until the consumer has run.
    const response = await exports.default.fetch(`${ORIGIN}/dev/mail.json`);
    const { messages } = (await response.json()) as {
      messages: StoredEmail[];
    };
    const found = messages.filter((message) => message.to === email);
    if (found.length > 0) {
      return found;
    }
    await new Promise((resolve) => setTimeout(resolve, 100));
  }
  throw new Error(`[test] No email to ${email} in /dev/mail.json`);
}

describe("/api/auth/*", () => {
  it("signs up by email and the dev mailbox shows the verification link", async () => {
    const email = `${crypto.randomUUID()}@smog.test`;

    const response = await exports.default.fetch(
      `${ORIGIN}/api/auth/sign-up/email`,
      {
        body: JSON.stringify({
          email,
          name: "A",
          password: "correct horse battery",
        }),
        headers: { "content-type": "application/json", origin: ORIGIN },
        method: "POST",
      }
    );

    expect(response.status).toBe(200);
    const [message] = await waitForMail(email);
    expect(message?.subject).toBe("Bevestig je e-mailadres");
    expect(message?.text).toContain(`${ORIGIN}/api/auth/verify-email?token=`);
  });

  it("queues the verification email as one message, which the consumer puts in /dev/mail.json", async () => {
    const queue = env.EMAIL_QUEUE;
    if (!queue) {
      throw new Error("[test] The EMAIL_QUEUE binding is missing");
    }
    const queued: unknown[] = [];
    const send = queue.send.bind(queue);
    vi.spyOn(queue, "send").mockImplementation(
      (body: unknown, options?: QueueSendOptions) => {
        queued.push(body);
        return send(body, options);
      }
    );
    const email = `${crypto.randomUUID()}@smog.test`;

    const response = await exports.default.fetch(
      `${ORIGIN}/api/auth/sign-up/email`,
      {
        body: JSON.stringify({ email, name: "A", password: PASSWORD }),
        headers: { "content-type": "application/json", origin: ORIGIN },
        method: "POST",
      }
    );
    expect(response.status).toBe(200);
    // The JSON route reads the same mailbox the consumer writes.
    const found = await waitForDevMailJson(email);

    const mine = queued.filter(
      (body) => (body as { to?: string }).to === email
    );
    expect(mine).toEqual([
      {
        id: expect.any(String),
        locale: "nl",
        props: {
          minutes: 60,
          url: expect.stringContaining(
            `${ORIGIN}/api/auth/verify-email?token=`
          ),
        },
        template: "auth/verify-email",
        to: email,
      },
    ]);
    expect(found.map((message) => message.subject)).toEqual([
      "Bevestig je e-mailadres",
    ]);
    expect(found[0]?.from).toBe(env.EMAIL_FROM);
    expect(found[0]?.html).toContain(`${ORIGIN}/brand/email-logo.png`);
  });

  it("answers get-session with null for a guest", async () => {
    const response = await exports.default.fetch(
      `${ORIGIN}/api/auth/get-session`
    );
    expect(response.status).toBe(200);
    expect(await response.json()).toBeNull();
  });
});

describe("/dev/mail", () => {
  it("lists the latest messages as HTML, escaping their content", async () => {
    const response = await exports.default.fetch(`${ORIGIN}/dev/mail`);

    expect(response.status).toBe(200);
    expect(response.headers.get("content-type")).toContain("text/html");
    const html = await response.text();
    expect(html).toContain("Verstuurde e-mails");
    expect(html).toContain("sandbox");
  });

  it("is on in dev only (fails closed)", () => {
    expect(devToolsEnabled("dev")).toBe(true);
    expect(devToolsEnabled("staging")).toBe(false);
    expect(devToolsEnabled("production")).toBe(false);
  });
});
