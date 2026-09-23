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

  /**
   * Starts a reset and returns the token, the way the (unconfigured) mailer
   * would have carried it.
   *
   * `disableEmail` because there is no adapter; `forgotPasswordOperation`
   * returns the token either way.
   */
  const resetTokenFor = async (email: string): Promise<string> =>
    (await payload.forgotPassword({
      collection: "users",
      data: { email },
      disableEmail: true,
    })) as unknown as string;

  describe("on the reset-password path", () => {
    /*
     * The gap `hooks/enforcePasswordPolicy` could not close and
     * `enforcePasswordPolicyOnReset` does. `resetPasswordOperation` hashes
     * before it runs `beforeValidate`, and hands that hook the user document
     * rather than the submitted body — so `data.password` is undefined there
     * and the twelve-character floor simply was not applied. What was applied
     * is Payload's own default parameter, `minLength = 3`.
     *
     * Live wherever an email adapter delivers the reset link.
     */
    it("rejects a three-character password", async () => {
      const user = await create("pw-reset-short", "reset-floor-password");
      const token = await resetTokenFor(user.email);

      expect(
        await rejectionFrom(
          payload.resetPassword({
            collection: "users",
            data: { password: "abc", token },
            overrideAccess: true,
          })
        )
      ).toMatch(/at least 12 characters/i);

      // And the old one still works, so the reset did not half-happen.
      const loggedIn = await payload.login({
        collection: "users",
        data: { email: user.email, password: "reset-floor-password" },
      });

      expect(loggedIn.user?.id).toBe(user.id);
    });

    it("rejects a common password that clears the length floor", async () => {
      const user = await create("pw-reset-common", "reset-common-password");
      const token = await resetTokenFor(user.email);

      expect(
        await rejectionFrom(
          payload.resetPassword({
            collection: "users",
            data: { password: "password1234", token },
            overrideAccess: true,
          })
        )
      ).toMatch(/too common/i);
    });

    it("still lets a strong password through", async () => {
      // The other half. A hook that rejected everything would pass both
      // tests above and break password reset entirely — which, on a
      // Google-created account, is the only door there is.
      const user = await create("pw-reset-ok", "reset-original-password");
      const token = await resetTokenFor(user.email);

      await payload.resetPassword({
        collection: "users",
        data: { password: "reset-replacement-ok", token },
        overrideAccess: true,
      });

      const loggedIn = await payload.login({
        collection: "users",
        data: { email: user.email, password: "reset-replacement-ok" },
      });

      expect(loggedIn.user?.id).toBe(user.id);
    });

    it("leaves every other operation on the collection alone", async () => {
      /*
       * `beforeOperation` fires for `login`, `create`, `read` and the rest,
       * and `args` has a different shape for each. A hook that forgot to
       * narrow on the operation would read `args.data.password` on a login —
       * where it is the password being *checked*, not one being set.
       *
       * **The interesting case is a wrong password, not a right one**, and
       * the first version of this test missed that. Every *correct* password
       * is at least twelve characters by construction — the policy put it
       * there — so an un-narrowed hook waves every successful sign-in
       * through and this test stayed green. What it breaks is the failures:
       * a short wrong guess leaves as a `ValidationError` about password
       * length instead of an `AuthenticationError`, thrown before
       * `loginOperation` has counted the attempt — which silently disables
       * lockout, the one brute-force control this project has. The sweep
       * caught the un-narrowed hook through an unrelated account-endpoint
       * test; that is a finding, and this is the fix.
       */
      const user = await create("pw-reset-narrow", "narrow-enough-password");
      const loggedIn = await payload.login({
        collection: "users",
        data: { email: user.email, password: "narrow-enough-password" },
      });

      expect(loggedIn.user?.id).toBe(user.id);

      const refused = await payload
        .login({
          collection: "users",
          data: { email: user.email, password: "short" },
        })
        .then(() => null)
        .catch((error: Error) => error);

      expect(refused?.name).toBe("AuthenticationError");

      const { docs } = await payload.find({
        collection: "users",
        overrideAccess: true,
        showHiddenFields: true,
        where: { email: { equals: user.email } },
      });

      // The attempt was counted, which is what lockout is built on.
      expect(docs[0]?.loginAttempts).toBe(1);

      const read = await payload.findByID({
        collection: "users",
        id: user.id,
      });

      expect(read.id).toBe(user.id);
    });
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
