import { afterEach, describe, expect, it, vi } from "vitest";
import {
  DirectEmailOutbox,
  deliverEmail,
  type EmailSender,
  MemoryEmailSender,
} from "../src";

const ENV = {
  EMAIL_FROM: "SMOG & Co <noreply@smog.example>",
  EMAIL_REPLY_TO: "info@smog.example",
  SITE_URL: "https://smog.example",
};

afterEach(() => {
  vi.restoreAllMocks();
});

describe("DirectEmailOutbox", () => {
  it("renders in the email's locale and sends with From and Reply-To from env", async () => {
    const sender = new MemoryEmailSender();
    const outbox = new DirectEmailOutbox(sender, ENV);

    await outbox.send({
      idempotencyKey: "welcome:u-1",
      locale: "en",
      props: { name: "Alex", url: ENV.SITE_URL },
      template: "transactional/welcome",
      to: "alex@smog.example",
    });

    expect(sender.sent).toHaveLength(1);
    const [message] = sender.sent;
    expect(message?.from).toBe(ENV.EMAIL_FROM);
    expect(message?.replyTo).toBe(ENV.EMAIL_REPLY_TO);
    expect(message?.to).toBe("alex@smog.example");
    expect(message?.subject).toBe("Welcome to SMOG & Co");
    expect(message?.html).toContain(`${ENV.SITE_URL}/brand/email-logo.png`);
  });

  it("logs and rethrows a failed send", async () => {
    const error = vi
      .spyOn(console, "error")
      .mockImplementation(() => undefined);
    const failing: EmailSender = {
      send: () => Promise.reject(new Error("binding down")),
    };

    await expect(
      deliverEmail(failing, {
        email: {
          locale: "nl",
          props: { code: "482913", minutes: 5 },
          template: "auth/otp",
          to: "alex@smog.example",
        },
        env: ENV,
      })
    ).rejects.toThrow("binding down");
    expect(error).toHaveBeenCalledWith(
      "[email] Failed to send auth/otp:",
      expect.any(Error)
    );
  });
});
