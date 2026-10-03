/**
 * The sponsor logo (ruling 10): an R2 presigned PUT when the R2 tokens are
 * set, otherwise a signed same-origin fallback (`PUT
 * /api/logos/upload/<uuid>?exp=<ms>&sig=<hmac>`, served by the site). The
 * file never passes through a procedure. The checkout verifies the object
 * before anything is written (`verifyLogoObject`, bug 23).
 */
import { newId } from "@smog/utils";
import { AwsClient } from "aws4fetch";
import {
  LOGO_CONTENT_TYPES,
  LOGO_MAX_BYTES,
  type LogoContentType,
} from "../schema/wizard";
import type { SponsorshipsImplementer } from "./procedure";

/** A signed upload URL works for 5 minutes (`X-Amz-Expires` 300). */
export const LOGO_UPLOAD_TTL_MS = 5 * 60 * 1000;

/** The fallback route, followed by the key's uuid. */
const LOGO_UPLOAD_PATH = "/api/logos/upload/";

/** `logos/<uuid>`: the R2 key prefix of every sponsor logo. */
export const LOGO_KEY_PREFIX = "logos/";

/** What the upload URL needs from the Worker env. */
export interface LogoUploadEnv {
  /** The fallback's HMAC key is derived from it (HKDF), so no new secret. */
  BETTER_AUTH_SECRET: string;
  MEDIA_BUCKET?: string | undefined;
  R2_ACCESS_KEY_ID?: string | undefined;
  R2_ACCOUNT_ID?: string | undefined;
  R2_SECRET_ACCESS_KEY?: string | undefined;
  SITE_URL: string;
}

export interface LogoUpload {
  expiresAt: number;
  headers: { "content-type": LogoContentType };
  key: string;
  uploadUrl: string;
}

const TRAILING_SLASHES = /\/+$/;
const BASE64URL = /^[A-Za-z0-9_-]{43}$/;
const PADDING = /[=]+$/;
const HKDF_INFO = "smog-logo-upload";
const encoder = new TextEncoder();

/** `https://<account>.r2.cloudflarestorage.com`, the presigned PUT's origin (and the CSP's). */
export function r2Origin(accountId: string): string {
  return `https://${accountId}.r2.cloudflarestorage.com`;
}

/** The first bytes of each accepted format. */
function startsWith(bytes: Uint8Array, head: readonly number[], at = 0) {
  return head.every((byte, index) => bytes[at + index] === byte);
}

const PNG = [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a] as const;
const JPEG = [0xff, 0xd8, 0xff] as const;
const RIFF = [0x52, 0x49, 0x46, 0x46] as const;
const WEBP = [0x57, 0x45, 0x42, 0x50] as const;

/** The bytes a logo check reads: enough for every signature. */
const LOGO_SNIFF_BYTES = 12;

/**
 * The format of a file by its first 12 bytes (PNG, JPEG or WebP), or
 * `null` for anything else: the declared type is never trusted.
 */
export function sniffLogoType(bytes: Uint8Array): LogoContentType | null {
  if (startsWith(bytes, PNG)) {
    return "image/png";
  }
  if (startsWith(bytes, JPEG)) {
    return "image/jpeg";
  }
  if (
    bytes.length >= LOGO_SNIFF_BYTES &&
    startsWith(bytes, RIFF) &&
    startsWith(bytes, WEBP, 8)
  ) {
    return "image/webp";
  }
  return null;
}

export function isLogoContentType(value: unknown): value is LogoContentType {
  return LOGO_CONTENT_TYPES.some((type) => type === value);
}

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

/** HMAC-SHA-256 under a key derived from `secret` (HKDF, `info: smog-logo-upload`). */
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

interface UploadClaim {
  contentType: string;
  expiresAt: number;
  key: string;
}

/** What is signed: the key, the type the PUT must send and the expiry. */
function claim({
  contentType,
  expiresAt,
  key,
}: UploadClaim): Uint8Array<ArrayBuffer> {
  return encoder.encode(`${key}\n${contentType}\n${expiresAt}`);
}

/** The fallback URL's `sig`: base64url HMAC over the claim. */
export async function signLogoUpload(
  secret: string,
  input: UploadClaim
): Promise<string> {
  const signature = await crypto.subtle.sign(
    "HMAC",
    await uploadKey(secret),
    claim(input)
  );
  return base64Url(signature);
}

