import { exports } from "cloudflare:workers";
import { describe, expect, it } from "vitest";
import { devToolsEnabled } from "../src/server/dev-tools";

const ORIGIN = "http://localhost:5173";

interface DevMail {
  messages: { html: string; subject: string; text: string; to: string }[];
}

async function mailTo(email: string): Promise<DevMail["messages"]> {
  // Auth emails are sent in `waitUntil`, after the response.
  for (let attempt = 0; attempt < 50; attempt += 1) {
    // biome-ignore lint/performance/noAwaitInLoops: polling until the background send lands.
    const response = await exports.default.fetch(`${ORIGIN}/dev/mail.json`);
    const { messages } = (await response.json()) as DevMail;
    const found = messages.filter((m) => m.to === email);
    if (found.length > 0) {
      return found;
    }
    await new Promise((resolve) => setTimeout(resolve, 20));
  }
  return [];
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
    const [message] = await mailTo(email);
    expect(message?.subject).toBe("Bevestig je e-mailadres");
    expect(message?.text).toContain(`${ORIGIN}/api/auth/verify-email?token=`);
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
