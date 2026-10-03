import { describe, expect, test } from "bun:test";
import { checkoutInputSchema, contactEmailSchema } from "./wizard";

const GESTURE_A = "6a1f5e0e-6a7c-4d0c-9b1e-0f6f3b2e1a01";
const GESTURE_B = "6a1f5e0e-6a7c-4d0c-9b1e-0f6f3b2e1a02";

function input(overrides: Record<string, unknown> = {}) {
  return {
    checkoutId: "0b6c6d4e-6c43-4e1c-9a59-8a1b4c0d9e01",
    contact: { email: "alex@example.com", name: "Alex" },
    displayName: "Acme BV",
    expectedTotalCents: 10_000,
    gestureIds: [GESTURE_A, GESTURE_B],
    locale: "nl",
    ...overrides,
  };
}

describe("checkoutInputSchema", () => {
  test("accepts a minimal checkout and trims the display name", () => {
    const parsed = checkoutInputSchema.parse(
      input({ displayName: "  Acme BV  " })
    );
    expect(parsed.displayName).toBe("Acme BV");
    expect(parsed.invoice).toBeUndefined();
  });

  test("normalises the invoice VAT number", () => {
    const parsed = checkoutInputSchema.parse(
      input({
        invoice: {
          email: "billing@example.com",
          name: "Acme BV",
          vatNumber: "BE 0123.456.749",
        },
      })
    );
    expect(parsed.invoice?.vatNumber).toBe("0123456749");
  });

  test.each([
    ["no gestures", { gestureIds: [] }],
    [
      "11 gestures",
      {
        gestureIds: Array.from(
          { length: 11 },
          (_, i) =>
            `6a1f5e0e-6a7c-4d0c-9b1e-0f6f3b2e1a${String(i).padStart(2, "0")}`
        ),
      },
    ],
    ["a repeated gesture", { gestureIds: [GESTURE_A, GESTURE_A] }],
    ["a blank display name", { displayName: "   " }],
    ["a 36 character display name", { displayName: "x".repeat(36) }],
    ["a logo key outside logos/", { logoKey: "avatars/abc" }],
    ["a float total", { expectedTotalCents: 100.5 }],
    ["an unknown locale", { locale: "de" }],
    ["a bad email", { contact: { email: "alex@example", name: "Alex" } }],
    [
      "a 121 character contact name",
      { contact: { email: "alex@example.com", name: "x".repeat(121) } },
    ],
    [
      "a wrong VAT number",
      {
        invoice: {
          email: "billing@example.com",
          name: "Acme",
          vatNumber: "0123456748",
        },
      },
    ],
  ])("refuses %s", (_label, overrides) => {
    expect(checkoutInputSchema.safeParse(input(overrides)).success).toBe(false);
  });

  test("accepts a logo key", () => {
    const logoKey = "logos/0b6c6d4e-6c43-4e1c-9a59-8a1b4c0d9e01";
    expect(checkoutInputSchema.parse(input({ logoKey })).logoKey).toBe(logoKey);
  });

  test("the contact email needs the old pattern and z.email, ≤ 254", () => {
    expect(contactEmailSchema.safeParse("a@b.be").success).toBe(true);
    expect(contactEmailSchema.safeParse("a b@c.be").success).toBe(false);
    expect(contactEmailSchema.safeParse("a@b").success).toBe(false);
    const at254 = `${"a".repeat(64)}@${"b".repeat(186)}.be`;
    expect(at254).toHaveLength(254);
    expect(contactEmailSchema.safeParse(at254).success).toBe(true);
    expect(contactEmailSchema.safeParse(`a${at254}`).success).toBe(false);
  });
});
