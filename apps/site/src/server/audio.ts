import { AUDIO_CONTENT_TYPES, AUDIO_MAX_BYTES } from "@smog/db/enums";
import { checkRateLimit, isForeignRequest } from "@smog/rpc";
import { AUDIO_KEY_PATTERN } from "@smog/translation/schema";
import { inspectAudio, verifyAudioUpload } from "@smog/translation/server";
import { readCappedBody } from "@smog/utils";
import { siteEnv } from "./auth";
import { clientIp } from "./context";

/**
 * The gesture audio routes (phase 10b ruling 6). The path after
 * `/api/audio/` is `<gestureId>/<locale>/<uuid>`, the R2 key without its
 * `audio/` prefix.
 *
 * - `GET /api/audio/<gestureId>/<locale>/<uuid>`: a clip, public like the
 *   gesture page that links it. The key changes on every replace, so the
 *   response is cached for a year (`immutable`), and `Range` is answered
 *   (Safari and mobile players ask for it). `RL_API` per IP.
 * - `PUT /api/audio/upload/<gestureId>/<locale>/<uuid>?exp=<ms>&sig=<hmac>`:
 *   the signed same-origin fallback of `translation.uploadAudio` when the R2
 *   tokens are unset. It checks `isForeignRequest`, `RL_API` per IP, the
 *   signature (key, `Content-Type` and expiry), the size (at most 1 MiB, by
 *   `Content-Length` and by counting the stream) and the bytes (an MP3 or
 *   M4A of at most 10 s), then writes `MEDIA` once: a key that exists is a
 *   409. `finalizeAudio` checks everything again before it records the clip.
 */

const EXP = /^\d{1,15}$/;
const BYTE_RANGE = /^bytes=\d*-\d*$/;

function json(status: number, body: unknown): Response {
  return Response.json(body, {
    headers: { "cache-control": "no-store" },
    status,
  });
}

function media(): R2Bucket {
  return siteEnv().bindings.MEDIA;
}

function isAudioType(value: string): boolean {
  return AUDIO_CONTENT_TYPES.some((type) => type === value);
}

/**
 * The body of an upload when it is a clip of the signed type within the
 * caps (size, then the bytes: MP3 or M4A, at most 10 s); else the refusal.
 */
async function readClip(
  request: Request,
  contentType: string
): Promise<{ bytes: Uint8Array<ArrayBuffer> } | Response> {
  const body = await readCappedBody(request, AUDIO_MAX_BYTES);
  if (!body.ok) {
    return json(body.status, {
      code: body.status === 413 ? "TOO_LARGE" : "BAD_REQUEST",
    });
  }
  const inspected = inspectAudio(body.bytes);
  if (!inspected.ok) {
    const tooLong = inspected.reason === "duration";
    return json(tooLong ? 422 : 415, {
      code: tooLong ? "TOO_LONG" : "UNSUPPORTED_TYPE",
    });
  }
  return inspected.contentType === contentType
    ? { bytes: body.bytes }
    : json(415, { code: "UNSUPPORTED_TYPE" });
}

