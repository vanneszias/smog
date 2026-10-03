import { env as bindings } from "cloudflare:workers";
import { AuthError, getSession, requireAdminUser } from "@smog/auth";
import { checkRateLimit, isForeignRequest } from "@smog/rpc";
import { LOGO_MAX_BYTES } from "@smog/sponsorships/schema";
import {
  isLogoContentType,
  LOGO_KEY_PREFIX,
  sniffLogoType,
  verifyLogoUpload,
} from "@smog/sponsorships/server";
import { readCappedBody } from "@smog/utils";
import { getAuth, siteEnv } from "./auth";
import { clientIp } from "./context";

/**
 * The sponsor logo routes (phase 6 ruling 10). The key in the path is the
 * uuid of `logos/<uuid>` (one path segment).
 *
 * - `PUT /api/logos/upload/<uuid>?exp=<ms>&sig=<hmac>`: the signed
 *   same-origin fallback of `sponsorships.uploadLogo` when the R2 tokens
 *   are unset. It checks `isForeignRequest`, `RL_SPONSOR` per IP, the
 *   signature (which covers the key, the `Content-Type` and the expiry),
 *   the expiry, the type, the size (at most 2 MiB, by `Content-Length` and
 *   by counting the stream) and the magic bytes, then writes `MEDIA` with
 *   `uploadedAt`, once: a URL whose key exists is a 409 (single use).
 * - `GET /api/logos/<uuid>`: an admin session only; logos are private, and
 *   only an image type is echoed (anything else is a download).
 */

const LOGO_ID = /^[0-9a-f-]{36}$/;
const EXP = /^\d{1,15}$/;

function json(status: number, body: unknown): Response {
  return Response.json(body, {
    headers: { "cache-control": "no-store" },
    status,
  });
}

function media(): R2Bucket {
  if (!bindings.MEDIA) {
    throw new Error("[logos] The MEDIA binding is missing");
  }
  return bindings.MEDIA;
}

export async function handleLogoUpload(
  request: Request,
  id: string
): Promise<Response> {
  const { auth, rateLimits, worker } = siteEnv();
  if (isForeignRequest(request, worker)) {
    return json(403, { code: "FORBIDDEN" });
  }
  if (
    !(await checkRateLimit(
      rateLimits.RL_SPONSOR,
      `${clientIp(request)}:logo-upload`
    ))
  ) {
    return json(429, { code: "RATE_LIMITED" });
  }
  if (!LOGO_ID.test(id)) {
    return json(404, { code: "NOT_FOUND" });
  }
  const url = new URL(request.url);
  const exp = url.searchParams.get("exp") ?? "";
  const signature = url.searchParams.get("sig") ?? "";
  const contentType = request.headers.get("content-type") ?? "";
  if (!isLogoContentType(contentType)) {
    return json(415, { code: "UNSUPPORTED_TYPE" });
  }
  const key = `${LOGO_KEY_PREFIX}${id}`;
  const verdict = EXP.test(exp)
    ? await verifyLogoUpload(auth.BETTER_AUTH_SECRET, {
        contentType,
        expiresAt: Number.parseInt(exp, 10),
        key,
        now: Date.now(),
        signature,
      })
    : "invalid";
  if (verdict !== "ok") {
    console.warn(`[logos] Refused an upload to ${key}: ${verdict}`);
    return json(403, {
      code: verdict === "expired" ? "EXPIRED" : "FORBIDDEN",
    });
  }
  if (await media().head(key)) {
    return json(409, { code: "ALREADY_UPLOADED" });
  }
  const body = await readCappedBody(request, LOGO_MAX_BYTES);
  if (!body.ok) {
    return json(body.status, {
      code: body.status === 413 ? "TOO_LARGE" : "BAD_REQUEST",
    });
  }
  if (sniffLogoType(body.bytes) !== contentType) {
    return json(415, { code: "UNSUPPORTED_TYPE" });
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
    console.error(`[logos] Failed to store ${key}:`, error);
    throw error;
  }
  return json(200, { key });
}

export async function handleLogoRead(
  request: Request,
  id: string
): Promise<Response> {
  try {
    requireAdminUser(await getSession(getAuth(), request.headers));
  } catch (error) {
    if (error instanceof AuthError) {
      return json(error.code === "UNAUTHORIZED" ? 401 : 403, {
        code: error.code,
      });
    }
    console.error("[logos] Failed to check the admin session:", error);
    throw error;
  }
  const object = LOGO_ID.test(id)
    ? await media().get(`${LOGO_KEY_PREFIX}${id}`)
    : null;
  if (!object) {
    return json(404, { code: "NOT_FOUND" });
  }
  const type = object.httpMetadata?.contentType;
  const image = isLogoContentType(type);
  return new Response(object.body, {
    headers: {
      "cache-control": "private, no-store",
      "content-length": String(object.size),
      // A logo is an image to show, never a document to run.
      "content-security-policy": "default-src 'none'; sandbox",
      "content-type": image ? type : "application/octet-stream",
      "cross-origin-resource-policy": "same-origin",
      "x-content-type-options": "nosniff",
      ...(image ? {} : { "content-disposition": "attachment" }),
    },
  });
}
