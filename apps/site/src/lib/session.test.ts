import type { Payload } from "payload";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { getPayloadClient } from "./payloadClient";
import { hasSessionCookie, resolveSession } from "./session";

/*
 * The whole point of `hasSessionCookie` is that a signed-out visitor never
 * reaches Payload, and "never reaches Payload" is not something the returned
 * value can show: `payload.auth` answers `null` for a missing cookie too, so
 * a guard that did nothing would pass every assertion about the result. The
 * stub is what turns the optimisation into a testable claim.
 */
const stub = vi.hoisted(() => ({ user: null as unknown }));

vi.mock("./payloadClient", () => ({
  getPayloadClient: vi.fn(() =>
    Promise.resolve({
      auth: () => Promise.resolve({ user: stub.user }),
    } as unknown as Payload)
  ),
}));

/**
 * The guard that decides whether a page boots Payload at all.
 *
 * Its failure modes are both silent: too eager and every anonymous page view
 * pays for a session lookup that was always going to answer `null`; too
 * strict and a signed-in visitor sees the signed-out header. Neither shows up
 * as an error anywhere.
 */
describe("hasSessionCookie", () => {
  it("finds the cookie Payload sets", () => {
    expect(hasSessionCookie("payload-token=abc.def.ghi")).toBe(true);
  });

  it("finds it among others, whatever the spacing", () => {
    expect(hasSessionCookie("theme=dark; payload-token=abc; other=1")).toBe(
      true
    );
    expect(hasSessionCookie("theme=dark;payload-token=abc")).toBe(true);
  });

  it("answers false when there is no cookie header at all", () => {
    expect(hasSessionCookie(null)).toBe(false);
    expect(hasSessionCookie("")).toBe(false);
  });

  it("does not match a cookie whose name merely ends with ours", () => {
    // `header.includes("payload-token=")` is the obvious implementation and
    // it says yes to both of these, which means every visitor to a site that
    // sets one of them pays for a session lookup.
    expect(hasSessionCookie("not-payload-token=abc")).toBe(false);
    expect(hasSessionCookie("x-payload-token=abc")).toBe(false);
  });

  it("does not match a cookie whose value merely contains the name", () => {
    expect(hasSessionCookie("theme=payload-token=abc")).toBe(false);
  });

  it("treats a cleared cookie as absent", () => {
    // Signing out sends `payload-token=` with an expiry in the past. A browser
    // that has not dropped it yet still sends the empty value, and verifying
    // an empty token is the boot this guard exists to avoid.
    expect(hasSessionCookie("payload-token=")).toBe(false);
    expect(hasSessionCookie("theme=dark; payload-token=  ")).toBe(false);
  });

  it("tolerates a valueless cookie in the header", () => {
    expect(hasSessionCookie("flag; payload-token=abc")).toBe(true);
    expect(hasSessionCookie("flag")).toBe(false);
  });
});

describe("resolveSession's short circuit", () => {
  beforeEach(() => {
    vi.mocked(getPayloadClient).mockClear();
    stub.user = null;
  });

  it("answers null for a signed-out visitor without booting Payload", async () => {
    await expect(resolveSession(new Headers())).resolves.toBeNull();

    expect(getPayloadClient).not.toHaveBeenCalled();
  });

  it("still asks Payload when there is a cookie worth checking", async () => {
    // The other half. A guard stuck on "no" would pass the test above and
    // sign everybody out.
    await expect(
      resolveSession(new Headers({ cookie: "payload-token=abc" }))
    ).resolves.toBeNull();

    expect(getPayloadClient).toHaveBeenCalledTimes(1);
  });
});

describe("which collection a session may come from", () => {
  beforeEach(() => {
    vi.mocked(getPayloadClient).mockClear();
    stub.user = null;
  });

  it("returns a user from the users collection", async () => {
    stub.user = { collection: "users", email: "someone@example.test" };

    const user = await resolveSession(
      new Headers({ cookie: "payload-token=abc" })
    );

    expect(user?.email).toBe("someone@example.test");
  });

  it("ignores a session belonging to some other auth collection", async () => {
    /*
     * `payload.auth` resolves whichever auth collection the token names.
     * There is only one today, so the real database cannot exercise this —
     * a mutation sweep confirmed that dropping the slug check failed no
     * integration test at all. The stub is what makes the narrowing a
     * tested decision rather than an untested habit: the day a second auth
     * collection is added, it must not start populating the public site's
     * account nav.
     */
    stub.user = { collection: "admins", email: "operator@example.test" };

    await expect(
      resolveSession(new Headers({ cookie: "payload-token=abc" }))
    ).resolves.toBeNull();
  });
});
