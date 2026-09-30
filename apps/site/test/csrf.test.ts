import { exports } from "cloudflare:workers";
import { beforeAll, describe, expect, it } from "vitest";

import { ORIGIN, waitForMail } from "./helpers";

const TOKEN_LINK =
  /http:\/\/localhost:5173\/api\/auth\/verify-email\?token=\S+/;

/** Signs up, follows the verification link and returns the session cookie. */
async function signedInCookie(): Promise<string> {
  const email = `${crypto.randomUUID()}@smog.test`;
  const signUp = await exports.default.fetch(
    `${ORIGIN}/api/auth/sign-up/email`,
    {
      body: JSON.stringify({
        email,
        name: "A",
        password: "correct horse battery",
      }),
      headers: { "content-type": "application/json", origin: ORIGIN },
      method: "POST",
    }
  );
  expect(signUp.status).toBe(200);
  const [message] = await waitForMail(email, {
    match: ({ text }) => TOKEN_LINK.test(text),
  });
  const link = message?.text.match(TOKEN_LINK)?.[0] ?? "";
  const verified = await exports.default.fetch(link, { redirect: "manual" });
  return verified.headers
    .getSetCookie()
    .map((cookie) => cookie.split(";")[0])
    .join("; ");
}

function multipart(): FormData {
  // A plain HTML <form enctype=multipart/form-data> body oRPC would accept.
  const form = new FormData();
  form.set("data", JSON.stringify({ json: { name: "CSRF" } }));
  return form;
}

describe("CSRF defence on /api/rpc", () => {
  let cookie = "";

  beforeAll(async () => {
    cookie = await signedInCookie();
  });

  async function myLists(): Promise<unknown[]> {
    const response = await exports.default.fetch(
      `${ORIGIN}/api/rpc/lists/mine`,
      {
        body: "{}",
        headers: { "content-type": "application/json", cookie },
        method: "POST",
      }
    );
    expect(response.status).toBe(200);
    return ((await response.json()) as { json: unknown[] }).json;
  }

  it("rejects a cross-site form POST that carries the session cookie", async () => {
    const response = await exports.default.fetch(
      `${ORIGIN}/api/rpc/lists/create`,
      {
        body: multipart(),
        headers: {
          cookie,
          origin: "https://evil.example",
          "sec-fetch-site": "cross-site",
        },
        method: "POST",
      }
    );

    expect(response.status).toBe(403);
    expect(await response.json()).toMatchObject({
      json: { code: "FORBIDDEN", defined: true },
    });
    expect(await myLists()).toEqual([]);
  });

  it("rejects a foreign Origin without Fetch Metadata (older browsers)", async () => {
    const response = await exports.default.fetch(
      `${ORIGIN}/api/rpc/lists/create`,
      {
        body: multipart(),
        headers: { cookie, origin: "https://evil.example" },
        method: "POST",
      }
    );
    expect(response.status).toBe(403);
  });

  it("rejects a foreign Origin on the OpenAPI transport too", async () => {
    const response = await exports.default.fetch(
      `${ORIGIN}/api/openapi/system/health`,
      { headers: { origin: "https://evil.example" }, method: "POST" }
    );
    expect(response.status).toBe(403);
  });

  it("passes a same-origin POST", async () => {
    const response = await exports.default.fetch(
      `${ORIGIN}/api/rpc/lists/create`,
      {
        body: JSON.stringify({ json: { name: "Same origin" } }),
        headers: {
          "content-type": "application/json",
          cookie,
          origin: ORIGIN,
          "sec-fetch-site": "same-origin",
        },
        method: "POST",
      }
    );
    expect(response.status).toBe(200);
    expect(await myLists()).toHaveLength(1);
  });

  it("passes a native POST with neither Origin nor Sec-Fetch-Site", async () => {
    const response = await exports.default.fetch(
      `${ORIGIN}/api/rpc/lists/create`,
      {
        body: JSON.stringify({ json: { name: "Native" } }),
        headers: { "content-type": "application/json", cookie },
        method: "POST",
      }
    );
    expect(response.status).toBe(200);
    expect(await myLists()).toHaveLength(2);
  });
});
