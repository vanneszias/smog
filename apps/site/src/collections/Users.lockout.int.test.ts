// @vitest-environment node
import { getPayload } from "payload";
import { beforeAll, describe, expect, it } from "vitest";
import config from "../payload.config";

/**
 * Account lockout, against a real database.
 *
 * This suite exists because of the KDF, not in spite of it. Payload 3.89.0
 * hashes passwords with PBKDF2-HMAC-SHA256 at **25,000 iterations**
 * (`payload/dist/auth/strategies/local/generatePasswordSaltHash.js`, the
 * literal `25000` in `pbkdf2Promisified`), against OWASP's current 600,000
 * for that algorithm. Payload 3.90.x raises it to 600,000 and is the release
 * workerd's 100,000-iteration PBKDF2 cap forbids, and the iteration count is
 * not configurable. So brute-force resistance has to come from lockout
 * rather than from the hash — which makes these assertions load-bearing in a
 * way they would not be on a project that could just raise the cost factor.
 * See the header of `Users.ts`.
 *
 * **Nothing here waits out `lockTime`.** A test that slept through a ten
 * minute window would be either useless or a ten minute test, and one that
 * shortened the window to sleep through it would be testing a different
 * configuration from the one that ships. Instead every assertion is about
 * the *locked state itself*: the lock is observed the moment it is set, and
 * expiry is covered by reading `lockUntil` rather than by outliving it.
 */
describe("Users account lockout", () => {
  let payload: Awaited<ReturnType<typeof getPayload>>;

  const PASSWORD = "correct horse battery staple";
  const WRONG = "not the password at all";

  const unique = (prefix: string) =>
    `${prefix}-${crypto.randomUUID()}@example.test`;

  const createUser = async (prefix: string) =>
    await payload.create({
      collection: "users",
      data: { email: unique(prefix), password: PASSWORD, role: "user" },
    });

  /** Resolves to the thrown error rather than letting it reject the test. */
  const attemptLogin = async (email: string, password: string) => {
    try {
      await payload.login({ collection: "users", data: { email, password } });
      return null;
    } catch (error) {
      return error as Error;
    }
  };

  const failLogin = async (email: string, times: number) => {
    for (let i = 0; i < times; i++) {
      await attemptLogin(email, WRONG);
    }
  };

  beforeAll(async () => {
    payload = await getPayload({ config });
  });

  it("locks the account after repeated failures", async () => {
    const user = await createUser("lockout");

    await failLogin(user.email, 5);

    const stored = await payload.findByID({
      collection: "users",
      id: user.id,
      overrideAccess: true,
      showHiddenFields: true,
    });

    expect(stored.lockUntil).toBeTruthy();
    expect(new Date(stored.lockUntil as string).getTime()).toBeGreaterThan(
      Date.now()
    );
  });

  it("refuses the correct password while locked", async () => {
    // The assertion that matters. "The wrong password keeps failing" is the
    // same claim as "wrong passwords are wrong" and passes against no
    // lockout whatsoever; only refusing a *correct* password distinguishes a
    // locked account from an unconfigured one.
    const user = await createUser("lockout-correct");

    expect(await attemptLogin(user.email, PASSWORD)).toBeNull();

    await failLogin(user.email, 5);

    const error = await attemptLogin(user.email, PASSWORD);

    expect(error).not.toBeNull();
  });

  it("does not lock a different account", async () => {
    const victim = await createUser("lockout-victim");
    const bystander = await createUser("lockout-bystander");

    await failLogin(victim.email, 5);

    expect(await attemptLogin(bystander.email, PASSWORD)).toBeNull();
  });
});
