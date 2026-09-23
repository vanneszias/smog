// @vitest-environment node
import { getPayload } from "payload";
import { beforeAll, describe, expect, it } from "vitest";
import config from "../payload.config";

/**
 * `isAdminOrSelf` grants a signed-in user document-level `update` on their
 * own record (unit-tested in `access/index.test.ts`). That alone is not
 * enough to stop self-escalation: without a field-level `access.update` on
 * `role`, that same document-level grant lets a user PATCH their own
 * `role` to `"admin"`. This proves the field-level guard actually blocks
 * that write against a real database, not just that the function returns
 * the right value in isolation.
 */
describe("Users role field access control", () => {
  let payload: Awaited<ReturnType<typeof getPayload>>;

  beforeAll(async () => {
    payload = await getPayload({ config });
  });

  it("does not let a non-admin escalate their own role via update", async () => {
    const user = await payload.create({
      collection: "users",
      data: {
        email: `role-escalation-test-${crypto.randomUUID()}@example.com`,
        password: "correct horse battery staple",
        role: "user",
      },
    });

    expect(user.role).toBe("user");

    await payload.update({
      collection: "users",
      id: user.id,
      overrideAccess: false,
      user: { ...user, collection: "users" },
      data: { role: "admin" },
    });

    const refetched = await payload.findByID({
      collection: "users",
      id: user.id,
      overrideAccess: true,
    });

    expect(refetched.role).toBe("user");
  });

  it("lets an admin set another user's role", async () => {
    const user = await payload.create({
      collection: "users",
      data: {
        email: `role-escalation-target-${crypto.randomUUID()}@example.com`,
        password: "correct horse battery staple",
        role: "user",
      },
    });
    const admin = await payload.create({
      collection: "users",
      data: {
        email: `role-escalation-admin-${crypto.randomUUID()}@example.com`,
        password: "correct horse battery staple",
        role: "admin",
      },
    });

    await payload.update({
      collection: "users",
      id: user.id,
      overrideAccess: false,
      user: { ...admin, collection: "users" },
      data: { role: "admin" },
    });

    const refetched = await payload.findByID({
      collection: "users",
      id: user.id,
      overrideAccess: true,
    });

    expect(refetched.role).toBe("admin");
  });
});
