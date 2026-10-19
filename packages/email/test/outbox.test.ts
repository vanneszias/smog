import { afterEach, describe, expect, it, vi } from "vitest";
import {
  DirectEmailOutbox,
  deliverEmail,
  type EmailSender,
  isPermanentSendError,
  MemoryEmailSender,
  sendErrorCode,
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

  it("rethrows a failed send without logging it (the caller logs once)", async () => {
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
    expect(error).not.toHaveBeenCalled();
  });
});

describe("isPermanentSendError", () => {
  const coded = (code: string) =>
    Object.assign(new Error(`refused a@smog.example (${code})`), { code });

  it("is true for payload and recipient errors only", () => {
    for (const code of [
      "E_RECIPIENT_SUPPRESSED",
      "E_RECIPIENT_NOT_ALLOWED",
      "E_VALIDATION_ERROR",
      "E_CONTENT_TOO_LARGE",
      "E_HEADER_NOT_ALLOWED",
    ]) {
      expect(isPermanentSendError(coded(code)), code).toBe(true);
    }
    for (const code of [
      "E_SENDER_NOT_VERIFIED",
      "E_SENDER_DOMAIN_NOT_AVAILABLE",
      "E_RATE_LIMIT_EXCEEDED",
      "E_DAILY_LIMIT_EXCEEDED",
      "E_DELIVERY_FAILED",
      "E_INTERNAL_SERVER_ERROR",
    ]) {
      expect(isPermanentSendError(coded(code)), code).toBe(false);
    }
    expect(isPermanentSendError(new Error("network"))).toBe(false);
    expect(sendErrorCode(coded("E_RECIPIENT_SUPPRESSED"))).toBe(
      "E_RECIPIENT_SUPPRESSED"
    );
    expect(sendErrorCode("nope")).toBeNull();
  });
});
