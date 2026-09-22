// @vitest-environment node
import { createServer, type Server } from "node:http";
import type { AddressInfo } from "node:net";
import { exportJWK, generateKeyPair, type JWK, SignJWT } from "jose";
import { getPayload, handleEndpoints } from "payload";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import config from "../payload.config";

/**
 * The OAuth endpoints, driven through `handleEndpoints` against a real
 * database and a **real OpenID provider that this test controls**.
 *
 * ## Why a fake provider rather than a mocked `fetch`
 *
 * There are no Google credentials in this repository and there never will be
 * in CI, so the choice is between a test that stubs the network — and
 * therefore proves only that the code calls the stub it was written against —
 * and a test that stands up an actual token endpoint and an actual JWKS over
 * HTTP. This is the second. The authorization-code exchange is a real POST
 * with a real form body, the ID token is a real RS256 JWT, and the signature
 * is verified against a real JWKS document fetched over the network.
 *
 * What that leaves unproven is listed in the task report: everything that is
 * specifically *Google's* — the exact shape of its `error` responses, its
 * consent screen, whether its `email_verified` arrives as a boolean or the
 * string `"true"` (both are accepted here, and only one of them is exercised
 * against the real thing) and whether the registered redirect URI matches.
 *
 * ## Why the provider is configured through the environment
 *
 * `resolveProvider` reads the endpoints, the issuer, the client id and the
 * client secret from the environment, with Google's real values as the
 * defaults. That is what lets this test point the very same endpoint code at
 * a provider on `127.0.0.1` without a single branch in the handler, and what
 * lets the real Google values slot in by setting two variables.
 */
