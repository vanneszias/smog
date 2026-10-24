import { AuthError, getSession, requireRoleUser } from "@smog/auth";
import { createDb } from "@smog/db/client";
import { DRAWING_UPLOAD_MAX_BYTES, DRAWING_UPLOAD_TYPES } from "@smog/db/enums";
import { DRAWING_KEY_PATTERN } from "@smog/lessons/schema";
import {
  findDrawing,
  inspectDrawingData,
  verifyDrawingUpload,
} from "@smog/lessons/server";
import { checkRateLimit, isForeignRequest } from "@smog/rpc";
import { readCappedBody } from "@smog/utils";
import { getAuth, siteEnv } from "./auth";
import { clientIp } from "./context";

/**
 * The drawing routes (phase 10c task 3, plan ruling 6): private teaching
 * material. The path after `/api/teacher/drawings/` is the R2 key without its
 * `teacher/drawings/` prefix.
 *
 * - `GET /api/teacher/drawings/<gestureId>/<step>`: the image of one step,
 *   for a signed-in teacher, translator (the editor's read-only card) or
 *   admin; a guest gets 401 and any other account 403 before the path is
 *   looked at, so the answer never says whether a drawing exists. For an
 *   allowed role an unknown gesture, step or a gesture without that drawing
 *   is 404. `private, max-age=300` (the URL carries `?v=<updatedAt>`, so a
 *   replace shows at once), never a shared cache (`vary: cookie`), `nosniff`,
 *   the sandbox CSP and `same-origin` CORP. `RL_API` per IP.
 * - `PUT /api/teacher/drawings/upload/<gestureId>/<step>/<uuid>?exp=<ms>&
 *   sig=<hmac>`: the signed same-origin fallback of `teacher.uploadDrawing`
 *   when the R2 tokens are unset. It checks `isForeignRequest`, `RL_API` per
 *   IP, the signature (key, `Content-Type` and expiry), the size (at most
 *   1 MiB, by `Content-Length` and by counting the stream) and the bytes (a
 *   PNG, JPEG or WebP of at most 2,000 px), then writes `MEDIA` once: a key
 *   that exists is a 409. `finalizeDrawing` checks everything again before it
 *   records the drawing.
 */

const EXP = /^\d{1,15}$/;
const UUID = "[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}";
const READ_PATH = new RegExp(`^(${UUID})/([12])$`);
const KEY_PREFIX = "teacher/drawings/";

function json(status: number, body: unknown): Response {
  return Response.json(body, {
    headers: { "cache-control": "no-store" },
    status,
  });
}

function media(): R2Bucket {
  return siteEnv().bindings.MEDIA;
}

function isDrawingType(value: string): boolean {
  return DRAWING_UPLOAD_TYPES.some((type) => type === value);
}

const REFUSALS = {
  dimensions: [422, "TOO_LARGE_DIMENSIONS"],
  format: [415, "UNSUPPORTED_TYPE"],
  tooLarge: [413, "TOO_LARGE"],
} as const;

/**
 * The body of an upload when it is a drawing of the signed type within the
 * caps (size, then the bytes: PNG or JPEG, at most 1,200 px); else
 * the refusal.
 */
async function readImage(
  request: Request,
  contentType: string
): Promise<{ bytes: Uint8Array<ArrayBuffer> } | Response> {
  const body = await readCappedBody(request, DRAWING_UPLOAD_MAX_BYTES);
  if (!body.ok) {
    return json(body.status, {
      code: body.status === 413 ? "TOO_LARGE" : "BAD_REQUEST",
    });
  }
  const inspected = await inspectDrawingData(body.bytes);
  if (!inspected.ok) {
    const [status, code] = REFUSALS[inspected.reason];
    return json(status, { code });
  }
  return inspected.contentType === contentType
    ? { bytes: body.bytes }
    : json(415, { code: "UNSUPPORTED_TYPE" });
}

export async function handleDrawingUpload(
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
      `${clientIp(request)}:drawing-upload`
    ))
  ) {
    return json(429, { code: "RATE_LIMITED" });
  }
  const key = `${KEY_PREFIX}${path}`;
  if (!DRAWING_KEY_PATTERN.test(key)) {
    return json(404, { code: "NOT_FOUND" });
  }
  const url = new URL(request.url);
  const exp = url.searchParams.get("exp") ?? "";
  const signature = url.searchParams.get("sig") ?? "";
  const contentType = request.headers.get("content-type") ?? "";
  if (!isDrawingType(contentType)) {
    return json(415, { code: "UNSUPPORTED_TYPE" });
  }
  const verdict = EXP.test(exp)
    ? await verifyDrawingUpload(auth.BETTER_AUTH_SECRET, {
        contentType,
        expiresAt: Number.parseInt(exp, 10),
        key,
        now: Date.now(),
        signature,
      })
    : "invalid";
  if (verdict !== "ok") {
    console.warn(`[drawings] Refused an upload to ${key}: ${verdict}`);
    return json(403, {
      code: verdict === "expired" ? "EXPIRED" : "FORBIDDEN",
    });
  }
  if (await media().head(key)) {
    return json(409, { code: "ALREADY_UPLOADED" });
  }
  const body = await readImage(request, contentType);
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
    console.error(`[drawings] Failed to store ${key}:`, error);
    throw error;
  }
  return json(200, { key });
}

/** The headers every drawing answer carries (an image to show, never a document to run, never shared). */
function imageHeaders(etag: string, type: string): Headers {
  return new Headers({
    "cache-control": "private, max-age=300",
    "content-security-policy": "default-src 'none'; sandbox",
    "content-type": type,
    "cross-origin-resource-policy": "same-origin",
    etag,
    vary: "Cookie",
    "x-content-type-options": "nosniff",
    "x-robots-tag": "noindex",
  });
}

/** 401 for a guest, 403 for an account with no teaching role; `null` when the session may read drawings. */
async function refuseUnlessReader(request: Request): Promise<Response | null> {
  try {
    requireRoleUser(
      await getSession(getAuth(), request.headers),
      "teacher",
      "translator"
    );
    return null;
  } catch (error) {
    if (error instanceof AuthError) {
      return json(error.code === "UNAUTHORIZED" ? 401 : 403, {
        code: error.code,
      });
    }
    console.error("[drawings] Failed to check the session:", error);
    throw error;
  }
}

export async function handleDrawingRead(
  request: Request,
  path: string
): Promise<Response> {
  const { db, rateLimits } = siteEnv();
  if (
    !(await checkRateLimit(
      rateLimits.RL_API,
      `${clientIp(request)}:teacher-drawing`
    ))
  ) {
    return json(429, { code: "RATE_LIMITED" });
  }
  const refused = await refuseUnlessReader(request);
  if (refused) {
    return refused;
  }
  if (!READ_PATH.test(path)) {
    return json(404, { code: "NOT_FOUND" });
  }
  const [gestureId = "", step = ""] = path.split("/");
  const row = await findDrawing(createDb(db), gestureId, Number(step));
  // The head first: a conditional request that matches never reads the body.
  const head = row ? await media().head(row.r2Key) : null;
  if (!(row && head)) {
    return json(404, { code: "NOT_FOUND" });
  }
  const headers = imageHeaders(head.httpEtag, row.contentType);
  if (request.headers.get("if-none-match") === head.httpEtag) {
    return new Response(null, { headers, status: 304 });
  }
  const object = await media().get(row.r2Key);
  if (!object) {
    return json(404, { code: "NOT_FOUND" });
  }
  headers.set("content-length", String(object.size));
  return new Response(object.body, { headers, status: 200 });
}
