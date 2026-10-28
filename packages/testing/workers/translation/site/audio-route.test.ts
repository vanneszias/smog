import { env, exports } from "cloudflare:workers";
import { beforeAll, describe, expect, it } from "vitest";
import { getAuth, siteEnv } from "../../../../../apps/site/src/server/auth";
import { m4aBytes, mp3Bytes } from "../../../support/translation/fixtures";

const ORIGIN = "http://localhost:5173";
const PASSWORD = "correct horse battery";
const GESTURE_ID = "7d0c1a52-9a3e-4a0b-8a54-0f5f3c1b2e01";
const MAX = 1_048_576;

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

/** `translation.uploadAudio` over `/api/rpc`, as the editor calls it. */
async function requestUpload(
  cookie: string,
  contentType = "audio/mpeg",
  locale = "fr"
): Promise<Upload> {
  const { body, status } = await rpc<Upload>(
    "translation/uploadAudio",
    { contentType, gestureId: GESTURE_ID, locale, size: 1000 },
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
      "content-type": "audio/mpeg",
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

async function signedIn(role: "translator" | "user"): Promise<string> {
  const auth = getAuth();
  const email = `${crypto.randomUUID()}@smog.test`;
  await auth.api.signUpEmail({
    body: { email, name: `Audio ${role}`, password: PASSWORD },
  });
  await siteEnv()
    .db.prepare("UPDATE user SET email_verified = 1 WHERE email = ?")
    .bind(email)
    .run();
  if (role === "translator") {
    await siteEnv()
      .db.prepare(
        "INSERT INTO user_role (user_id, role, granted_at) SELECT id, 'translator', ? FROM user WHERE email = ?"
      )
      .bind(Date.now(), email)
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

let translator: string;
let learner: string;

beforeAll(async () => {
  translator = await signedIn("translator");
  learner = await signedIn("user");
  await siteEnv()
    .db.prepare(
      "INSERT OR IGNORE INTO gesture (id, slug, name, sort_name, playback_id, created_at, updated_at) VALUES (?, 'audio-route', 'Audio route', 'audio route', 'pb', 1, 1)"
    )
    .bind(GESTURE_ID)
    .run();
});

describe("PUT /api/audio/upload/<key> (the signed fallback)", () => {
  it("stores a valid MP3 with its type and uploadedAt, once", async () => {
    const upload = await requestUpload(translator);
    expect(new URL(upload.uploadUrl).pathname).toBe(
      `/api/audio/upload/${upload.key.slice("audio/".length)}`
    );
    const response = await put(upload.uploadUrl, mp3Bytes(2));
    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ key: upload.key });
    const stored = await media().head(upload.key);
    expect(stored?.httpMetadata?.contentType).toBe("audio/mpeg");
    expect(
      Date.parse(stored?.customMetadata?.uploadedAt ?? "")
    ).toBeGreaterThan(Date.now() - 60_000);
    expect((await put(upload.uploadUrl, mp3Bytes(2))).status).toBe(409);
  });

  it("stores an M4A signed as audio/mp4", async () => {
    const upload = await requestUpload(translator, "audio/mp4");
    const response = await put(upload.uploadUrl, m4aBytes(2), {
      "content-type": "audio/mp4",
    });
    expect(response.status).toBe(200);
  });

  it("refuses wrong magic bytes, a clip over ten seconds and a file over 1 MiB", async () => {
    const png = Uint8Array.from([
      0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0, 0, 0, 0,
    ]);
    const first = await requestUpload(translator);
    expect((await put(first.uploadUrl, png)).status).toBe(415);
    expect((await put(first.uploadUrl, mp3Bytes(12))).status).toBe(422);
    expect((await put(first.uploadUrl, new Uint8Array(MAX + 1))).status).toBe(
      413
    );
    expect(await media().head(first.key)).toBeNull();
  });

  it("refuses an M4A sent as the signed MP3 type, another type than signed and an unsigned URL", async () => {
    const upload = await requestUpload(translator);
    expect((await put(upload.uploadUrl, m4aBytes(2))).status).toBe(415);
    expect(
      (
        await put(upload.uploadUrl, mp3Bytes(1), {
          "content-type": "audio/mp4",
        })
      ).status
    ).toBe(403);
    const unsigned = new URL(upload.uploadUrl);
    unsigned.searchParams.delete("sig");
    expect((await put(unsigned.toString(), mp3Bytes(1))).status).toBe(403);
    expect(await media().head(upload.key)).toBeNull();
  });

  it("refuses a foreign origin and a key that is not an audio key", async () => {
    const upload = await requestUpload(translator);
    expect(
      (
        await put(upload.uploadUrl, mp3Bytes(1), {
          origin: "https://evil.example",
        })
      ).status
    ).toBe(403);
    expect(
      (await put(`${ORIGIN}/api/audio/upload/x/y/z?exp=1&sig=a`, mp3Bytes(1)))
        .status
    ).toBe(404);
  });

  it("is not offered to a learner", async () => {
    const { status } = await rpc(
      "translation/uploadAudio",
      {
        contentType: "audio/mpeg",
        gestureId: GESTURE_ID,
        locale: "fr",
        size: 10,
      },
      learner
    );
    expect(status).toBe(403);
  });
});

describe("GET /api/audio/<key>", () => {
  async function recorded(): Promise<{ bytes: Uint8Array; path: string }> {
    const upload = await requestUpload(translator, "audio/mpeg", "en");
    const bytes = mp3Bytes(2);
    expect((await put(upload.uploadUrl, bytes)).status).toBe(200);
    const { body, status } = await rpc<{ path: string }>(
      "translation/finalizeAudio",
      { gestureId: GESTURE_ID, key: upload.key, locale: "en" },
      translator
    );
    expect(status).toBe(200);
    return { bytes, path: body.path };
  }

  it("serves a clip to anyone, cached for a year, with Range support and no sniffing", async () => {
    const { bytes, path } = await recorded();
    const whole = await get(path);
    expect(whole.status).toBe(200);
    expect(whole.headers.get("cache-control")).toBe(
      "public, max-age=31536000, immutable"
    );
    expect(whole.headers.get("content-type")).toBe("audio/mpeg");
    expect(whole.headers.get("accept-ranges")).toBe("bytes");
    expect(whole.headers.get("x-content-type-options")).toBe("nosniff");
    expect(whole.headers.get("content-security-policy")).toContain("sandbox");
    expect(new Uint8Array(await whole.arrayBuffer())).toEqual(bytes);

    const part = await get(path, { range: "bytes=0-99" });
    expect(part.status).toBe(206);
    expect(part.headers.get("content-range")).toBe(
      `bytes 0-99/${bytes.length}`
    );
    expect(part.headers.get("content-length")).toBe("100");
    expect(part.headers.get("cache-control")).toBe(
      "public, max-age=31536000, immutable"
    );
    expect(new Uint8Array(await part.arrayBuffer())).toEqual(
      bytes.slice(0, 100)
    );

    const tail = await get(path, { range: "bytes=-50" });
    expect(tail.status).toBe(206);
    expect(tail.headers.get("content-range")).toBe(
      `bytes ${bytes.length - 50}-${bytes.length - 1}/${bytes.length}`
    );
  });

  it("answers 404 for an unknown or malformed key (never cached) and 416 for a bad range", async () => {
    const missing = await get(
      `/api/audio/${GESTURE_ID}/en/${crypto.randomUUID()}`
    );
    expect(missing.status).toBe(404);
    expect(missing.headers.get("cache-control")).toBe("no-store");
    expect((await get("/api/audio/not-a-key")).status).toBe(404);
    const { path } = await recorded();
    expect((await get(path, { range: "bytes=abc" })).status).toBe(416);
  });
});
