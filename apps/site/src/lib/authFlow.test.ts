import { describe, expect, it } from "vitest";
import {
  AUTH_FLOOR_MS,
  homePath,
  isCredentialFailure,
  isEmailShaped,
  isTrustedOrigin,
  localeFromForm,
  normaliseEmail,
  remainingPad,
  seeOther,
  signInPath,
  signUpPath,
} from "./authFlow";

describe("remainingPad", () => {
  it("waits out the rest of the floor", () => {
    expect(remainingPad(120)).toBe(AUTH_FLOOR_MS - 120);
  });

  it("never returns a negative wait for work that overran the floor", () => {
    // A negative `setTimeout` is not an error, it is an immediate callback —
    // which is the right answer, but only because this clamps.
    expect(remainingPad(AUTH_FLOOR_MS + 400)).toBe(0);
  });

  it("returns the whole floor for a zero elapsed time", () => {
    expect(remainingPad(0)).toBe(AUTH_FLOOR_MS);
  });

  it("falls back to the whole floor for a nonsensical elapsed time", () => {
    // A clock that went backwards must pad more, not less.
    expect(remainingPad(-1)).toBe(AUTH_FLOOR_MS);
    expect(remainingPad(Number.NaN)).toBe(AUTH_FLOOR_MS);
  });

  it("keeps a floor comfortably above the slowest measured answer", () => {
    /*
     * The slowest of the five measured cases was a fresh sign-up at
     * 101.33 ms (see `authFlow.ts`). A floor at or below that is a floor the
     * real work overruns, which leaks on exactly the requests it is meant to
     * cover. This pins the *decision*, not the arithmetic.
     */
    expect(AUTH_FLOOR_MS).toBeGreaterThanOrEqual(300);
  });
});

describe("isCredentialFailure", () => {
  const named = (name: string) => {
    const error = new Error("nope");
    error.name = name;

    return error;
  };

  it("treats a locked account as a plain authentication failure", () => {
    // The whole enumeration fix in one assertion: `LockedAuth` must not be
    // distinguishable from `AuthenticationError` by the time a response is
    // built, because an address that was never registered can never lock.
    expect(isCredentialFailure(named("LockedAuth"))).toBe(true);
    expect(isCredentialFailure(named("AuthenticationError"))).toBe(true);
  });

  it("covers the other refusals Payload's login raises", () => {
    expect(isCredentialFailure(named("ValidationError"))).toBe(true);
    expect(isCredentialFailure(named("UnverifiedEmail"))).toBe(true);
    expect(isCredentialFailure(named("Forbidden"))).toBe(true);
  });

  it("does not swallow a failure that is not about the credentials", () => {
    // Reporting a D1 outage as "your password is wrong" sends the visitor to
    // reset a password that was fine and hides the outage from us.
    expect(isCredentialFailure(named("QueryError"))).toBe(false);
    expect(isCredentialFailure(new Error("D1_ERROR: internal error"))).toBe(
      false
    );
    expect(
      isCredentialFailure(new TypeError("undefined is not a function"))
    ).toBe(false);
  });

  it("returns false for something that is not an error at all", () => {
    expect(isCredentialFailure("LockedAuth")).toBe(false);
    expect(isCredentialFailure({ name: "LockedAuth" })).toBe(false);
    expect(isCredentialFailure(undefined)).toBe(false);
  });
});

describe("isTrustedOrigin", () => {
  const requestOrigin = "https://smog.example";

  it("accepts a post from this site", () => {
    expect(isTrustedOrigin({ origin: requestOrigin, requestOrigin })).toBe(
      true
    );
  });

  it("refuses a post from somewhere else", () => {
    expect(
      isTrustedOrigin({ origin: "https://evil.example", requestOrigin })
    ).toBe(false);
  });

  it("refuses a lookalike origin rather than matching on a prefix", () => {
    expect(
      isTrustedOrigin({
        origin: "https://smog.example.evil.test",
        requestOrigin,
      })
    ).toBe(false);
  });

  it("refuses the same host on another scheme or port", () => {
    expect(
      isTrustedOrigin({ origin: "http://smog.example", requestOrigin })
    ).toBe(false);
    expect(
      isTrustedOrigin({ origin: "https://smog.example:8443", requestOrigin })
    ).toBe(false);
  });

  it("allows a request that sends no Origin at all", () => {
    // Browsers always send one on a POST, so this is the non-browser client:
    // curl, the integration tests, a future native app. Refusing it would
    // block nothing an attacker can do and break everything else.
    expect(isTrustedOrigin({ origin: null, requestOrigin })).toBe(true);
    expect(isTrustedOrigin({ origin: "", requestOrigin })).toBe(true);
  });

  it("refuses everything when the request's own origin is unknown", () => {
    // An empty `requestOrigin` must not become a wildcard that matches the
    // empty-string case above by accident.
    expect(
      isTrustedOrigin({ origin: "https://evil.example", requestOrigin: "" })
    ).toBe(false);
  });
});

