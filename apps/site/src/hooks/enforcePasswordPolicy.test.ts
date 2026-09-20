import { describe, expect, it } from "vitest";
import { enforcePasswordPolicy } from "./enforcePasswordPolicy";

/**
 * Unit coverage for the rules themselves. That the hook is reached by
 * Payload's real write paths is a separate claim, proven against a database
 * in `collections/Users.password.int.test.ts`.
 */
const run = (data: unknown) =>
  (enforcePasswordPolicy as (args: never) => unknown)({
    data,
    operation: "create",
  } as never);

/**
 * The per-field message, not `Error.message`.
 *
 * `ValidationError`'s own message is the generic "The following field is
 * invalid: password" — the reason lives in `data.errors[].message`
 * (`payload/dist/errors/ValidationError.js`). Asserting on the generic
 * string would pass for *any* password rejection, which is exactly the
 * distinction these tests exist to make.
 */
const rejectionFor = (password: unknown): string => {
  try {
    run({ password });
  } catch (error) {
    const { errors } = (error as { data: { errors: { message: string }[] } })
      .data;

    return errors.map((e) => e.message).join(" ");
  }

  throw new Error("expected the policy to reject this password");
};

describe("enforcePasswordPolicy", () => {
  it("accepts a password of exactly twelve characters", () => {
    expect(() => run({ password: "twelvechars!" })).not.toThrow();
  });

  it("rejects a password of eleven characters", () => {
    expect(rejectionFor("elevenchars")).toMatch(/at least 12 characters/i);
  });

  it("rejects a common password that clears the length floor", () => {
    expect(rejectionFor("password1234")).toMatch(/too common/i);
  });

  it("ignores the case of a common password", () => {
    expect(rejectionFor("PASSWORD1234")).toMatch(/too common/i);
  });

  it("accepts a long passphrase that merely contains a common word", () => {
    // The deny-list matches whole strings, not substrings. A substring match
    // would reject most good passphrases and push people towards shorter
    // ones — the opposite of the point.
    expect(() =>
      run({ password: "my-password1234-and-then-some" })
    ).not.toThrow();
  });

  it("does not cap the length", () => {
    expect(() => run({ password: "x7Qm".repeat(50) })).not.toThrow();
  });

  it("returns the data unchanged rather than normalising it", () => {
    // Load-bearing: both write paths capture the plaintext before the hooks
    // run, so a hook that rewrote the value would store a hash of something
    // the user never typed. See the note in the hook.
    const data = { email: "a@b.test", password: "  Spaced Password  " };

    expect(run(data)).toBe(data);
  });

  it("leaves a write that carries no password alone", () => {
    const data = { email: "a@b.test" };

    expect(run(data)).toBe(data);
  });

  it("leaves a non-string password to Payload's own validation", () => {
    expect(() => run({ password: 12 })).not.toThrow();
  });

  it("tolerates undefined data", () => {
    expect(() => run(undefined)).not.toThrow();
  });
});
