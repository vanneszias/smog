// @vitest-environment node
import { getPayload } from "payload";
import { beforeAll, describe, expect, it } from "vitest";

/**
 * Privilege-escalation regression tests.
 *
 * These exist because the original Task 3 implementation guarded `role` on
 * update but not on create, while collection-level create is public. An
 * anonymous POST to /api/users carrying `role: "admin"` therefore produced an
 * admin account. The whole suite stayed green because every test that created
 * a user did so through the local API's default `overrideAccess: true`, which
 * short-circuits field access entirely.
 *
 * So: every assertion here goes through `overrideAccess: false`. A test that
 * creates its attacker with elevated privileges is not testing the attack.
 */
describe("Users privilege escalation", () => {
  let payload: Awaited<ReturnType<typeof getPayload>>;

  const unique = (p: string) =>
    `${p}-${Date.now()}-${Math.random()}@example.test`;

  beforeAll(async () => {
    const { default: config } = await import("@/payload.config");
    payload = await getPayload({ config: await config });
  });

  it("ignores role on an anonymous registration", async () => {
    const created = await payload.create({
      collection: "users",
      overrideAccess: false,
      data: {
        email: unique("anon"),
        password: "correct-horse-battery-staple",
        role: "admin",
      },
    });

    const stored = await payload.findByID({
      collection: "users",
      id: created.id,
      overrideAccess: true,
    });

    expect(stored.role).toBe("user");
  });

  it("ignores role when a signed-in non-admin creates a user", async () => {
    const actor = await payload.create({
      collection: "users",
      overrideAccess: true,
      data: {
        email: unique("actor"),
        password: "pw-actor-12345",
        role: "user",
      },
    });

    const created = await payload.create({
      collection: "users",
      overrideAccess: false,
      req: { user: { ...actor, collection: "users" } } as never,
      data: {
        email: unique("victim"),
        password: "pw-victim-12345",
        role: "admin",
      },
    });

    const stored = await payload.findByID({
      collection: "users",
      id: created.id,
      overrideAccess: true,
    });

    expect(stored.role).toBe("user");
  });

  it("lets an admin set role on create", async () => {
    const admin = await payload.create({
      collection: "users",
      overrideAccess: true,
      data: {
        email: unique("admin"),
        password: "pw-admin-12345",
        role: "admin",
      },
    });

    const created = await payload.create({
      collection: "users",
      overrideAccess: false,
      req: { user: { ...admin, collection: "users" } } as never,
      data: {
        email: unique("promoted"),
        password: "pw-promoted-12345",
        role: "admin",
      },
    });

    const stored = await payload.findByID({
      collection: "users",
      id: created.id,
      overrideAccess: true,
    });

    expect(stored.role).toBe("admin");
  });
});
