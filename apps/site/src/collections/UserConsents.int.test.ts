// @vitest-environment node
import { Forbidden, getPayload } from "payload";
import { beforeAll, describe, expect, it } from "vitest";
import config from "../payload.config";

/**
 * Same two halves as `AdminLogs.int.test.ts` — no API write, but the local
 * API write path must keep working — plus the one that is specific to
 * consent: an explicit *refusal* has to be recordable.
 *
 * `analyticsConsent` is `required`, and on a Payload checkbox that means
 * "must be a boolean", not "must be true" (`fields/validations.js`'s
 * `checkbox`, 3.89.0). That distinction is the difference between a consent
 * table that records decisions and one that only records agreements, so it
 * is pinned here against a real save rather than assumed from the docs.
 */
describe("user-consents append-only behaviour against a real database", () => {
  let payload: Awaited<ReturnType<typeof getPayload>>;
  let userId: number;
  let seeded: { id: number } | undefined;

  // See Sponsorships.int.test.ts: unique per run, because `users.email` is
  // `unique: true` and the local D1 directory survives between runs.
  const runId = crypto.randomUUID();
  const admin = { id: 1, role: "admin", collection: "users" };
  const regularUser = { id: 2, role: "user", collection: "users" };

  beforeAll(async () => {
    payload = await getPayload({ config });

    const user = await payload.create({
      collection: "users",
      data: {
        email: `consent-${runId}@example.com`,
        password: "test-password-123",
        role: "user",
      },
    });
    userId = user.id;
  });

  /**
   * Seeded lazily rather than in `beforeAll` — see `AdminLogs.int.test.ts`
   * for why: the record is written through the very path these tests are
   * about, so breaking that path must fail tests by name instead of
   * skipping the file.
   */
  const seedConsent = async (): Promise<{ id: number }> => {
    seeded ??= await payload.create({
      collection: "user-consents",
      data: {
        user: userId,
        analyticsConsent: true,
        marketingConsent: false,
        consentVersion: "2026-09-01",
        ipAddress: "203.0.113.7",
        userAgent: "Mozilla/5.0 (test)",
      },
    });
    return seeded;
  };

  it("stamps createdAt itself, so no hook has to supply a timestamp", async () => {
    const { id } = await seedConsent();
    const consent = await payload.findByID({
      collection: "user-consents",
      id,
      overrideAccess: true,
    });

    expect(consent.createdAt).toBeTruthy();
    expect(Number.isNaN(Date.parse(consent.createdAt))).toBe(false);
  });

  it("records an explicit refusal, not only an agreement", async () => {
    const refusal = await payload.create({
      collection: "user-consents",
      data: {
        user: userId,
        analyticsConsent: false,
        consentVersion: "2026-09-01",
      },
    });

    expect(refusal.analyticsConsent).toBe(false);
  });

  it("refuses an API create from an admin", async () => {
    await seedConsent();
    await expect(
      payload.create({
        collection: "user-consents",
        overrideAccess: false,
        user: admin as never,
        data: {
          user: userId,
          analyticsConsent: true,
          consentVersion: `forged-${runId}`,
        },
      })
    ).rejects.toBeInstanceOf(Forbidden);

    const forged = await payload.find({
      collection: "user-consents",
      overrideAccess: true,
      where: { consentVersion: { equals: `forged-${runId}` } },
    });
    expect(forged.docs).toHaveLength(0);
  });

  it("refuses an API update from an admin, leaving the recorded decision intact", async () => {
    const { id } = await seedConsent();
    await expect(
      payload.update({
        collection: "user-consents",
        id,
        overrideAccess: false,
        user: admin as never,
        data: { analyticsConsent: false },
      })
    ).rejects.toBeInstanceOf(Forbidden);

    const consent = await payload.findByID({
      collection: "user-consents",
      id,
      overrideAccess: true,
    });
    expect(consent.analyticsConsent).toBe(true);
  });

  it("refuses an API delete from an admin, leaving the record in place", async () => {
    const { id } = await seedConsent();
    await expect(
      payload.delete({
        collection: "user-consents",
        id,
        overrideAccess: false,
        user: admin as never,
      })
    ).rejects.toBeInstanceOf(Forbidden);

    const consent = await payload.findByID({
      collection: "user-consents",
      id,
      overrideAccess: true,
    });
    expect(consent.id).toBe(id);
  });

  it("lets an admin read recorded consents", async () => {
    const { id } = await seedConsent();
    const result = await payload.find({
      collection: "user-consents",
      overrideAccess: false,
      user: admin as never,
      where: { id: { equals: id } },
    });

    expect(result.docs).toHaveLength(1);
  });

  it("denies a signed-in non-admin reading consents, their own included", async () => {
    // Deliberate: `user-consents` is not `isAdminOrSelf`. A user asking what
    // they consented to is a Stage 4 account-page concern with its own read
    // path; widening this collection would also expose the ipAddress and
    // userAgent stored alongside the decision.
    const { id } = await seedConsent();
    await expect(
      payload.find({
        collection: "user-consents",
        overrideAccess: false,
        user: regularUser as never,
        where: { id: { equals: id } },
      })
    ).rejects.toBeInstanceOf(Forbidden);
  });
});
