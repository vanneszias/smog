// @vitest-environment node
import { Forbidden, getPayload } from "payload";
import { beforeAll, describe, expect, it } from "vitest";
import config from "../payload.config";

/**
 * The append-only claim has two halves, and a unit test that only compares
 * `AdminLogs.access.create` with `denyAll` proves neither of them against a
 * real request:
 *
 * 1. Nothing reachable over the API may write an entry — not even an admin,
 *    who would otherwise be able to write the entry that covers their own
 *    tracks.
 * 2. The hooks that *do* write entries must still work. They go through the
 *    local API, where `overrideAccess` defaults to `true`
 *    (`payload/dist/collections/operations/local/create.js`, 3.89.0) and so
 *    bypasses `denyAll` entirely.
 *
 * Half 2 is the one worth pinning: a "make it really append-only" change
 * that reached for a `beforeChange` hook throwing unconditionally, rather
 * than for access control, would still satisfy half 1 while making the
 * collection impossible to write at all — a silently empty audit trail.
 */
describe("admin-logs append-only behaviour against a real database", () => {
  let payload: Awaited<ReturnType<typeof getPayload>>;
  let seeded: { id: number } | undefined;

  // See Sponsorships.int.test.ts: unique per run, because the local D1
  // directory survives between runs.
  const runId = crypto.randomUUID();
  const admin = { id: 1, role: "admin", collection: "users" };
  const regularUser = { id: 2, role: "user", collection: "users" };

  const entryData = (overrides: Record<string, unknown> = {}) => ({
    action: `gesture.deactivated.${runId}`,
    targetType: "gestures",
    targetId: "42",
    metadata: { reason: "duplicate", previousValue: true },
    ...overrides,
  });

  /**
   * Memoized rather than created in `beforeAll`: the entry is written
   * through the very path these tests are about, so a change that broke
   * writing entirely — the "make it really append-only with a throwing
   * hook" mistake — would fail the shared setup and *skip* all eight tests
   * without failing any of them by name. Seeding lazily from inside each
   * test keeps the failure attributable.
   */
  const seedEntry = async (): Promise<{ id: number }> => {
    seeded ??= await payload.create({
      collection: "admin-logs",
      data: entryData(),
    });
    return seeded;
  };

  beforeAll(async () => {
    payload = await getPayload({ config });
  });

  it("accepts the hook write path, the local API with overrideAccess", async () => {
    const entry = await seedEntry();
    expect(entry.id).toBeTypeOf("number");
  });

  it("stamps createdAt itself, so no hook has to supply a timestamp", async () => {
    const { id } = await seedEntry();
    const entry = await payload.findByID({
      collection: "admin-logs",
      id,
      overrideAccess: true,
    });

    expect(entry.createdAt).toBeTruthy();
    expect(Number.isNaN(Date.parse(entry.createdAt))).toBe(false);
  });

  it("round-trips the json metadata as an object, not a string", async () => {
    const { id } = await seedEntry();
    const entry = await payload.findByID({
      collection: "admin-logs",
      id,
      overrideAccess: true,
    });

    expect(entry.metadata).toEqual({
      reason: "duplicate",
      previousValue: true,
    });
  });

  it("refuses an API create from an admin", async () => {
    await seedEntry();
    await expect(
      payload.create({
        collection: "admin-logs",
        overrideAccess: false,
        user: admin as never,
        data: entryData({ action: `forged.${runId}` }),
      })
    ).rejects.toBeInstanceOf(Forbidden);

    const forged = await payload.find({
      collection: "admin-logs",
      overrideAccess: true,
      where: { action: { equals: `forged.${runId}` } },
    });
    expect(forged.docs).toHaveLength(0);
  });

  it("refuses an API update from an admin, leaving the entry as written", async () => {
    const { id } = await seedEntry();
    await expect(
      payload.update({
        collection: "admin-logs",
        id,
        overrideAccess: false,
        user: admin as never,
        data: { action: `rewritten.${runId}` },
      })
    ).rejects.toBeInstanceOf(Forbidden);

    const entry = await payload.findByID({
      collection: "admin-logs",
      id,
      overrideAccess: true,
    });
    expect(entry.action).toBe(`gesture.deactivated.${runId}`);
  });

  it("refuses an API delete from an admin, leaving the entry in place", async () => {
    const { id } = await seedEntry();
    await expect(
      payload.delete({
        collection: "admin-logs",
        id,
        overrideAccess: false,
        user: admin as never,
      })
    ).rejects.toBeInstanceOf(Forbidden);

    const entry = await payload.findByID({
      collection: "admin-logs",
      id,
      overrideAccess: true,
    });
    expect(entry.id).toBe(id);
  });

  it("lets an admin read the log", async () => {
    const { id } = await seedEntry();
    const result = await payload.find({
      collection: "admin-logs",
      overrideAccess: false,
      user: admin as never,
      where: { id: { equals: id } },
    });

    expect(result.docs).toHaveLength(1);
  });

  it("denies a signed-in non-admin reading the log", async () => {
    const { id } = await seedEntry();
    await expect(
      payload.find({
        collection: "admin-logs",
        overrideAccess: false,
        user: regularUser as never,
        where: { id: { equals: id } },
      })
    ).rejects.toBeInstanceOf(Forbidden);
  });
});
