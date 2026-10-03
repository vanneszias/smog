import { env, exports } from "cloudflare:workers";
import { createFakeMollie } from "@smog/payments/testing";
import { signLogoUpload } from "@smog/sponsorships/server";
import { describe, expect, it } from "vitest";
import { getAuth, siteEnv } from "../src/server/auth";
import { checkoutVia, logoKeysOf } from "./sponsorships";

const ORIGIN = "http://localhost:5173";
const PASSWORD = "correct horse battery";
const MAX = 2 * 1024 * 1024;
const SECRET = "site-test-secret-at-least-32-characters";
const LOGO_KEY = /^logos\/[0-9a-f-]{36}$/;

const PNG_HEAD = [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a];
const GIF_HEAD = Array.from("GIF89a", (c) => c.charCodeAt(0));

function file(head: number[], size = 128): Uint8Array<ArrayBuffer> {
  const bytes = new Uint8Array(size);
  bytes.set(head);
  return bytes;
}

function media(): R2Bucket {
  if (!env.MEDIA) {
    throw new Error("[test] The MEDIA binding is missing");
  }
  return env.MEDIA;
}

interface Upload {
  expiresAt: number;
  headers: { "content-type": string };
  key: string;
  uploadUrl: string;
}

/** `sponsorships.uploadLogo` over `/api/rpc`, as the wizard calls it. */
async function requestUpload(contentType = "image/png"): Promise<Upload> {
  const response = await exports.default.fetch(
    `${ORIGIN}/api/rpc/sponsorships/uploadLogo`,
    {
      body: JSON.stringify({ json: { contentType, size: 1000 } }),
      headers: {
        "cf-connecting-ip": crypto.randomUUID(),
        "content-type": "application/json",
        origin: ORIGIN,
      },
      method: "POST",
    }
  );
  expect(response.status).toBe(200);
  return ((await response.json()) as { json: Upload }).json;
}

function put(
  url: string,
  body: BodyInit,
  headers: Record<string, string> = {}
): Promise<Response> {
  return exports.default.fetch(url, {
    body,
    headers: {
      "cf-connecting-ip": crypto.randomUUID(),
      "content-type": "image/png",
      origin: ORIGIN,
      ...headers,
    },
    method: "PUT",
  });
}

/** A verified account with `role`, signed in in-process: its cookie. */
async function signedIn(role: "admin" | "user"): Promise<string> {
  const auth = getAuth();
  const email = `${crypto.randomUUID()}@smog.test`;
  await auth.api.signUpEmail({
    body: { email, name: `Logo ${role}`, password: PASSWORD },
  });
  await siteEnv()
    .db.prepare("UPDATE user SET email_verified = 1, role = ? WHERE email = ?")
    .bind(role, email)
    .run();
  const { headers } = await auth.api.signInEmail({
    body: { email, password: PASSWORD },
    returnHeaders: true,
  });
  return headers
    .getSetCookie()
    .map((value) => value.split(";")[0])
    .join("; ");
}

describe("PUT /api/logos/upload/$key (the signed fallback, ruling 10)", () => {
  it("stores a valid PNG with its type and uploadedAt", async () => {
    const upload = await requestUpload();
    expect(new URL(upload.uploadUrl).pathname).toBe(
      `/api/logos/upload/${upload.key.slice("logos/".length)}`
    );
    const response = await put(upload.uploadUrl, file(PNG_HEAD));
    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ key: upload.key });
    const stored = await media().head(upload.key);
    expect(stored?.httpMetadata?.contentType).toBe("image/png");
    expect(stored?.size).toBe(128);
    expect(
      Date.parse(stored?.customMetadata?.uploadedAt ?? "")
    ).toBeGreaterThan(Date.now() - 60_000);
  });

  it("refuses a type other than the signed one, a renamed GIF and a file over 2 MiB", async () => {
    const upload = await requestUpload();
    const jpeg = await put(upload.uploadUrl, file(PNG_HEAD), {
      "content-type": "image/jpeg",
    });
    expect(jpeg.status).toBe(403);
    const gif = await put(upload.uploadUrl, file(GIF_HEAD));
    expect(gif.status).toBe(415);
    const large = await put(upload.uploadUrl, file(PNG_HEAD, MAX + 1));
    expect(large.status).toBe(413);
    const notImage = await put(upload.uploadUrl, file(PNG_HEAD), {
      "content-type": "image/gif",
    });
    expect(notImage.status).toBe(415);
    expect(await media().head(upload.key)).toBeNull();
  });

  it("refuses a forged or expired signature", async () => {
    const upload = await requestUpload();
    const forged = new URL(upload.uploadUrl);
    forged.searchParams.set("sig", "A".repeat(43));
    expect((await put(forged.toString(), file(PNG_HEAD))).status).toBe(403);
    const later = new URL(upload.uploadUrl);
    later.searchParams.set("exp", String(upload.expiresAt + 60_000));
    expect((await put(later.toString(), file(PNG_HEAD))).status).toBe(403);
    // A valid signature on an expiry in the past: EXPIRED, not FORBIDDEN.
    const past = Date.now() - 1000;
    const expired = new URL(upload.uploadUrl);
    expired.searchParams.set("exp", String(past));
    expired.searchParams.set(
      "sig",
      await signLogoUpload(SECRET, {
        contentType: "image/png",
        expiresAt: past,
        key: upload.key,
      })
    );
    const late = await put(expired.toString(), file(PNG_HEAD));
    expect(late.status).toBe(403);
    expect(await late.json()).toEqual({ code: "EXPIRED" });
    const other = new URL(upload.uploadUrl);
    other.pathname = `/api/logos/upload/${crypto.randomUUID()}`;
    expect((await put(other.toString(), file(PNG_HEAD))).status).toBe(403);
    expect(await media().head(upload.key)).toBeNull();
  });

  it("counts a streamed body without Content-Length and refuses it past 2 MiB", async () => {
    const upload = await requestUpload();
    const chunk = file(PNG_HEAD, 1024 * 1024);
    const stream = new ReadableStream<Uint8Array>({
      start(controller) {
        controller.enqueue(chunk);
        controller.enqueue(new Uint8Array(1024 * 1024));
        controller.enqueue(new Uint8Array(1));
        controller.close();
      },
    });
    const response = await exports.default.fetch(upload.uploadUrl, {
      body: stream,
      // @ts-expect-error workerd takes `duplex` for a streamed body.
      duplex: "half",
      headers: { "content-type": "image/png", origin: ORIGIN },
      method: "PUT",
    });
    expect(response.status).toBe(413);
    expect(await media().head(upload.key)).toBeNull();
  });

  it("takes one upload per URL: a second PUT is a 409 and keeps the first", async () => {
    const upload = await requestUpload();
    expect((await put(upload.uploadUrl, file(PNG_HEAD))).status).toBe(200);
    const again = await put(upload.uploadUrl, file(PNG_HEAD, 64));
    expect(again.status).toBe(409);
    expect((await media().head(upload.key))?.size).toBe(128);
  });

  it("is limited by RL_SPONSOR per IP", async () => {
    const upload = await requestUpload();
    const ip = crypto.randomUUID();
    const statuses: number[] = [];
    for (let i = 0; i < 8; i += 1) {
      // biome-ignore lint/performance/noAwaitInLoops: one PUT at a time, to count them.
      const response = await put(upload.uploadUrl, file(PNG_HEAD), {
        "cf-connecting-ip": ip,
        "content-type": "image/gif",
      });
      statuses.push(response.status);
      await response.body?.cancel();
    }
    expect(statuses).toContain(429);
  });

  it("refuses a foreign origin", async () => {
    const upload = await requestUpload();
    const response = await put(upload.uploadUrl, file(PNG_HEAD), {
      origin: "https://evil.example",
    });
    expect(response.status).toBe(403);
    expect(await media().head(upload.key)).toBeNull();
  });
});

