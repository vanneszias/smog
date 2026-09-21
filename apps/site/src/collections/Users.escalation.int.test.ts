// @vitest-environment node
import { getPayload } from "payload";
import { beforeAll, describe, expect, it } from "vitest";
import { SELF_REGISTRATION } from "@/access";

/**
 * Privilege-escalation regression tests.
 *
 * These exist because the original Task 3 implementation guarded `role` on
 * update but not on create, while collection-level create was public. An
 * anonymous POST to /api/users carrying `role: "admin"` therefore produced an
 * admin account. The whole suite stayed green because every test that created
 * a user did so through the local API's default `overrideAccess: true`, which
 * short-circuits field access entirely.
 *
 * So: every assertion here goes through `overrideAccess: false`. A test that
 * creates its attacker with elevated privileges is not testing the attack.
 *
 * ## What changed in Stage 4 Task 3, and why these tests changed with it
 *
 * `users.access.create` used to be `() => true` and is now
 * `isAdminOrSelfRegistration`. That is a deliberate semantic change, made
 * because a public `create` is the site's most direct email-enumeration
 * oracle — one unauthenticated `POST /api/users` separates a registered
 * address (400) from a free one (201), which no amount of care in
 * `/auth/sign-up` can close.
 *
 * So the first two tests below no longer assert "the role is ignored"; they
 * assert the create is **refused outright**, which is strictly stronger. The
 * role guard has not gone away and is not untested — it moved to the path
 * that still creates users anonymously, `/auth/sign-up`, which is the third
 * test. Losing that test rather than moving it would have quietly retired
 * the only assertion standing between an anonymous POST and an admin
 * account.
 */
describe("Users privilege escalation", () => {
  let payload: Awaited<ReturnType<typeof getPayload>>;

  const unique = (p: string) =>
    `${p}-${Date.now()}-${Math.random()}@example.test`;

  beforeAll(async () => {
    const { default: config } = await import("@/payload.config");
    payload = await getPayload({ config: await config });
  });

  it("refuses an anonymous registration over the public API", async () => {
    await expect(
      payload.create({
        collection: "users",
        overrideAccess: false,
        data: {
          email: unique("anon"),
          password: "correct-horse-battery-staple",
          role: "admin",
        },
      })
    ).rejects.toThrow();
  });

  it("refuses a create by a signed-in non-admin", async () => {
    const actor = await payload.create({
      collection: "users",
      overrideAccess: true,
      data: {
        email: unique("actor"),
        password: "pw-actor-12345",
        role: "user",
      },
    });

    await expect(
      payload.create({
        collection: "users",
        overrideAccess: false,
        req: { user: { ...actor, collection: "users" } } as never,
        data: {
          email: unique("victim"),
          password: "pw-victim-12345",
          role: "admin",
        },
      })
    ).rejects.toThrow();
  });

  /**
   * The path that still creates a user for somebody who is not signed in.
   *
   * It goes through `access.create` rather than around it — `overrideAccess`
   * stays `false` and the endpoint identifies itself with `req.context` — so
   * the field-level `create: isAdminField` on `role` is still enforced on
   * exactly the requests an anonymous visitor can make. This is the
   * assertion the first test used to carry.
   */
  it("ignores role on a registration through the site's own sign-up", async () => {
    const created = await payload.create({
      collection: "users",
      context: { [SELF_REGISTRATION]: true },
      overrideAccess: false,
      data: {
        email: unique("signup"),
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

  /**
   * `req.context` is the guard, so it has to be a guard a network client
   * cannot set. `createPayloadRequest` hard-codes `context: {}` for every
   * REST and GraphQL request, which is verified at the call site in
   * `access/index.ts`; this pins the half that is ours — that the key means
   * nothing unless it is exactly `true`.
   */
  it("does not accept a truthy-but-wrong self-registration marker", async () => {
    await expect(
      payload.create({
        collection: "users",
        context: { [SELF_REGISTRATION]: "yes" },
        overrideAccess: false,
        data: {
          email: unique("forged"),
          password: "correct-horse-battery-staple",
          role: "user",
        },
      })
    ).rejects.toThrow();
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

  it("does not let a user plant their own email-change confirmation", async () => {
    /*
     * The email-change flow is only a verification if the two ends are
     * different people's inboxes. `isAdminOrSelf` gives a signed-in visitor
     * document-level update on their own record, so without a field guard a
     * `PATCH /api/users/:id` carrying a `pendingEmail` and a
     * `pendingEmailToken` of the visitor's own choosing would let them
     * confirm their own change — moving the account to an address nobody
     * proved they control, which is the takeover path
     * `endpoints/account.ts` exists to close.
     *
     * `overrideAccess: false` with the user as themselves, because that is
     * the request being simulated. The write is not refused, Payload strips
     * the fields it will not let them write — so the assertion is on what
     * landed, not on a throw.
     */
    const member = await payload.create({
      collection: "users",
      overrideAccess: true,
      data: {
        email: unique("planter"),
        password: "pw-planter-12345",
        role: "user",
      },
    });

    await payload.update({
      collection: "users",
      id: member.id,
      overrideAccess: false,
      req: { user: { ...member, collection: "users" } } as never,
      data: {
        pendingEmail: unique("planted"),
        pendingEmailExpiresAt: new Date(Date.now() + 60_000).toISOString(),
        pendingEmailToken: "a".repeat(64),
      },
    });

    const stored = await payload.findByID({
      collection: "users",
      id: member.id,
      overrideAccess: true,
      showHiddenFields: true,
    });

    expect(stored.pendingEmail ?? null).toBeNull();
    expect(stored.pendingEmailToken ?? null).toBeNull();
    expect(stored.pendingEmailExpiresAt ?? null).toBeNull();
  });

  it("does not let a user read their own confirmation token back", async () => {
    /*
     * `hidden: true` keeps the digest out of every API response, including
     * `/api/users/me`. It is a digest, so reading it buys an attacker
     * nothing on its own — but the field exists to be compared against, and
     * a value the caller can read is a value the caller can replay if the
     * comparison is ever loosened.
     */
    const member = await payload.create({
      collection: "users",
      overrideAccess: true,
      data: {
        email: unique("reader"),
        password: "pw-reader-12345",
        role: "user",
      },
    });

    await payload.update({
      collection: "users",
      id: member.id,
      overrideAccess: true,
      data: { pendingEmailToken: "b".repeat(64) },
    });

    const asThemselves = await payload.findByID({
      collection: "users",
      id: member.id,
      overrideAccess: false,
      req: { user: { ...member, collection: "users" } } as never,
    });

    expect(
      (asThemselves as { pendingEmailToken?: unknown }).pendingEmailToken
    ).toBeUndefined();
  });
});
