// @vitest-environment node
import { getPayload } from "payload";
import { beforeAll, describe, expect, it } from "vitest";
import config from "../payload.config";

/**
 * The password policy, against a real database.
 *
 * `hooks/enforcePasswordPolicy` is unit-tested in isolation; this file exists
 * because the interesting question is not whether the function returns the
 * right answer but whether Payload ever *calls* it. Payload's password is not
 * a field, the local strategy reads `data.password` directly, and the two
 * write paths reach it from different places — so "the hook is wired up" is
 * only demonstrable by writing through the real operations.
 */
describe("Users password policy", () => {
  let payload: Awaited<ReturnType<typeof getPayload>>;

  const unique = (prefix: string) =>
    `${prefix}-${crypto.randomUUID()}@example.test`;

  const create = async (prefix: string, password: string) =>
    await payload.create({
      collection: "users",
      data: { email: unique(prefix), password, role: "user" },
    });

  /**
   * The per-field reason, not `Error.message`.
   *
   * `ValidationError` renders its own message as the generic "The following
   * field is invalid: password" and puts the reason in `data.errors[]`
   * (`payload/dist/errors/ValidationError.js`). Matching the generic string
   * would pass for any rejection at all — including the duplicate-email one
   * — so these tests read the field message.
   */
  const rejectionFrom = async (write: Promise<unknown>): Promise<string> => {
    try {
      await write;
    } catch (error) {
      const { errors } = (error as { data: { errors: { message: string }[] } })
        .data;

      return errors.map((e) => e.message).join(" ");
    }

    throw new Error("expected the write to be rejected");
  };

  beforeAll(async () => {
    payload = await getPayload({ config });
  });

  it("rejects a password under twelve characters on create", async () => {
    // Payload's own floor is three, hard-coded. Before this policy existed,
    // `"abc"` created an account against this same database.
    expect(await rejectionFrom(create("pw-short", "abc"))).toMatch(
      /at least 12 characters/i
    );
  });

  it("rejects an eleven-character password, and accepts twelve", async () => {
    // The boundary in both directions, so an off-by-one in either comparison
    // fails something by name.
    expect(await rejectionFrom(create("pw-eleven", "elevenchars"))).toMatch(
      /at least 12 characters/i
    );

    const accepted = await create("pw-twelve", "twelvechars!");

    expect(accepted.id).toBeDefined();
  });

  it("rejects an obvious password that clears the length floor", async () => {
    expect(await rejectionFrom(create("pw-common", "password1234"))).toMatch(
      /too common/i
    );
  });

  it("matches the common-password list without regard to case", async () => {
    expect(
      await rejectionFrom(create("pw-common-case", "PassWord1234"))
    ).toMatch(/too common/i);
  });

  it("accepts a 200-character password", async () => {
    // Deliberate, and the reason is in `enforcePasswordPolicy`: an upper
    // bound on password length is a denial-of-service control for an
    // expensive KDF, and ours is cheap. Capping it would achieve nothing
    // except breaking password managers, which generate long strings by
    // default.
    const created = await create("pw-long", "x7Qm".repeat(50));

    expect(created.id).toBeDefined();

    const loggedIn = await payload.login({
      collection: "users",
      data: { email: created.email, password: "x7Qm".repeat(50) },
    });

    expect(loggedIn.user?.id).toBe(created.id);
  });

  it("rejects a weak password on update, not only on create", async () => {
    // The update path captures the plaintext in a different place from the
    // create path (`collections/operations/utilities/update.js` versus
    // `auth/strategies/local/register.js`), so covering one proves nothing
    // about the other.
    const user = await create("pw-update", "initial-password-ok");

    expect(
      await rejectionFrom(
        payload.update({
          collection: "users",
          id: user.id,
          data: { password: "abc" },
        })
      )
    ).toMatch(/at least 12 characters/i);
  });

  it("leaves a write that carries no password alone", async () => {
    const user = await create("pw-untouched", "another-good-password");

    const updated = await payload.update({
      collection: "users",
      id: user.id,
      data: { favorites: [] },
    });

    expect(updated.id).toBe(user.id);
  });
});
