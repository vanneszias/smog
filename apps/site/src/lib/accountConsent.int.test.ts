// @vitest-environment node
import { getPayload } from "payload";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { newestConsentDecision } from "@/lib/accountConsent";
import config from "../payload.config";

/**
 * `newestConsentDecision` against a real database.
 *
 * Everything this function claims is a statement about which *row* wins when
 * more than one exists, so the fixtures write rows through the ordinary
 * local API — the same one `endpoints/consent.ts`'s `recordConsent` uses —
 * rather than asserting against a hand-built return value.
 */
describe("newestConsentDecision", () => {
  let payload: Awaited<ReturnType<typeof getPayload>>;
  const email = `account-consent-${crypto.randomUUID()}@example.test`;
  let userId: number;

  beforeAll(async () => {
    payload = await getPayload({ config });

    const user = await payload.create({
      collection: "users",
      data: { email, password: "account-consent-password", role: "user" },
    });
    userId = user.id;
  });

  afterAll(async () => {
    await payload.delete({
      collection: "user-consents",
      where: { user: { equals: userId } },
    });
    await payload.delete({
      collection: "users",
      where: { email: { equals: email } },
    });
  });

  it("returns null when the account has no recorded decision at all", async () => {
    // No row has been written for this account yet, and that is not the
    // same thing as a refusal — the whole point of this function's return
    // type being `| null` rather than defaulting `analyticsConsent` to
    // `false`.
    const result = await newestConsentDecision({ payload, userId });

    expect(result).toBeNull();
  });

  it("returns the one row when there is only one", async () => {
    const written = await payload.create({
      collection: "user-consents",
      data: {
        analyticsConsent: true,
        consentVersion: "2026-09-22",
        user: userId,
      },
    });

    const result = await newestConsentDecision({ payload, userId });

    expect(result).toEqual({
      analyticsConsent: true,
      recordedAt: written.createdAt,
    });
  });

  it("returns the newest row, not the first, when the account changed its mind", async () => {
    // `user-consents` is append-only — a changed mind is a second row, and
    // this function's whole job is to read the *latest* one, the same
    // `sort: "-createdAt"` rule `endpoints/analytics.ts`'s `withdrewConsent`
    // already uses for the same collection.
    const second = await payload.create({
      collection: "user-consents",
      data: {
        analyticsConsent: false,
        consentVersion: "2026-09-22",
        user: userId,
      },
    });

    const result = await newestConsentDecision({ payload, userId });

    expect(result).toEqual({
      analyticsConsent: false,
      recordedAt: second.createdAt,
    });
  });

  it("does not see another account's rows", async () => {
    const strangerEmail = `account-consent-stranger-${crypto.randomUUID()}@example.test`;
    const stranger = await payload.create({
      collection: "users",
      data: {
        email: strangerEmail,
        password: "account-consent-password",
        role: "user",
      },
    });

    try {
      await payload.create({
        collection: "user-consents",
        data: {
          analyticsConsent: true,
          consentVersion: "2026-09-22",
          user: stranger.id,
        },
      });

      const result = await newestConsentDecision({
        payload,
        userId: stranger.id,
      });

      expect(result?.analyticsConsent).toBe(true);

      // And the account under test in every other case here is unaffected.
      const own = await newestConsentDecision({ payload, userId });
      expect(own?.analyticsConsent).toBe(false);
    } finally {
      await payload.delete({
        collection: "user-consents",
        where: { user: { equals: stranger.id } },
      });
      await payload.delete({
        collection: "users",
        where: { email: { equals: strangerEmail } },
      });
    }
  });
});
