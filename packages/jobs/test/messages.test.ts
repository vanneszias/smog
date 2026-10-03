import { describe, expect, it } from "vitest";
import {
  EMAIL_IDEMPOTENCY_KEY_MAX,
  EMAIL_MESSAGE_MAX_BYTES,
  emailMessageSchema,
  eventMessageSchema,
  messageBytes,
} from "../src";

const EMAIL = {
  id: "0b6c6d4e-6c43-4e1c-9a59-8a1b4c0d9e01",
  idempotencyKey: "welcome:u-1",
  locale: "nl",
  props: { name: "Alex", url: "https://smog.example" },
  template: "transactional/welcome",
  to: "alex@smog.example",
};

describe("emailMessageSchema", () => {
  it("accepts an email message, with or without an idempotency key", () => {
    expect(emailMessageSchema.parse(EMAIL)).toEqual(EMAIL);
    const { idempotencyKey: _, ...withoutKey } = EMAIL;
    expect(emailMessageSchema.parse(withoutKey)).toEqual(withoutKey);
  });

  it("refuses an unknown template, locale or address and a missing id", () => {
    for (const bad of [
      { ...EMAIL, template: "transactional/nope" },
      { ...EMAIL, locale: "de" },
      { ...EMAIL, to: "not-an-address" },
      { ...EMAIL, id: undefined },
      { ...EMAIL, props: "x" },
      { ...EMAIL, idempotencyKey: "" },
      // `email:sent:<key>` must stay under KV's 512-byte key limit (M6).
      { ...EMAIL, idempotencyKey: "k".repeat(EMAIL_IDEMPOTENCY_KEY_MAX + 1) },
    ]) {
      expect(emailMessageSchema.safeParse(bad).success).toBe(false);
    }
  });

  it("caps the idempotency key so the KV marker key fits in 512 bytes", () => {
    expect(EMAIL_IDEMPOTENCY_KEY_MAX).toBe(480);
    expect(
      `email:sent:${"k".repeat(EMAIL_IDEMPOTENCY_KEY_MAX)}`.length
    ).toBeLessThan(512);
    expect(
      emailMessageSchema.safeParse({
        ...EMAIL,
        idempotencyKey: "k".repeat(EMAIL_IDEMPOTENCY_KEY_MAX),
      }).success
    ).toBe(true);
  });

  it("caps the message at Cloudflare's 128 KB", () => {
    expect(EMAIL_MESSAGE_MAX_BYTES).toBe(128 * 1024);
    expect(messageBytes({ a: "é" })).toBe(
      new TextEncoder().encode('{"a":"é"}').byteLength
    );
  });
});

describe("eventMessageSchema", () => {
  it("is payment.settled or render.requested", () => {
    expect(
      eventMessageSchema.parse({ paymentId: "p-1", type: "payment.settled" })
    ).toEqual({ paymentId: "p-1", type: "payment.settled" });
    expect(
      eventMessageSchema.parse({ renderJobId: "r-1", type: "render.requested" })
    ).toEqual({ renderJobId: "r-1", type: "render.requested" });
  });

  it("refuses another type or a missing id", () => {
    for (const bad of [
      { paymentId: "p-1", type: "payment.paid" },
      { type: "payment.settled" },
      { renderJobId: "", type: "render.requested" },
      { paymentId: "p-1", type: "render.requested" },
    ]) {
      expect(eventMessageSchema.safeParse(bad).success).toBe(false);
    }
  });
});
