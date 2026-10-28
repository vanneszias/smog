import { exports } from "cloudflare:workers";
import { beforeAll, describe, expect, it } from "vitest";
import { ORIGIN, signedUp } from "./helpers";

function multipart(): FormData {
  // A plain HTML <form enctype=multipart/form-data> body oRPC would accept.
  const form = new FormData();
  form.set("data", JSON.stringify({ json: { name: "CSRF" } }));
  return form;
}

describe("CSRF defence on /api/rpc", () => {
  let cookie = "";

  beforeAll(async () => {
    ({ cookie } = await signedUp());
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
