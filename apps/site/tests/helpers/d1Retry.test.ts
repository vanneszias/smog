import { describe, expect, it } from "vitest";
import { isTransientD1Failure, withBusyRetry } from "./d1Retry";

/*
 * The admin e2e suite's `beforeAll` and `afterAll` write to the same local D1
 * file the dev server under test is holding. Losing that race is the only
 * thing the retry in `seedUser.ts` is for, and it reaches JavaScript in more
 * than one shape — matching only the obvious one caught about half the
 * failures, which reads as fixed and is not.
 *
 * Each message below was copied from an observed failing run.
 */
describe("isTransientD1Failure", () => {
  it("matches SQLite's own busy error", () => {
    expect(
      isTransientD1Failure(
        new Error("D1_ERROR: NOSENTRY database is locked: SQLITE_BUSY")
      )
    ).toBe(true);
  });

  it("matches the opaque internal error workerd relays instead", () => {
    // workerd logs `database is locked: SQLITE_BUSY` to stderr and hands D1
    // this, so the lock never appears in the message that reaches us.
    expect(
      isTransientD1Failure(
        new Error(
          "D1_ERROR: Failed to parse body as JSON, got: Error: internal error; reference = mi6l23o54nf314l80o3egr7o"
        )
      )
    ).toBe(true);
  });

  it("looks down the cause chain Payload wraps the error in", () => {
    // Payload surfaces a DrizzleQueryError whose message is the SQL; the
    // lock is two levels down.
    const wrapped = new Error(
      'Failed query: delete from "payload_preferences"',
      {
        cause: new Error("D1_ERROR: internal error", {
          cause: new Error("NOSENTRY database is locked: SQLITE_BUSY"),
        }),
      }
    );

    expect(isTransientD1Failure(wrapped)).toBe(true);
  });

  it("does not match a genuine query error, which retrying cannot fix", () => {
    expect(
      isTransientD1Failure(
        new Error('Failed query: no such column: "users"."nope"')
      )
    ).toBe(false);
  });

  it("does not match a validation failure", () => {
    expect(
      isTransientD1Failure(new Error("The following field is invalid: email"))
    ).toBe(false);
  });

  it("returns false for a non-Error, rather than throwing on `.message`", () => {
    expect(isTransientD1Failure("database is locked")).toBe(false);
    expect(isTransientD1Failure(undefined)).toBe(false);
  });

  it("stops walking a cause chain that points at itself", () => {
    // A self-referencing cause is rare but a bounded walk is the only thing
    // between this helper and an infinite loop inside a test hook.
    const loop = new Error("nothing to see here") as Error & { cause: unknown };
    loop.cause = loop;

    expect(isTransientD1Failure(loop)).toBe(false);
  });
});

describe("withBusyRetry", () => {
  it("retries a transient failure and returns the eventual result", async () => {
    let calls = 0;

    const result = await withBusyRetry("do the thing", () => {
      calls += 1;
      if (calls < 3) {
        return Promise.reject(
          new Error("D1_ERROR: NOSENTRY database is locked: SQLITE_BUSY")
        );
      }
      return Promise.resolve("done");
    });

    expect(result).toBe("done");
    expect(calls).toBe(3);
  });

  it("rethrows a real failure on the first attempt instead of retrying it", async () => {
    // Retrying a query error only delays the same failure by several seconds
    // and buries the message under a pile of warnings.
    let calls = 0;

    await expect(
      withBusyRetry("do the thing", () => {
        calls += 1;
        return Promise.reject(new Error("no such column: nope"));
      })
    ).rejects.toThrow("no such column: nope");

    expect(calls).toBe(1);
  });
});