describe("the checkout claims an uploaded logo (I-2)", () => {
  it("copies the fallback upload to a fresh key and deletes the upload, so the URL can no longer reach it", async () => {
    const upload = await requestUpload();
    expect((await put(upload.uploadUrl, file(PNG_HEAD))).status).toBe(200);
    const checkout = await checkoutVia(createFakeMollie(), {
      count: 1,
      logoKey: upload.key,
    });
    const [stored] = await logoKeysOf(checkout.sponsorshipIds);
    expect(stored).not.toBe(upload.key);
    expect(stored).toMatch(LOGO_KEY);
    expect(await media().head(upload.key)).toBeNull();
    const copy = await media().get(stored ?? "");
    expect(copy?.httpMetadata?.contentType).toBe("image/png");
    expect(
      new Uint8Array((await copy?.arrayBuffer()) ?? []).slice(0, 8)
    ).toEqual(new Uint8Array(PNG_HEAD));
    // The still-valid URL now only creates an orphan the purge removes.
    expect((await put(upload.uploadUrl, file(PNG_HEAD))).status).toBe(200);
    expect(await logoKeysOf(checkout.sponsorshipIds)).toEqual([stored]);
  });
});

describe("GET /api/logos/$key (an admin read)", () => {
  it("streams a logo to an admin, privately and with nosniff", async () => {
    const upload = await requestUpload();
    await put(upload.uploadUrl, file(PNG_HEAD));
    const id = upload.key.slice("logos/".length);
    const cookie = await signedIn("admin");
    const response = await exports.default.fetch(`${ORIGIN}/api/logos/${id}`, {
      headers: { cookie },
    });
    expect(response.status).toBe(200);
    expect(response.headers.get("content-type")).toBe("image/png");
    expect(response.headers.get("cache-control")).toBe("private, no-store");
    expect(response.headers.get("x-content-type-options")).toBe("nosniff");
    expect(response.headers.get("cross-origin-resource-policy")).toBe(
      "same-origin"
    );
    expect(new Uint8Array(await response.arrayBuffer()).slice(0, 8)).toEqual(
      new Uint8Array(PNG_HEAD)
    );
  });

  it("answers 401 without a session, 403 for a user and 404 for an unknown key", async () => {
    const upload = await requestUpload();
    await put(upload.uploadUrl, file(PNG_HEAD));
    const id = upload.key.slice("logos/".length);
    const anonymous = await exports.default.fetch(`${ORIGIN}/api/logos/${id}`);
    expect(anonymous.status).toBe(401);
    const user = await exports.default.fetch(`${ORIGIN}/api/logos/${id}`, {
      headers: { cookie: await signedIn("user") },
    });
    expect(user.status).toBe(403);
    const admin = await signedIn("admin");
    for (const missing of [crypto.randomUUID(), "not-a-key", "..%2Fsecret"]) {
      // biome-ignore lint/performance/noAwaitInLoops: one key at a time.
      const response = await exports.default.fetch(
        `${ORIGIN}/api/logos/${missing}`,
        { headers: { cookie: admin } }
      );
      expect(response.status, missing).toBe(404);
      await response.body?.cancel();
    }
  });
});
