// biome-ignore-all lint/performance/noAwaitInLoops: the fixtures are signed in and read one request at a time.
import { env, exports } from "cloudflare:workers";
import { jpegBytes, pngBytes, webpBytes } from "@smog/lessons/testing";
import { beforeAll, describe, expect, it } from "vitest";
import { getAuth, siteEnv } from "../src/server/auth";

const ORIGIN = "http://localhost:5173";
const PASSWORD = "correct horse battery";
const GESTURE_ID = "7d0c1a52-9a3e-4a0b-8a54-0f5f3c1b2e11";
const MAX = 524_288;

type Who = "admin" | "teacher" | "translator" | "user";

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

async function rpc<T>(
  path: string,
  json: unknown,
  cookie: string
): Promise<{ body: T; status: number }> {
  const response = await exports.default.fetch(`${ORIGIN}/api/rpc/${path}`, {
    body: JSON.stringify({ json }),
    headers: {
      "cf-connecting-ip": crypto.randomUUID(),
      "content-type": "application/json",
      cookie,
      origin: ORIGIN,
    },
    method: "POST",
  });
  const parsed = (await response.json()) as { json: T };
  return { body: parsed.json, status: response.status };
}

async function requestUpload(
  cookie: string,
  contentType = "image/png",
  step = 1
): Promise<Upload> {
  const { body, status } = await rpc<Upload>(
    "teacher/uploadDrawing",
    { contentType, gestureId: GESTURE_ID, size: 1000, step },
    cookie
  );
  expect(status).toBe(200);
  return body;
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

function get(path: string, headers: Record<string, string> = {}) {
  return exports.default.fetch(`${ORIGIN}${path}`, {
    headers: { "cf-connecting-ip": crypto.randomUUID(), ...headers },
  });
}

async function signedIn(who: Who): Promise<string> {
  const auth = getAuth();
  const email = `${crypto.randomUUID()}@smog.test`;
  await auth.api.signUpEmail({
    body: { email, name: `Drawing ${who}`, password: PASSWORD },
  });
  await siteEnv()
    .db.prepare("UPDATE user SET email_verified = 1 WHERE email = ?")
    .bind(email)
    .run();
  if (who !== "user") {
    await siteEnv()
      .db.prepare(
        "INSERT INTO user_role (user_id, role, granted_at) SELECT id, ?, ? FROM user WHERE email = ?"
      )
      .bind(who, Date.now(), email)
      .run();
  }
  const { headers } = await auth.api.signInEmail({
    body: { email, password: PASSWORD },
    returnHeaders: true,
  });
  return headers
    .getSetCookie()
    .map((value) => value.split(";")[0])
    .join("; ");
}

const cookies = {} as Record<Who, string>;

beforeAll(async () => {
  for (const who of ["admin", "teacher", "translator", "user"] as const) {
    cookies[who] = await signedIn(who);
  }
  await siteEnv()
    .db.prepare(
      "INSERT OR IGNORE INTO gesture (id, slug, name, sort_name, playback_id, created_at, updated_at) VALUES (?, 'drawing-route', 'Drawing route', 'drawing route', 'pb', 1, 1)"
    )
    .bind(GESTURE_ID)
    .run();
});

describe("PUT /api/teacher/drawings/upload/<key> (the signed fallback)", () => {
  it("stores a valid PNG with its type and uploadedAt, once", async () => {
    const upload = await requestUpload(cookies.teacher);
    expect(new URL(upload.uploadUrl).pathname).toBe(
      `/api/teacher/drawings/upload/${upload.key.slice("teacher/drawings/".length)}`
    );
    const response = await put(upload.uploadUrl, pngBytes(30, 20));
    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ key: upload.key });
    const stored = await media().head(upload.key);
    expect(stored?.httpMetadata?.contentType).toBe("image/png");
    expect(
      Date.parse(stored?.customMetadata?.uploadedAt ?? "")
    ).toBeGreaterThan(Date.now() - 60_000);
    expect((await put(upload.uploadUrl, pngBytes(30, 20))).status).toBe(409);
  });

  it("stores a JPEG signed as its own type and refuses to sign a WebP", async () => {
    const jpeg = await requestUpload(cookies.teacher, "image/jpeg");
    expect(
      (
        await put(jpeg.uploadUrl, jpegBytes(50, 50), {
          "content-type": "image/jpeg",
        })
      ).status
    ).toBe(200);
    // A WebP cannot be embedded in the PDF: a PUT claiming it is refused.
    expect(
      (
        await put(jpeg.uploadUrl, webpBytes(50, 50, "extended"), {
          "content-type": "image/webp",
        })
      ).status
    ).toBe(415);
  });

  it("refuses wrong bytes, a type that is not the signed one, a side over 1,200 px and a file over 512 KiB", async () => {
    const upload = await requestUpload(cookies.teacher);
    const html = new TextEncoder().encode("<script>alert(1)</script>");
    expect((await put(upload.uploadUrl, html)).status).toBe(415);
    // A JPEG sent as the signed PNG type.
    expect((await put(upload.uploadUrl, jpegBytes())).status).toBe(415);
    expect((await put(upload.uploadUrl, pngBytes(1300, 10))).status).toBe(422);
    expect((await put(upload.uploadUrl, new Uint8Array(MAX + 1))).status).toBe(
      413
    );
    expect(
      (
        await put(upload.uploadUrl, pngBytes(), {
          "content-type": "image/webp",
        })
      ).status
    ).toBe(415);
    // A type that is allowed but not the signed one.
    expect(
      (
        await put(upload.uploadUrl, jpegBytes(), {
          "content-type": "image/jpeg",
        })
      ).status
    ).toBe(403);
    expect(
      (
        await put(upload.uploadUrl, pngBytes(), {
          "content-type": "image/svg+xml",
        })
      ).status
    ).toBe(415);
    expect(await media().head(upload.key)).toBeNull();
  });

  it("refuses an unsigned URL, an expired one, a foreign origin and a key that is not a drawing key", async () => {
    const upload = await requestUpload(cookies.teacher);
    const unsigned = new URL(upload.uploadUrl);
    unsigned.searchParams.delete("sig");
    expect((await put(unsigned.toString(), pngBytes())).status).toBe(403);
    const expired = new URL(upload.uploadUrl);
    expired.searchParams.set("exp", "1");
    expect((await put(expired.toString(), pngBytes())).status).toBe(403);
    expect(
      (
        await put(upload.uploadUrl, pngBytes(), {
          origin: "https://evil.example",
        })
      ).status
    ).toBe(403);
    expect(
      (
        await put(
          `${ORIGIN}/api/teacher/drawings/upload/x/y/z?exp=1&sig=a`,
          pngBytes()
        )
      ).status
    ).toBe(404);
    expect(await media().head(upload.key)).toBeNull();
  });

  it("is not offered to a learner or a translator", async () => {
    for (const who of ["user", "translator"] as const) {
      const { status } = await rpc(
        "teacher/uploadDrawing",
        {
          contentType: "image/png",
          gestureId: GESTURE_ID,
          size: 10,
          step: 1,
        },
        cookies[who]
      );
      expect(status, who).toBe(403);
    }
  });
});