describe("normaliseEmail", () => {
  it("trims and lowercases, the way Payload's login does", () => {
    // `loginOperation` compares `email.toLowerCase().trim()`, so a sign-up
    // that stored the raw string would create an account nobody can reach.
    expect(normaliseEmail("  Someone@Example.TEST ")).toBe(
      "someone@example.test"
    );
  });

  it("returns an empty string for a missing field", () => {
    expect(normaliseEmail(undefined)).toBe("");
    expect(normaliseEmail(null)).toBe("");
    expect(normaliseEmail(42)).toBe("");
  });
});

describe("isEmailShaped", () => {
  it("accepts the addresses people actually have", () => {
    for (const value of [
      "user@example.com",
      "user.name+alias@example.co.uk",
      "user-name@example.org",
      "user@sub.domain.example.com",
      "user@ex--ample.com",
    ]) {
      expect(isEmailShaped(value), value).toBe(true);
    }
  });

  it("rejects the shapes Payload's own validator rejects", () => {
    for (const value of [
      "",
      "nope",
      "user name@example.com",
      "user..name@example.com",
      '"user"@example.com',
      "user@-example.com",
      "user@example-.com",
      "user@example",
    ]) {
      expect(isEmailShaped(value), value).toBe(false);
    }
  });
});

describe("paths", () => {
  it("prefixes every path with the locale", () => {
    expect(homePath("fr")).toBe("/fr");
    expect(signInPath("en")).toBe("/en/sign-in");
    expect(signUpPath("nl")).toBe("/nl/sign-up");
  });

  it("carries a code, and only a code", () => {
    expect(signInPath("nl", { error: "invalid" })).toBe(
      "/nl/sign-in?error=invalid"
    );
    expect(signInPath("nl", { notice: "registered" })).toBe(
      "/nl/sign-in?notice=registered"
    );
    expect(signUpPath("en", { error: "password" })).toBe(
      "/en/sign-up?error=password"
    );
  });

  it("omits the query entirely when nothing is set", () => {
    // A trailing `?` would make the sign-up redirect and the sign-in redirect
    // differ in bytes for no reason, which is exactly the kind of difference
    // the enumeration tests compare.
    expect(signInPath("nl", {})).toBe("/nl/sign-in");
    expect(signInPath("nl", { error: undefined })).toBe("/nl/sign-in");
  });
});

describe("localeFromForm", () => {
  it("takes a known locale from the form", () => {
    expect(localeFromForm("fr")).toBe("fr");
  });

  it("clamps anything else to the default rather than trusting it", () => {
    // The value reaches a `Location` header. Without the clamp, a form field
    // of `//evil.example` would be an open redirect.
    expect(localeFromForm("//evil.example")).toBe("nl");
    expect(localeFromForm("de")).toBe("nl");
    expect(localeFromForm(undefined)).toBe("nl");
    expect(localeFromForm(new File([], "x"))).toBe("nl");
  });
});

describe("seeOther", () => {
  it("answers 303 so the browser turns the POST into a GET", () => {
    // A 302 leaves that to convention; 303 says it normatively. Getting it
    // wrong re-posts the password at whatever page it lands on.
    expect(seeOther("/nl").status).toBe(303);
  });

  it("sets the location it was given", () => {
    expect(seeOther("/nl/sign-in?error=invalid").headers.get("Location")).toBe(
      "/nl/sign-in?error=invalid"
    );
  });

  it("forbids caching, because these responses carry sessions", () => {
    expect(seeOther("/nl").headers.get("Cache-Control")).toBe("no-store");
  });

  it("attaches a cookie only when it is given one", () => {
    expect(
      seeOther("/nl", "payload-token=abc; Path=/").headers.get("Set-Cookie")
    ).toBe("payload-token=abc; Path=/");
    expect(seeOther("/nl").headers.get("Set-Cookie")).toBeNull();
  });

  it("has no body, so two redirects differ only in their headers", () => {
    expect(seeOther("/nl").body).toBeNull();
  });
});
