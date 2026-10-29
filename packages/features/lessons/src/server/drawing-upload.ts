/**
 * The drawing upload URL (phase 10c task 3, plan ruling 6), the audio
 * upload's design (`@smog/translation`, a feature never imports another
 * feature's `./server`): an R2 presigned PUT when the R2 tokens are set,
 * otherwise a signed same-origin fallback (`PUT /api/teacher/drawings/upload/
 * <gestureId>/<step>/<uuid>?exp=<ms>&sig=<hmac>`, served by the site). The
 * file never passes through a procedure; `finalizeDrawing` reads the object
 * afterwards. The fallback's key is derived from `BETTER_AUTH_SECRET` with
 * its own HKDF label, so a drawing signature is no audio signature.
 */
import type { DrawingUploadType } from "@smog/db/enums";
import { AwsClient } from "aws4fetch";
import type { DrawingUploadResult } from "../schema";

/** A signed upload URL works for 5 minutes (`X-Amz-Expires` 300). */
const DRAWING_UPLOAD_TTL_MS = 5 * 60 * 1000;

/** The fallback route, followed by the key without its `teacher/drawings/` prefix. */
const DRAWING_UPLOAD_PATH = "/api/teacher/drawings/upload/";
const KEY_PREFIX = "teacher/drawings/";

/** What the upload URL needs from the Worker env. */
export interface DrawingUploadEnv {
  /** The fallback's HMAC key is derived from it (HKDF), so no new secret. */
  BETTER_AUTH_SECRET: string;
  MEDIA_BUCKET?: string | undefined;
  R2_ACCESS_KEY_ID?: string | undefined;
  R2_ACCOUNT_ID?: string | undefined;
  R2_SECRET_ACCESS_KEY?: string | undefined;
  SITE_URL: string;
}

const TRAILING_SLASHES = /(?<!\/)\/+$/;
const BASE64URL = /^[A-Za-z0-9_-]{43}$/;
const PADDING = /[=]+$/;
const HKDF_INFO = "smog-drawing-upload";
const encoder = new TextEncoder();

function base64Url(bytes: ArrayBuffer): string {
  return btoa(String.fromCharCode(...new Uint8Array(bytes)))
    .replaceAll("+", "-")
    .replaceAll("/", "_")
    .replace(PADDING, "");
}

function fromBase64Url(value: string): Uint8Array<ArrayBuffer> {
  const binary = atob(value.replaceAll("-", "+").replaceAll("_", "/"));
  return Uint8Array.from(binary, (char) => char.charCodeAt(0));
}

/** HMAC-SHA-256 under a key derived from `secret` (HKDF, `info: smog-drawing-upload`). */
async function uploadKey(secret: string): Promise<CryptoKey> {
  const base = await crypto.subtle.importKey(
    "raw",
    encoder.encode(secret),
    "HKDF",
    false,
    ["deriveKey"]
  );
  return await crypto.subtle.deriveKey(
    {
      hash: "SHA-256",
      info: encoder.encode(HKDF_INFO),
      name: "HKDF",
      salt: new Uint8Array(0),
    },
    base,
    { hash: "SHA-256", length: 256, name: "HMAC" },
    false,
    ["sign", "verify"]
  );
}

export interface DrawingUploadClaim {
  contentType: string;
  expiresAt: number;
  key: string;
}

/** What is signed: the key, the type the PUT must send and the expiry. */
function claim({
  contentType,
  expiresAt,
  key,
}: DrawingUploadClaim): Uint8Array<ArrayBuffer> {
  return encoder.encode(`${key}\n${contentType}\n${expiresAt}`);
}

/** The fallback URL's `sig`: base64url HMAC over the claim. */
export async function signDrawingUpload(
  secret: string,
  input: DrawingUploadClaim
): Promise<string> {
  return base64Url(
    await crypto.subtle.sign("HMAC", await uploadKey(secret), claim(input))
  );
}

/**
 * Checks a fallback PUT (constant time): `ok`, `expired`, or `invalid` for
 * a forged signature, another key or a `Content-Type` other than the one
 * that was signed.
 */
export async function verifyDrawingUpload(
  secret: string,
  input: DrawingUploadClaim & { now: number; signature: string }
): Promise<"ok" | "expired" | "invalid"> {
  if (!BASE64URL.test(input.signature)) {
    return "invalid";
  }
  const valid = await crypto.subtle.verify(
    "HMAC",
    await uploadKey(secret),
    fromBase64Url(input.signature),
    claim(input)
  );
  if (!valid) {
    return "invalid";
  }
  return input.now > input.expiresAt ? "expired" : "ok";
}

function r2Credentials(env: DrawingUploadEnv) {
  const {
    MEDIA_BUCKET: bucket,
    R2_ACCESS_KEY_ID: accessKeyId,
    R2_ACCOUNT_ID: accountId,
    R2_SECRET_ACCESS_KEY: secretAccessKey,
  } = env;
  return accessKeyId && secretAccessKey && accountId && bucket
    ? { accessKeyId, accountId, bucket, secretAccessKey }
    : null;
}

/**
 * The PUT the browser makes for `key`: an `aws4fetch` presigned URL (300 s,
 * `Content-Type` and the declared `Content-Length` signed) when the R2
 * tokens are set; otherwise the signed same-origin fallback, whose route
 * caps the size at 512 KiB and takes one upload per key.
 */
export async function drawingUploadUrl(
  env: DrawingUploadEnv,
  input: {
    contentType: DrawingUploadType;
    key: string;
    now: number;
    size: number;
  }
): Promise<DrawingUploadResult> {
  const { contentType, key, now, size } = input;
  const expiresAt = now + DRAWING_UPLOAD_TTL_MS;
  const headers = { "content-type": contentType };
  const r2 = r2Credentials(env);
  if (r2) {
    const client = new AwsClient({
      accessKeyId: r2.accessKeyId,
      region: "auto",
      secretAccessKey: r2.secretAccessKey,
      service: "s3",
    });
    const url = new URL(
      `https://${r2.accountId}.r2.cloudflarestorage.com/${r2.bucket}/${key}`
    );
    url.searchParams.set("X-Amz-Expires", String(DRAWING_UPLOAD_TTL_MS / 1000));
    const signed = await client.sign(url.toString(), {
      aws: { allHeaders: true, signQuery: true },
      headers: { ...headers, "content-length": String(size) },
      method: "PUT",
    });
    return { expiresAt, headers, key, uploadUrl: signed.url };
  }
  const signature = await signDrawingUpload(env.BETTER_AUTH_SECRET, {
    contentType,
    expiresAt,
    key,
  });
  const site = env.SITE_URL.replace(TRAILING_SLASHES, "");
  const url = new URL(
    `${site}${DRAWING_UPLOAD_PATH}${key.slice(KEY_PREFIX.length)}`
  );
  url.searchParams.set("exp", String(expiresAt));
  url.searchParams.set("sig", signature);
  return { expiresAt, headers, key, uploadUrl: url.toString() };
}