describe("GET /api/teacher/drawings/<gestureId>/<step>", () => {
  const path = `/api/teacher/drawings/${GESTURE_ID}/1`;

  async function recorded(
    bytes: Uint8Array<ArrayBuffer>,
    contentType = "image/png"
  ) {
    const upload = await requestUpload(cookies.teacher, contentType);
    expect(
      (await put(upload.uploadUrl, bytes, { "content-type": contentType }))
        .status
    ).toBe(200);
    const { body, status } = await rpc<{ path: string }>(
      "teacher/finalizeDrawing",
      { credit: "© Invented", gestureId: GESTURE_ID, key: upload.key, step: 1 },
      cookies.teacher
    );
    expect(status).toBe(200);
    return body;
  }

  it("serves the image to a teacher, a translator and an admin, privately", async () => {
    const bytes = pngBytes(40, 30);
    const row = await recorded(bytes);
    expect(row.path).toMatch(new RegExp(`^${path}\\?v=\\d+$`));
    for (const who of ["teacher", "translator", "admin"] as const) {
      const response = await get(row.path, { cookie: cookies[who] });
      expect(response.status, who).toBe(200);
      expect(response.headers.get("content-type")).toBe("image/png");
      expect(response.headers.get("cache-control")).toBe("private, no-cache");
      expect(response.headers.get("vary")).toBe("Cookie");
      expect(response.headers.get("x-content-type-options")).toBe("nosniff");
      expect(response.headers.get("content-security-policy")).toContain(
        "sandbox"
      );
      expect(response.headers.get("cross-origin-resource-policy")).toBe(
        "same-origin"
      );
      expect(new Uint8Array(await response.arrayBuffer())).toEqual(bytes);
    }
  });

  it("answers 304 to a matching If-None-Match, with the same private policy", async () => {
    await recorded(pngBytes());
    const first = await get(path, { cookie: cookies.teacher });
    const etag = first.headers.get("etag") ?? "";
    await first.arrayBuffer();
    expect(etag).not.toBe("");
    const second = await get(path, {
      cookie: cookies.teacher,
      "if-none-match": etag,
    });
    expect(second.status).toBe(304);
    expect(second.headers.get("cache-control")).toBe("private, no-cache");
  });

  it("is refused to a guest (401) and a learner (403) whether or not the drawing exists", async () => {
    await recorded(pngBytes());
    const unknown = `/api/teacher/drawings/${crypto.randomUUID()}/1`;
    const odd = "/api/teacher/drawings/not-a-uuid";
    for (const target of [path, `${path.slice(0, -1)}2`, unknown, odd]) {
      const guest = await get(target);
      expect(guest.status, target).toBe(401);
      expect(guest.headers.get("cache-control")).toBe("no-store");
      const learner = await get(target, { cookie: cookies.user });
      expect(learner.status, target).toBe(403);
      expect(learner.headers.get("cache-control")).toBe("no-store");
      await Promise.all([guest.text(), learner.text()]);
    }
  });

  it("is 404 for an allowed role asking for what is not there, and never shares a body", async () => {
    await recorded(pngBytes());
    for (const target of [
      `${path.slice(0, -1)}2`,
      `/api/teacher/drawings/${crypto.randomUUID()}/1`,
      `/api/teacher/drawings/${GESTURE_ID}/3`,
      `/api/teacher/drawings/${GESTURE_ID}`,
      `/api/teacher/drawings/${GESTURE_ID}/1/extra`,
    ]) {
      const response = await get(target, { cookie: cookies.teacher });
      expect(response.status, target).toBe(404);
      expect(response.headers.get("cache-control")).toBe("no-store");
      await response.text();
    }
  });

  it("serves no object by its storage key: the key is not a route", async () => {
    await recorded(pngBytes());
    const row = await siteEnv()
      .db.prepare(
        "SELECT r2_key AS key FROM gesture_drawing WHERE gesture_id = ? AND step = 1"
      )
      .bind(GESTURE_ID)
      .first<{ key: string }>();
    const key = row?.key ?? "";
    const response = await get(
      `/api/teacher/drawings/${key.slice("teacher/drawings/".length)}`,
      { cookie: cookies.admin }
    );
    expect(response.status).toBe(404);
    await response.text();
    // And no public path under the old naming schemes finds it either.
    for (const other of [`/${key}`, `/api/${key}`, `/api/audio/${key}`]) {
      const guest = await get(other);
      expect([401, 403, 404], other).toContain(guest.status);
      expect(await guest.text()).not.toContain("PNG");
    }
  });

  it("shows a replaced drawing at once through the new ?v= and serves the new bytes", async () => {
    const first = await recorded(pngBytes(10, 10));
    // `updatedAt` has millisecond resolution; the replace happens later.
    const second = await recorded(jpegBytes(20, 20), "image/jpeg");
    expect(second.path).not.toBe(first.path);
    const response = await get(second.path, { cookie: cookies.teacher });
    expect(response.headers.get("content-type")).toBe("image/jpeg");
    await response.arrayBuffer();
  });
});