describe("oauth endpoints", () => {
  let payload: Awaited<ReturnType<typeof getPayload>>;
  let server: Server;
  let providerOrigin: string;
  let signingKey: CryptoKey;
  /**
   * An EC key the JWKS publishes alongside the RSA one, for the
   * algorithm-pin test.
   *
   * **It is published from the start, and that detail is load-bearing.** The
   * first version of that test added the key to the JWKS document mid-test,
   * and it passed — but for the wrong reason: `createRemoteJWKSet` caches the
   * key set and will not re-fetch within its cooldown, so the token was
   * refused for "no matching key", not for its algorithm. The mutation that
   * widens the pin survived and said so. With the key present in the set the
   * endpoint already holds, the only thing left that can refuse the token is
   * the pin.
   */
  let ecSigningKey: CryptoKey;
  let jwks: { keys: JWK[] };

  const SITE = "http://localhost:3003";
  const CLIENT_ID = "fake-client-id.apps.example.test";
  const CLIENT_SECRET = "fake-client-secret";

  /** Claims the fake provider will mint for a given authorization code. */
  interface CodeGrant {
    aud?: string;
    email?: string;
    emailVerified?: boolean | string;
    iss?: string;
    nonce?: string;
    sub?: string;
    /** Sign with this key and algorithm instead of the default RS256 one. */
    signWith?: { alg: string; key: CryptoKey; kid: string };
    /** Sign with a key the published JWKS does not contain. */
    unknownKey?: boolean;
  }

  const grants = new Map<string, CodeGrant>();
  const consumedCodes = new Set<string>();
  let tokenRequests = 0;

  const unique = (prefix: string) =>
    `${prefix}-${crypto.randomUUID()}@example.test`;

  /** Registers an authorization code the fake provider will honour once. */
  const issueCode = (grant: CodeGrant): string => {
    const code = `code-${crypto.randomUUID()}`;

    grants.set(code, grant);

    return code;
  };

  const idTokenFor = async (grant: CodeGrant): Promise<string> => {
    const key = grant.unknownKey
      ? (await generateKeyPair("RS256", { extractable: true })).privateKey
      : signingKey;

    const claims: Record<string, unknown> = {
      email: grant.email ?? "someone@example.test",
      email_verified: grant.emailVerified ?? true,
      nonce: grant.nonce,
    };

    return await new SignJWT(claims)
      .setProtectedHeader(
        grant.signWith === undefined
          ? { alg: "RS256", kid: "fake-key-1" }
          : { alg: grant.signWith.alg, kid: grant.signWith.kid }
      )
      .setSubject(grant.sub ?? "fake-subject")
      .setIssuer(grant.iss ?? providerOrigin)
      .setAudience(grant.aud ?? CLIENT_ID)
      .setIssuedAt()
      .setExpirationTime("5m")
      .sign(grant.signWith?.key ?? key);
  };

  beforeAll(async () => {
    payload = await getPayload({ config });

    const { privateKey, publicKey } = await generateKeyPair("RS256", {
      extractable: true,
    });

    const ec = await generateKeyPair("ES256", { extractable: true });

    signingKey = privateKey;
    ecSigningKey = ec.privateKey;
    jwks = {
      keys: [
        { ...(await exportJWK(publicKey)), kid: "fake-key-1" },
        { ...(await exportJWK(ec.publicKey)), alg: "ES256", kid: "fake-ec-1" },
      ],
    };

    server = createServer((request, response) => {
      const url = new URL(request.url ?? "/", providerOrigin);

      if (request.method === "GET" && url.pathname === "/jwks") {
        response.writeHead(200, { "Content-Type": "application/json" });
        response.end(JSON.stringify(jwks));

        return;
      }

      if (request.method === "POST" && url.pathname === "/token") {
        tokenRequests += 1;

        let body = "";

        request.on("data", (chunk) => {
          body += chunk;
        });

        const respond = async () => {
          {
            const form = new URLSearchParams(body);
            const code = form.get("code") ?? "";
            const grant = grants.get(code);

            const bad = (error: string) => {
              response.writeHead(400, { "Content-Type": "application/json" });
              response.end(JSON.stringify({ error }));
            };

            if (form.get("grant_type") !== "authorization_code") {
              return bad("unsupported_grant_type");
            }

            if (
              form.get("client_id") !== CLIENT_ID ||
              form.get("client_secret") !== CLIENT_SECRET
            ) {
              return bad("invalid_client");
            }

            // Real authorization codes are single-use. So is this one.
            if (!grant || consumedCodes.has(code)) {
              return bad("invalid_grant");
            }

            consumedCodes.add(code);

            response.writeHead(200, { "Content-Type": "application/json" });
            response.end(
              JSON.stringify({
                access_token: "fake-access-token",
                expires_in: 3599,
                id_token: await idTokenFor(grant),
                token_type: "Bearer",
              })
            );
          }
        };

        request.on("end", () => {
          respond().catch(() => {
            response.writeHead(500);
            response.end();
          });
        });

        return;
      }

      response.writeHead(404);
      response.end();
    });

    await new Promise<void>((resolve) => {
      server.listen(0, "127.0.0.1", resolve);
    });

    const { port } = server.address() as AddressInfo;

    providerOrigin = `http://127.0.0.1:${port}`;

    process.env.GOOGLE_CLIENT_ID = CLIENT_ID;
    process.env.GOOGLE_CLIENT_SECRET = CLIENT_SECRET;
    process.env.GOOGLE_AUTHORIZATION_ENDPOINT = `${providerOrigin}/authorize`;
    process.env.GOOGLE_TOKEN_ENDPOINT = `${providerOrigin}/token`;
    process.env.GOOGLE_JWKS_URI = `${providerOrigin}/jwks`;
    process.env.GOOGLE_ISSUER = providerOrigin;
  });

  afterAll(async () => {
    await new Promise<void>((resolve) => {
      server.close(() => resolve());
    });
  });

  const get = (path: string, init: { cookie?: string } = {}) => {
    const headers = new Headers();

    if (init.cookie !== undefined) {
      headers.set("Cookie", init.cookie);
    }

    return handleEndpoints({
      config,
      request: new Request(`${SITE}${path}`, { headers, method: "GET" }),
    });
  };

  /**
   * Everything about a response a client can see, for the comparisons where
   * "both failed" is not good enough. Same shape as `auth.int.test.ts`.
   */
  /**
   * A response reduced to what two refusals must have in common.
   *
   * `Expires` is normalised out, and only `Expires`. `clearedStateCookie`
   * builds it from `Date.now() - 1000`, so two requests either side of a
   * second boundary produce cookies that differ by one second — which turned
   * this comparison red in CI on a run where nothing about the code had
   * changed (`release-check`, head 4dd31db: `00:55:14` against `00:55:15`).
   *
   * Normalising loses nothing the test was asserting. The property here is
   * that a registered address and a free one produce the *same* refusal; the
   * expiry is a function of the wall clock, not of which branch ran. That the
   * cookie really is cleared — an `Expires` in the past, not merely an empty
   * value — is asserted separately by `isCleared`, which is where that
   * belongs.
   */
  const EXPIRES = /Expires=[^;]+/;

  const snapshot = async (response: Response) => ({
    body: await response.text(),
    headers: [...response.headers.entries()]
      .map(
        ([name, value]) =>
          [name, value.replace(EXPIRES, "Expires=<normalised>")] as const
      )
      .sort(([a], [b]) => a.localeCompare(b)),
    status: response.status,
  });

  /** The `name=value` pair of one `Set-Cookie` on a response, if present. */
  const cookiePair = (response: Response, name: string): null | string => {
    const header = response.headers
      .getSetCookie()
      .find((value) => value.startsWith(`${name}=`));

    if (header === undefined) {
      return null;
    }

    return header.slice(0, header.indexOf(";"));
  };

  /**
   * Whether a response tells the browser to drop `name`.
   *
   * It insists on an `Expires` in the past rather than just an empty value,
   * because an empty value with a *future* expiry is a cookie the browser
   * keeps — and that is exactly the shape a "forgot to expire it" mistake
   * takes.
   */
  const isCleared = (response: Response, name: string): boolean =>
    response.headers.getSetCookie().some((header) => {
      if (!header.startsWith(`${name}=;`)) {
        return false;
      }

      const expires = /;\s*Expires=([^;]+)/i.exec(header)?.[1];

      return expires !== undefined && new Date(expires).getTime() < Date.now();
    });

  /** Starts a flow and returns everything the callback will need. */
  const start = async () => {
    const response = await get("/api/auth/google?locale=nl");
    const cookie = cookiePair(response, "payload-oauth-state");

    /*
     * Thrown rather than asserted. A fixture that did not produce the state
     * it promises is a broken fixture, and it has to say so from here — the
     * alternative is every state test below silently comparing one refusal
     * against another and passing while proving nothing, which is the
     * failure mode Task 2 was handed as a finding.
     */
    if (response.status !== 303 || cookie === null) {
      throw new Error(
        `the start endpoint did not begin a flow (status ${response.status})`
      );
    }

    const location = new URL(response.headers.get("Location") ?? "");

    return {
      cookie,
      nonce: location.searchParams.get("nonce") ?? "",
      state: location.searchParams.get("state") ?? "",
    };
  };

  describe("state", () => {
    it("rejects a callback whose state does not match the cookie", async () => {
      const flow = await start();
      const code = issueCode({ email: unique("forged"), nonce: flow.nonce });
      const before = tokenRequests;

      const response = await get(
        `/api/auth/google/callback?code=${code}&state=not-the-state`,
        { cookie: flow.cookie }
      );

      expect(response.status).toBe(303);
      expect(response.headers.get("Location")).toBe("/nl/sign-in?error=oauth");
      expect(cookiePair(response, "payload-token")).toBeNull();
      expect(tokenRequests).toBe(before);
    });

    /**
     * The forged value above is short, which a length check alone would
     * refuse. This one is the same length as the real `state`, so only an
     * actual comparison of the two rejects it. Mutation M1 survived without
     * this test: neutering the comparison left the early length check doing
     * the work, and nothing noticed.
     */
    it("rejects a forged state that is the right length", async () => {
      const flow = await start();
      const forged = flow.state
        .split("")
        .reverse()
        .join("")
        .replace(/^(.)/, (c) => (c === "z" ? "y" : "z"));
      const code = issueCode({ email: unique("samelen"), nonce: flow.nonce });
      const before = tokenRequests;

      expect(forged).toHaveLength(flow.state.length);
      expect(forged).not.toBe(flow.state);

      const response = await get(
        `/api/auth/google/callback?code=${code}&state=${forged}`,
        { cookie: flow.cookie }
      );

      expect(response.headers.get("Location")).toBe("/nl/sign-in?error=oauth");
      expect(cookiePair(response, "payload-token")).toBeNull();
      expect(tokenRequests).toBe(before);
    });

    it("rejects a callback with no state at all", async () => {
      const flow = await start();
      const code = issueCode({ email: unique("nostate"), nonce: flow.nonce });
      const before = tokenRequests;

      const response = await get(`/api/auth/google/callback?code=${code}`, {
        cookie: flow.cookie,
      });

      expect(response.status).toBe(303);
      expect(response.headers.get("Location")).toBe("/nl/sign-in?error=oauth");
      expect(cookiePair(response, "payload-token")).toBeNull();
      expect(tokenRequests).toBe(before);
    });

    it("rejects a state that matches nothing because the cookie is absent", async () => {
      const flow = await start();
      const code = issueCode({ email: unique("nocookie"), nonce: flow.nonce });

      const response = await get(
        `/api/auth/google/callback?code=${code}&state=${flow.state}`
      );

      expect(response.status).toBe(303);
      expect(response.headers.get("Location")).toBe("/nl/sign-in?error=oauth");
      expect(cookiePair(response, "payload-token")).toBeNull();
    });

    it("rejects a replayed state that has already been consumed", async () => {
      const flow = await start();
      const email = unique("replay");
      const first = await get(
        `/api/auth/google/callback?code=${issueCode({
          email,
          nonce: flow.nonce,
          sub: `sub-${crypto.randomUUID()}`,
        })}&state=${flow.state}`,
        { cookie: flow.cookie }
      );

      expect(first.status).toBe(303);
      expect(cookiePair(first, "payload-token")).not.toBeNull();

      /*
       * The browser is told to drop the state cookie by the *first* response,
       * which is what makes the state single-use. A replay therefore arrives
       * with no cookie — and, because the check runs before the exchange, the
       * provider is never asked a second time.
       */
      expect(isCleared(first, "payload-oauth-state")).toBe(true);

      const before = tokenRequests;
      const replay = await get(
        `/api/auth/google/callback?code=${issueCode({
          email,
          nonce: flow.nonce,
          sub: `sub-${crypto.randomUUID()}`,
        })}&state=${flow.state}`
      );

      expect(replay.status).toBe(303);
      expect(replay.headers.get("Location")).toBe("/nl/sign-in?error=oauth");
      expect(cookiePair(replay, "payload-token")).toBeNull();
      expect(tokenRequests).toBe(before);
    });

    it("rejects a state cookie that was not signed by this site", async () => {
      const flow = await start();
      const forged = await new SignJWT({
        l: "nl",
        n: flow.nonce,
        p: "google",
        s: flow.state,
      })
        .setProtectedHeader({ alg: "HS256", typ: "JWT" })
        .setIssuedAt()
        .setExpirationTime("10m")
        .sign(new TextEncoder().encode("not-the-payload-secret"));

      const response = await get(
        `/api/auth/google/callback?code=${issueCode({
          email: unique("forgedcookie"),
          nonce: flow.nonce,
        })}&state=${flow.state}`,
        { cookie: `payload-oauth-state=${forged}` }
      );

      expect(response.headers.get("Location")).toBe("/nl/sign-in?error=oauth");
      expect(cookiePair(response, "payload-token")).toBeNull();
    });

    it("rejects a state cookie that has expired", async () => {
      const flow = await start();
      const stale = await new SignJWT({
        l: "nl",
        n: flow.nonce,
        p: "google",
        s: flow.state,
      })
        .setProtectedHeader({ alg: "HS256", typ: "JWT" })
        .setIssuedAt(Math.floor(Date.now() / 1000) - 3600)
        .setExpirationTime(Math.floor(Date.now() / 1000) - 60)
        .sign(new TextEncoder().encode(payload.secret));

      const response = await get(
        `/api/auth/google/callback?code=${issueCode({
          email: unique("stale"),
          nonce: flow.nonce,
        })}&state=${flow.state}`,
        { cookie: `payload-oauth-state=${stale}` }
      );

      expect(response.headers.get("Location")).toBe("/nl/sign-in?error=oauth");
      expect(cookiePair(response, "payload-token")).toBeNull();
    });
  });

  describe("the authorization request", () => {
    it("sends the configured client id, scope and redirect URI", async () => {
      const response = await get("/api/auth/google?locale=en");
      const location = new URL(response.headers.get("Location") ?? "");

      expect(location.origin + location.pathname).toBe(
        `${providerOrigin}/authorize`
      );
      expect(location.searchParams.get("client_id")).toBe(CLIENT_ID);
      expect(location.searchParams.get("response_type")).toBe("code");
      expect(location.searchParams.get("scope")).toBe("openid email");
      expect(location.searchParams.get("redirect_uri")).toBe(
        `${SITE}/auth/google/callback`
      );
    });

    it("mints an unguessable state and nonce, fresh on every request", async () => {
      const first = await start();
      const second = await start();

      expect(first.state).not.toBe(second.state);
      expect(first.nonce).not.toBe(second.nonce);
      expect(first.state.length).toBeGreaterThanOrEqual(43);
      expect(first.nonce.length).toBeGreaterThanOrEqual(43);
    });

    it("keeps the state cookie httpOnly, Lax and short-lived", async () => {
      const response = await get("/api/auth/google");
      const header =
        response.headers
          .getSetCookie()
          .find((value) => value.startsWith("payload-oauth-state=")) ?? "";

      expect(header).toContain("HttpOnly");
      expect(header).toContain("SameSite=Lax");
      expect(header).toContain("Path=/");
      expect(header).toContain("Secure");
      expect(header).toContain("Max-Age=600");
    });

    it("returns the visitor to the locale they started in", async () => {
      const response = await get("/api/auth/google?locale=fr");
      const cookie = cookiePair(response, "payload-oauth-state");
      const callback = await get(
        "/api/auth/google/callback?state=wrong",
        cookie === null ? {} : { cookie }
      );

      expect(callback.headers.get("Location")).toBe("/fr/sign-in?error=oauth");
    });
  });

  describe("the id token", () => {
    /** Runs a whole flow with the claims `grant` describes. */
    const signInWith = async (grant: CodeGrant) => {
      const flow = await start();

      return await get(
        `/api/auth/google/callback?code=${issueCode({
          ...grant,
          nonce: grant.nonce ?? flow.nonce,
        })}&state=${flow.state}`,
        { cookie: flow.cookie }
      );
    };

    it("refuses a token issued for another client", async () => {
      const response = await signInWith({
        aud: "some-other-client",
        email: unique("aud"),
        sub: `sub-${crypto.randomUUID()}`,
      });

      expect(response.headers.get("Location")).toBe("/nl/sign-in?error=oauth");
      expect(cookiePair(response, "payload-token")).toBeNull();
    });

    it("refuses a token from another issuer", async () => {
      const response = await signInWith({
        email: unique("iss"),
        iss: "https://accounts.evil.test",
        sub: `sub-${crypto.randomUUID()}`,
      });

      expect(response.headers.get("Location")).toBe("/nl/sign-in?error=oauth");
      expect(cookiePair(response, "payload-token")).toBeNull();
    });

    /**
     * The algorithm pin, tested for what it actually does.
     *
     * It is *not* protection against the classic "verify the RSA public key
     * as an HMAC secret" forgery — jose's JWKS resolver cannot be talked
     * into that, because `getKtyFromAlg` throws on any `alg` that is not
     * asymmetric (`jose/dist/webapi/jwks/local.js`). What it does is refuse
     * a token signed with a *different asymmetric* algorithm **for which the
     * provider publishes a perfectly good key**. Mutation S2 widens the pin
     * and this is what fails.
     */
    it("refuses a token signed with an algorithm the pin excludes", async () => {
      const flow = await start();
      const code = issueCode({
        email: unique("es256"),
        nonce: flow.nonce,
        signWith: { alg: "ES256", key: ecSigningKey, kid: "fake-ec-1" },
        sub: `sub-${crypto.randomUUID()}`,
      });

      const response = await get(
        `/api/auth/google/callback?code=${code}&state=${flow.state}`,
        { cookie: flow.cookie }
      );

      expect(response.headers.get("Location")).toBe("/nl/sign-in?error=oauth");
      expect(cookiePair(response, "payload-token")).toBeNull();
    });

    it("refuses a token signed by a key the JWKS does not publish", async () => {
      const response = await signInWith({
        email: unique("key"),
        sub: `sub-${crypto.randomUUID()}`,
        unknownKey: true,
      });

      expect(response.headers.get("Location")).toBe("/nl/sign-in?error=oauth");
      expect(cookiePair(response, "payload-token")).toBeNull();
    });

    it("refuses a token whose nonce is not the one this flow sent", async () => {
      const response = await signInWith({
        email: unique("nonce"),
        nonce: "a-nonce-from-some-other-flow",
        sub: `sub-${crypto.randomUUID()}`,
      });

      expect(response.headers.get("Location")).toBe("/nl/sign-in?error=oauth");
      expect(cookiePair(response, "payload-token")).toBeNull();
    });

    it("refuses a token with no subject", async () => {
      const response = await signInWith({
        email: unique("nosub"),
        sub: "",
      });

      expect(response.headers.get("Location")).toBe("/nl/sign-in?error=oauth");
      expect(cookiePair(response, "payload-token")).toBeNull();
    });

    it("refuses a token carrying no usable email", async () => {
      const response = await signInWith({
        email: "not-an-address",
        sub: `sub-${crypto.randomUUID()}`,
      });

      expect(response.headers.get("Location")).toBe("/nl/sign-in?error=oauth");
      expect(cookiePair(response, "payload-token")).toBeNull();
    });
  });

  describe("accounts", () => {
    const signInWith = async (grant: CodeGrant) => {
      const flow = await start();

      return await get(
        `/api/auth/google/callback?code=${issueCode({
          ...grant,
          nonce: grant.nonce ?? flow.nonce,
        })}&state=${flow.state}`,
        { cookie: flow.cookie }
      );
    };

    const findByEmail = async (email: string) => {
      const { docs } = await payload.find({
        collection: "users",
        overrideAccess: true,
        where: { email: { equals: email } },
      });

      return docs;
    };

    it("creates an account for a visitor who has never signed in", async () => {
      const email = unique("fresh");
      const subject = `sub-${crypto.randomUUID()}`;
      const response = await signInWith({ email, sub: subject });

      expect(response.status).toBe(303);
      expect(response.headers.get("Location")).toBe("/nl");
      expect(cookiePair(response, "payload-token")).not.toBeNull();

      const docs = await findByEmail(email);

      expect(docs).toHaveLength(1);
      expect(docs[0]?.role).toBe("user");
      expect(docs[0]?.oauthAccounts).toEqual([
        expect.objectContaining({ provider: "google", subject }),
      ]);
    });

    it("links a Google identity to an existing password account when the address is verified", async () => {
      const email = unique("link");
      const account = await payload.create({
        collection: "users",
        data: { email, password: "link-me-password-1234", role: "user" },
      });
      const subject = `sub-${crypto.randomUUID()}`;

      const response = await signInWith({
        email,
        emailVerified: true,
        sub: subject,
      });

      expect(cookiePair(response, "payload-token")).not.toBeNull();

      const docs = await findByEmail(email);

      // Linked, not duplicated.
      expect(docs).toHaveLength(1);
      expect(docs[0]?.id).toBe(account.id);
      expect(docs[0]?.oauthAccounts).toEqual([
        expect.objectContaining({ provider: "google", subject }),
      ]);
    });

    it("refuses to link when the provider will not say the address is verified", async () => {
      const email = unique("unverified-link");
      const account = await payload.create({
        collection: "users",
        data: { email, password: "do-not-link-me-1234", role: "user" },
      });

      const response = await signInWith({
        email,
        emailVerified: false,
        sub: `sub-${crypto.randomUUID()}`,
      });

      expect(response.headers.get("Location")).toBe(
        "/nl/sign-in?error=oauth-unverified"
      );
      expect(cookiePair(response, "payload-token")).toBeNull();

      const stored = await payload.findByID({
        collection: "users",
        id: account.id,
        overrideAccess: true,
      });

      expect(stored.oauthAccounts ?? []).toHaveLength(0);
    });

    it("refuses to register an unverified address too, and identically", async () => {
      const taken = unique("enum-taken");

      await payload.create({
        collection: "users",
        data: { email: taken, password: "already-here-12345", role: "user" },
      });

      const free = unique("enum-free");

      const onTaken = await signInWith({
        email: taken,
        emailVerified: false,
        sub: `sub-${crypto.randomUUID()}`,
      });
      const onFree = await signInWith({
        email: free,
        emailVerified: false,
        sub: `sub-${crypto.randomUUID()}`,
      });

      /*
       * Byte-for-byte, not merely "both failed". A refusal that distinguished
       * "cannot link" from "cannot register" would make Google sign-in the
       * enumeration oracle `endpoints/auth.ts` exists to close.
       */
      expect(await snapshot(onFree)).toEqual(await snapshot(onTaken));
      expect(await findByEmail(free)).toHaveLength(0);
    });

    it("treats email_verified as verified only when the provider says so", async () => {
      const email = unique("stringtrue");
      const response = await signInWith({
        email,
        emailVerified: "true",
        sub: `sub-${crypto.randomUUID()}`,
      });

      expect(cookiePair(response, "payload-token")).not.toBeNull();
      expect(await findByEmail(email)).toHaveLength(1);
    });

    it("follows the subject, not the address, when a Google account is renamed", async () => {
      const subject = `sub-${crypto.randomUUID()}`;
      const original = unique("renamed-before");

      await signInWith({ email: original, sub: subject });

      const [account] = await findByEmail(original);
      const renamed = await signInWith({
        email: unique("renamed-after"),
        sub: subject,
      });

      expect(cookiePair(renamed, "payload-token")).not.toBeNull();

      const { user } = await payload.auth({
        headers: new Headers({
          cookie: cookiePair(renamed, "payload-token") ?? "",
        }),
      });

      // The same account, not a second one minted from the new address.
      expect(user?.id).toBe(account?.id);
    });

    it("does not let a Google sign-in create an admin", async () => {
      const email = unique("noadmin");

      await signInWith({ email, sub: `sub-${crypto.randomUUID()}` });

      const [created] = await findByEmail(email);

      expect(created?.role).toBe("user");
    });
  });

  describe("the session it issues", () => {
    const signIn = async () => {
      const flow = await start();
      const email = unique("session");
      const response = await get(
        `/api/auth/google/callback?code=${issueCode({
          email,
          nonce: flow.nonce,
          sub: `sub-${crypto.randomUUID()}`,
        })}&state=${flow.state}`,
        { cookie: flow.cookie }
      );
      const cookie = cookiePair(response, "payload-token");

      if (cookie === null) {
        throw new Error("the callback did not issue a session");
      }

      return { cookie, email, response };
    };

    it("authenticates through the google strategy, not the local one", async () => {
      const { cookie, email } = await signIn();
      const { user } = await payload.auth({
        headers: new Headers({ cookie }),
      });

      expect(user?.email).toBe(email);
      expect((user as { _strategy?: string } | null)?._strategy).toBe("google");
    });

    it("is scoped to the whole site, so a locale switch keeps it", async () => {
      const { response } = await signIn();
      const header =
        response.headers
          .getSetCookie()
          .find((value) => value.startsWith("payload-token=")) ?? "";

      expect(header).toContain("Path=/");
      expect(header).not.toContain("Path=/nl");
      expect(header).toContain("HttpOnly");
      expect(header).toContain("Secure");
    });

    it("stops working once the session row is revoked", async () => {
      const { cookie } = await signIn();
      const { user } = await payload.auth({
        headers: new Headers({ cookie }),
      });

      if (user === null) {
        throw new Error("the session did not authenticate to begin with");
      }

      await payload.update({
        collection: "users",
        data: { sessions: [] },
        id: user.id,
        overrideAccess: true,
      });

      const after = await payload.auth({
        headers: new Headers({ cookie }),
      });

      expect(after.user).toBeNull();
    });

    it("is dropped by the site's own sign-out endpoint", async () => {
      const { cookie } = await signIn();

      const signedOut = await handleEndpoints({
        config,
        request: new Request(`${SITE}/api/auth/sign-out`, {
          body: new URLSearchParams({ locale: "nl" }).toString(),
          headers: new Headers({
            "Content-Type": "application/x-www-form-urlencoded",
            Cookie: cookie,
          }),
          method: "POST",
        }),
      });

      expect(signedOut.status).toBe(303);

      const after = await payload.auth({
        headers: new Headers({ cookie }),
      });

      expect(after.user).toBeNull();
    });

    /**
     * `createOAuthSession` writes the whole `sessions` array, so it has to
     * carry the live rows forward. Getting that wrong signs the visitor out
     * of every other device the moment they sign in again — and it is
     * invisible to every single-session test.
     */
    it("does not evict the sessions the account already had", async () => {
      const email = unique("two-sessions");

      await payload.create({
        collection: "users",
        data: { email, password: "two-sessions-password", role: "user" },
      });

      const { token } = await payload.login({
        collection: "users",
        data: { email, password: "two-sessions-password" },
      });

      const flow = await start();
      const response = await get(
        `/api/auth/google/callback?code=${issueCode({
          email,
          nonce: flow.nonce,
          sub: `sub-${crypto.randomUUID()}`,
        })}&state=${flow.state}`,
        { cookie: flow.cookie }
      );
      const google = cookiePair(response, "payload-token");

      if (google === null) {
        throw new Error("the callback did not issue a session");
      }

      const viaGoogle = await payload.auth({
        headers: new Headers({ cookie: google }),
      });
      const viaPassword = await payload.auth({
        headers: new Headers({ cookie: `payload-token=${token}` }),
      });

      expect(viaGoogle.user?.email).toBe(email);
      expect(viaPassword.user?.email).toBe(email);
    });

    it("leaves an ordinary password session working", async () => {
      const email = unique("password-session");

      await payload.create({
        collection: "users",
        data: { email, password: "password-session-1234", role: "user" },
      });

      const { token } = await payload.login({
        collection: "users",
        data: { email, password: "password-session-1234" },
      });

      const { user } = await payload.auth({
        headers: new Headers({ cookie: `payload-token=${token}` }),
      });

      expect(user?.email).toBe(email);
      // The custom strategy runs first; it must decline this one.
      expect((user as { _strategy?: string } | null)?._strategy).toBe(
        "local-jwt"
      );
    });
  });

  describe("when the provider is not configured", () => {
    it("says so rather than failing, and signs nobody in", async () => {
      const id = process.env.GOOGLE_CLIENT_ID;

      process.env.GOOGLE_CLIENT_ID = "";

      try {
        const response = await get("/api/auth/google");

        expect(response.status).toBe(303);
        expect(response.headers.get("Location")).toBe(
          "/nl/sign-in?error=oauth-unavailable"
        );
        expect(cookiePair(response, "payload-oauth-state")).toBeNull();
      } finally {
        process.env.GOOGLE_CLIENT_ID = id;
      }
    });
  });
});
