// @vitest-environment node
import { Forbidden, getPayload, NotFound } from "payload";
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

/**
 * The half of the referential-integrity ruling that belongs to
 * `user_consents`: the record must survive the account it describes.
 *
 * This is deliberately a *behavioural* test against a real database rather
 * than an assertion about the field config or the emitted DDL. Payload writes
 * `ON DELETE set null` for every relationship regardless of nullability, so
 * a schema-shaped assertion cannot tell a rule SQLite will honour from one it
 * rejects at runtime — which is exactly how this defect survived being
 * written four times in this project. Only deleting the parent proves it.
 */
describe("a consent record outlives the user it describes", () => {
  let payload: Awaited<ReturnType<typeof getPayload>>;
  const runId = crypto.randomUUID();

  beforeAll(async () => {
    payload = await getPayload({ config });
  });

  it("deletes the user and leaves the consent behind, anonymised", async () => {
    const user = await payload.create({
      collection: "users",
      data: {
        email: `erasure-${runId}@example.com`,
        password: "test-password-123",
        role: "user",
      },
    });

    const consent = await payload.create({
      collection: "user-consents",
      data: {
        user: user.id,
        analyticsConsent: true,
        marketingConsent: true,
        consentVersion: `retained-${runId}`,
        ipAddress: "198.51.100.4",
        userAgent: "Mozilla/5.0 (retention test)",
      },
    });

    // The whole point. With `user` required this throws
    // `Failed query: delete from "users" where ...`, because SQLite cannot
    // set a NOT NULL column to null.
    await payload.delete({ collection: "users", id: user.id });

    await expect(
      payload.findByID({
        collection: "users",
        id: user.id,
        overrideAccess: true,
      })
    ).rejects.toBeInstanceOf(NotFound);

    const retained = await payload.findByID({
      collection: "user-consents",
      id: consent.id,
      depth: 0,
      overrideAccess: true,
    });

    expect(retained.user).toBeNull();
    // Anonymised, not gutted: the evidence is what the record is for.
    expect(retained.analyticsConsent).toBe(true);
    expect(retained.marketingConsent).toBe(true);
    expect(retained.consentVersion).toBe(`retained-${runId}`);
    expect(retained.ipAddress).toBe("198.51.100.4");
    expect(retained.createdAt).toBe(consent.createdAt);
  });

  it("records a consent with no user at all, which is what the null case becomes", async () => {
    const orphan = await payload.create({
      collection: "user-consents",
      data: {
        analyticsConsent: false,
        consentVersion: `orphan-${runId}`,
      },
    });

    expect(orphan.user ?? null).toBeNull();
  });
});