/**
 * Checks a fallback PUT (constant time): `ok`, `expired`, or `invalid` for
 * a forged signature, another key or a `Content-Type` other than the one
 * that was signed.
 */
export async function verifyLogoUpload(
  secret: string,
  input: UploadClaim & { now: number; signature: string }
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

/** The R2 S3 credentials, when all four are set. */
function r2Credentials(env: LogoUploadEnv) {
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
 * The PUT the browser makes for `key`: an `aws4fetch` presigned URL on
 * `<account>.r2.cloudflarestorage.com/<bucket>/<key>` (300 s, with the
 * `Content-Type` signed, so another type is a 403) when the R2 tokens are
 * set; otherwise the signed same-origin fallback.
 */
export async function logoUploadUrl(
  env: LogoUploadEnv,
  input: { contentType: LogoContentType; key: string; now: number }
): Promise<LogoUpload> {
  const { contentType, key, now } = input;
  const expiresAt = now + LOGO_UPLOAD_TTL_MS;
  const headers = { "content-type": contentType };
  const r2 = r2Credentials(env);
  if (r2) {
    const client = new AwsClient({
      accessKeyId: r2.accessKeyId,
      region: "auto",
      secretAccessKey: r2.secretAccessKey,
      service: "s3",
    });
    const url = new URL(`${r2Origin(r2.accountId)}/${r2.bucket}/${key}`);
    url.searchParams.set("X-Amz-Expires", String(LOGO_UPLOAD_TTL_MS / 1000));
    const signed = await client.sign(url.toString(), {
      aws: { allHeaders: true, signQuery: true },
      headers,
      method: "PUT",
    });
    return { expiresAt, headers, key, uploadUrl: signed.url };
  }
  const signature = await signLogoUpload(env.BETTER_AUTH_SECRET, {
    contentType,
    expiresAt,
    key,
  });
  const site = env.SITE_URL.replace(TRAILING_SLASHES, "");
  const url = new URL(
    `${site}${LOGO_UPLOAD_PATH}${key.slice(LOGO_KEY_PREFIX.length)}`
  );
  url.searchParams.set("exp", String(expiresAt));
  url.searchParams.set("sig", signature);
  return { expiresAt, headers, key, uploadUrl: url.toString() };
}

async function deleteLogo(media: R2Bucket, key: string): Promise<void> {
  try {
    await media.delete(key);
  } catch (error) {
    // The daily purge removes an unreferenced logo after 24 h anyway.
    console.error(`[sponsorships] Failed to delete the logo ${key}:`, error);
  }
}

/**
 * The checkout's check of an uploaded logo (ruling 10, bug 23): it exists,
 * is at most 2 MiB, has one of the three types, and its first 12 bytes are
 * that type's signature. A logo that fails is deleted.
 */
export async function verifyLogoObject(
  media: R2Bucket,
  key: string
): Promise<boolean> {
  const head = await media.head(key);
  if (!head) {
    return false;
  }
  const declared = head.httpMetadata?.contentType;
  let valid = head.size > 0 && head.size <= LOGO_MAX_BYTES;
  if (valid && isLogoContentType(declared)) {
    const object = await media.get(key, {
      range: { length: LOGO_SNIFF_BYTES, offset: 0 },
    });
    const bytes = object
      ? new Uint8Array(await object.arrayBuffer())
      : new Uint8Array(0);
    valid = sniffLogoType(bytes) === declared;
  } else {
    valid = false;
  }
  if (!valid) {
    console.warn(`[sponsorships] Refused the logo ${key}; deleting it`);
    await deleteLogo(media, key);
  }
  return valid;
}

/** `sponsorships.uploadLogo` (ruling 10): `RL_SPONSOR` only (the guards). */
export function logoProcedures(os: SponsorshipsImplementer) {
  return {
    uploadLogo: os.uploadLogo.handler(
      async ({ context, input }) =>
        await logoUploadUrl(context.env, {
          contentType: input.contentType,
          key: `${LOGO_KEY_PREFIX}${newId()}`,
          now: Date.now(),
        })
    ),
  };
}