export async function handleAudioUpload(
  request: Request,
  path: string
): Promise<Response> {
  const { auth, rateLimits, worker } = siteEnv();
  if (isForeignRequest(request, worker)) {
    return json(403, { code: "FORBIDDEN" });
  }
  if (
    !(await checkRateLimit(
      rateLimits.RL_API,
      `${clientIp(request)}:audio-upload`
    ))
  ) {
    return json(429, { code: "RATE_LIMITED" });
  }
  const key = `audio/${path}`;
  if (!AUDIO_KEY_PATTERN.test(key)) {
    return json(404, { code: "NOT_FOUND" });
  }
  const url = new URL(request.url);
  const exp = url.searchParams.get("exp") ?? "";
  const signature = url.searchParams.get("sig") ?? "";
  const contentType = request.headers.get("content-type") ?? "";
  if (!isAudioType(contentType)) {
    return json(415, { code: "UNSUPPORTED_TYPE" });
  }
  const verdict = EXP.test(exp)
    ? await verifyAudioUpload(auth.BETTER_AUTH_SECRET, {
        contentType,
        expiresAt: Number.parseInt(exp, 10),
        key,
        now: Date.now(),
        signature,
      })
    : "invalid";
  if (verdict !== "ok") {
    console.warn(`[audio] Refused an upload to ${key}: ${verdict}`);
    return json(403, {
      code: verdict === "expired" ? "EXPIRED" : "FORBIDDEN",
    });
  }
  if (await media().head(key)) {
    return json(409, { code: "ALREADY_UPLOADED" });
  }
  const body = await readClip(request, contentType);
  if (body instanceof Response) {
    return body;
  }
  try {
    // Only if absent: two PUTs racing on one URL store one object.
    const stored = await media().put(key, body.bytes, {
      customMetadata: { uploadedAt: new Date().toISOString() },
      httpMetadata: { contentType },
      onlyIf: { etagDoesNotMatch: "*" },
    });
    if (!stored) {
      return json(409, { code: "ALREADY_UPLOADED" });
    }
  } catch (error) {
    console.error(`[audio] Failed to store ${key}:`, error);
    throw error;
  }
  return json(200, { key });
}

/** The headers every clip answer carries (a clip is audio to play, never a document to run). */
function clipHeaders(object: R2Object, type: string): Headers {
  return new Headers({
    "accept-ranges": "bytes",
    "cache-control": "public, max-age=31536000, immutable",
    "content-security-policy": "default-src 'none'; sandbox",
    "content-type": type,
    "cross-origin-resource-policy": "same-origin",
    etag: object.httpEtag,
    "x-content-type-options": "nosniff",
  });
}

export async function handleAudioRead(
  request: Request,
  path: string
): Promise<Response> {
  const { rateLimits } = siteEnv();
  if (
    !(await checkRateLimit(rateLimits.RL_API, `${clientIp(request)}:audio`))
  ) {
    return json(429, { code: "RATE_LIMITED" });
  }
  const key = `audio/${path}`;
  if (!AUDIO_KEY_PATTERN.test(key)) {
    return json(404, { code: "NOT_FOUND" });
  }
  const range = request.headers.get("range");
  if (range !== null && !BYTE_RANGE.test(range)) {
    return json(416, { code: "RANGE_NOT_SATISFIABLE" });
  }
  let object: R2ObjectBody | R2Object | null;
  try {
    object = await media().get(
      key,
      range === null ? {} : { range: request.headers }
    );
  } catch (error) {
    // A range outside the object: R2 refuses it.
    console.warn(`[audio] Refused a range on ${key}:`, error);
    return json(416, { code: "RANGE_NOT_SATISFIABLE" });
  }
  if (!(object && "body" in object)) {
    return json(404, { code: "NOT_FOUND" });
  }
  const declared = object.httpMetadata?.contentType ?? "";
  const headers = clipHeaders(
    object,
    isAudioType(declared) ? declared : "application/octet-stream"
  );
  const stored = object.range;
  if (range !== null && stored) {
    // What R2 served: `{ offset, length }`, or the `suffix` of a `bytes=-N` range.
    const served: { length?: number; offset?: number; suffix?: number } =
      stored;
    const offset =
      served.suffix === undefined
        ? (served.offset ?? 0)
        : Math.max(0, object.size - served.suffix);
    const length =
      served.suffix === undefined
        ? (served.length ?? object.size - offset)
        : object.size - offset;
    headers.set("content-length", String(length));
    headers.set(
      "content-range",
      `bytes ${offset}-${offset + length - 1}/${object.size}`
    );
    return new Response(object.body, { headers, status: 206 });
  }
  headers.set("content-length", String(object.size));
  return new Response(object.body, { headers, status: 200 });
}
