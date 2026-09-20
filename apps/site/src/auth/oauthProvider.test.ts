import { describe, expect, it } from "vitest";
import { checkClaims, resolveProvider } from "./oauthProvider";

/**
 * The pure half of the OAuth work: what a provider is configured to be, and
 * what a set of claims is allowed to mean. Neither needs a database, a
 * network or a browser, and both are where the security decisions live.
 */
describe("resolveProvider", () => {
  const credentials = {
    GOOGLE_CLIENT_ID: "client-id",
    GOOGLE_CLIENT_SECRET: "client-secret",
  };

  it("answers null for a provider nobody has configured", () => {
    expect(resolveProvider("google", {})).toBeNull();
  });

  it("answers null when only half the credentials are present", () => {
    expect(
      resolveProvider("google", { GOOGLE_CLIENT_ID: "client-id" })
    ).toBeNull();
    expect(
      resolveProvider("google", { GOOGLE_CLIENT_SECRET: "secret" })
    ).toBeNull();
  });

  it("treats a blank credential as absent", () => {
    expect(
      resolveProvider("google", {
        GOOGLE_CLIENT_ID: "   ",
        GOOGLE_CLIENT_SECRET: "client-secret",
      })
    ).toBeNull();
  });

  it("answers null for a provider this app has no defaults for", () => {
    expect(
      resolveProvider("apple", {
        APPLE_CLIENT_ID: "client-id",
        APPLE_CLIENT_SECRET: "client-secret",
      })
    ).toBeNull();
  });

  it("uses Google's real endpoints when nothing overrides them", () => {
    const provider = resolveProvider("google", credentials);

    expect(provider).not.toBeNull();
    expect(provider?.authorizationEndpoint).toBe(
      "https://accounts.google.com/o/oauth2/v2/auth"
    );
    expect(provider?.tokenEndpoint).toBe("https://oauth2.googleapis.com/token");
    expect(provider?.jwksUri).toBe(
      "https://www.googleapis.com/oauth2/v3/certs"
    );
    expect(provider?.clientId).toBe("client-id");
    expect(provider?.clientSecret).toBe("client-secret");
  });

  /**
   * Both of Google's issuer spellings, because tokens really do arrive with
   * either and a verifier that pins one rejects half of them.
   */
  it("accepts both issuer spellings Google uses", () => {
    expect(resolveProvider("google", credentials)?.issuers).toEqual([
      "https://accounts.google.com",
      "accounts.google.com",
    ]);
  });

  it("points at another provider when every endpoint is overridden", () => {
    const provider = resolveProvider("google", {
      ...credentials,
      GOOGLE_AUTHORIZATION_ENDPOINT: "http://127.0.0.1:1/authorize",
      GOOGLE_ISSUER: "http://127.0.0.1:1",
      GOOGLE_JWKS_URI: "http://127.0.0.1:1/jwks",
      GOOGLE_TOKEN_ENDPOINT: "http://127.0.0.1:1/token",
    });

    expect(provider?.tokenEndpoint).toBe("http://127.0.0.1:1/token");
    expect(provider?.issuers).toEqual(["http://127.0.0.1:1"]);
  });

  /**
   * A half-applied override is the dangerous one: a fake issuer with
   * Google's real JWKS, or Google's real token endpoint with an issuer
   * somebody else controls, is the configuration that looks like it works.
   */
  it("refuses a partial override rather than mixing two providers", () => {
    expect(() =>
      resolveProvider("google", {
        ...credentials,
        GOOGLE_TOKEN_ENDPOINT: "http://127.0.0.1:1/token",
      })
    ).toThrow(/Partial google OAuth endpoint override/);
  });

  it("refuses to move the endpoints at all in production", () => {
    expect(() =>
      resolveProvider("google", {
        ...credentials,
        GOOGLE_AUTHORIZATION_ENDPOINT: "http://127.0.0.1:1/authorize",
        GOOGLE_ISSUER: "http://127.0.0.1:1",
        GOOGLE_JWKS_URI: "http://127.0.0.1:1/jwks",
        GOOGLE_TOKEN_ENDPOINT: "http://127.0.0.1:1/token",
        NODE_ENV: "production",
      })
    ).toThrow(/Refusing to override google OAuth endpoints in production/);
  });
});

describe("checkClaims", () => {
  const provider = resolveProvider("google", {
    GOOGLE_CLIENT_ID: "client-id",
    GOOGLE_CLIENT_SECRET: "client-secret",
  });

  if (provider === null) {
    throw new Error("the Google defaults stopped resolving");
  }

  const claims = (extra: Record<string, unknown>) => ({
    email: "someone@example.test",
    email_verified: true,
    sub: "1234567890",
    ...extra,
  });

  it("accepts a verified address and a subject", () => {
    expect(checkClaims(claims({}), provider)).toEqual({
      identity: { email: "someone@example.test", subject: "1234567890" },
      ok: true,
    });
  });

  it("normalises the address the way sign-in does", () => {
    const result = checkClaims(
      claims({ email: "  Someone@Example.TEST " }),
      provider
    );

    expect(result).toEqual({
      identity: { email: "someone@example.test", subject: "1234567890" },
      ok: true,
    });
  });

  it("refuses a missing or empty subject", () => {
    expect(checkClaims(claims({ sub: undefined }), provider)).toEqual({
      ok: false,
      reason: "subject",
    });
    expect(checkClaims(claims({ sub: "   " }), provider)).toEqual({
      ok: false,
      reason: "subject",
    });
    expect(checkClaims(claims({ sub: 1_234_567_890 }), provider)).toEqual({
      ok: false,
      reason: "subject",
    });
  });

  it("refuses anything that is not an address", () => {
    expect(checkClaims(claims({ email: "not-an-address" }), provider)).toEqual({
      ok: false,
      reason: "email",
    });
    expect(checkClaims(claims({ email: undefined }), provider)).toEqual({
      ok: false,
      reason: "email",
    });
  });

  /**
   * The account-takeover branch. Everything that is not a positive assertion
   * of verification is treated as unverified — including the claim being
   * absent, which is the case an implementation is most likely to wave
   * through.
   */
  it.each([
    ["absent", undefined],
    ["false", false],
    ['the string "false"', "false"],
    ["null", null],
    ["the number 1", 1],
    ["an empty string", ""],
  ])("refuses an address whose email_verified is %s", (_label, value) => {
    expect(checkClaims(claims({ email_verified: value }), provider)).toEqual({
      ok: false,
      reason: "unverified",
    });
  });

  it('accepts the string "true", which Google has shipped', () => {
    expect(checkClaims(claims({ email_verified: "true" }), provider).ok).toBe(
      true
    );
  });

  it("reads the claim names from the provider, not from literals", () => {
    const renamed = {
      ...provider,
      claims: { email: "mail", emailVerified: "mail_ok", subject: "id" },
    };

    expect(
      checkClaims(
        { id: "abc", mail: "someone@example.test", mail_ok: true },
        renamed
      )
    ).toEqual({
      identity: { email: "someone@example.test", subject: "abc" },
      ok: true,
    });
  });
});
