import { beforeEach, describe, expect, it, jest } from "@jest/globals";
import { createMobileApiClient } from "./api";

const SESSION_COOKIE = "smog.session_token=abc";

/** The part of the Better Auth Expo client the api client uses. */
const authClient = { getCookie: () => Promise.resolve(SESSION_COOKIE) };

interface Sent {
  credentials: RequestInit["credentials"];
  headers: Headers;
  url: string;
}

describe("mobile api client", () => {
  const sent: Sent[] = [];

  beforeEach(() => {
    sent.length = 0;
    process.env.EXPO_PUBLIC_API_URL = "https://smog-site-staging.workers.dev";
    process.env.EXPO_PUBLIC_ENVIRONMENT = "staging";
    process.env.EXPO_PUBLIC_SITE_HOST = "smog-site-staging.workers.dev";
    globalThis.fetch = jest.fn(
      (input: RequestInfo | URL, init?: RequestInit) => {
        const request = input as Request;
        sent.push({
          credentials: init?.credentials,
          headers: new Headers(request.headers),
          url: request.url,
        });
        return Promise.resolve(
          Response.json({ json: { environment: "staging", ok: true } })
        );
      }
    ) as typeof fetch;
  });

  it("calls EXPO_PUBLIC_API_URL with the Better Auth Expo cookie", async () => {
    expect(await createMobileApiClient(authClient).system.health()).toEqual({
      environment: "staging",
      ok: true,
    });
    expect(sent[0]?.url).toBe(
      "https://smog-site-staging.workers.dev/api/rpc/system/health"
    );
    expect(sent[0]?.headers.get("cookie")).toBe(SESSION_COOKIE);
    // The cookie is set by hand, so the platform cookie jar stays out of it.
    expect(sent[0]?.credentials).toBe("omit");
  });

  it("sends no cookie header for a guest", async () => {
    const guest = { getCookie: () => Promise.resolve("") };
    await createMobileApiClient(guest).system.whoami();
    expect(sent[0]?.headers.has("cookie")).toBe(false);
  });
});
