import { z } from "zod";

/**
 * Mux webhook verification (Mux docs, "Verify webhook signatures"): the
 * `Mux-Signature` header is `t=<unix seconds>,v1=<hex>`, where `v1` is
 * HMAC-SHA256 of `<t>.<raw body>` with the endpoint's signing secret.
 * Events older (or newer) than 5 minutes are refused, against replays.
 */

const MUX_SIGNATURE_HEADER = "mux-signature";

/** The replay window, both ways (Mux's own SDKs default to 300 s). */
export const MUX_SIGNATURE_TOLERANCE_SECONDS = 300;

export type MuxSignatureFailure =
  | "expired"
  | "invalid-event"
  | "malformed"
  | "mismatch"
  | "missing"
  | "no-secret";

/** The webhook is not provably from Mux (or not a Mux event): answer 400. */
export class MuxSignatureError extends Error {
  readonly reason: MuxSignatureFailure;

  constructor(reason: MuxSignatureFailure, options?: ErrorOptions) {
    super(`[video] Mux webhook signature rejected: ${reason}`, options);
    this.name = "MuxSignatureError";
    this.reason = reason;
  }
}

/** The envelope every Mux webhook shares; `data` is the object (upload, asset, …). */
const muxEventSchema = z
  .object({
    created_at: z.string().optional(),
    data: z.record(z.string(), z.unknown()),
    id: z.string().min(1),
    object: z.object({ id: z.string(), type: z.string() }).loose().optional(),
    type: z.string().min(1),
  })
  .loose();

export type MuxEvent = z.infer<typeof muxEventSchema>;

const DIGITS = /^\d+$/;
const HEX = /^[0-9a-f]+$/i;
const SHA256_HEX_LENGTH = 64;

interface ParsedSignature {
  signatures: Uint8Array<ArrayBuffer>[];
  timestamp: number;
}

function hexToBytes(hex: string): Uint8Array<ArrayBuffer> | null {
  if (hex.length !== SHA256_HEX_LENGTH || !HEX.test(hex)) {
    return null;
  }
  const bytes = new Uint8Array(hex.length / 2);
  for (let index = 0; index < bytes.length; index += 1) {
    bytes[index] = Number.parseInt(hex.slice(index * 2, index * 2 + 2), 16);
  }
  return bytes;
}

/**
 * `t=…,v1=…[,v1=…]`. A `v1` that is not 64 hex characters can never
 * match, so it counts as a mismatch, not as malformed.
 */
function parseSignature(header: string): ParsedSignature | null {
  let timestamp: number | null = null;
  const signatures: Uint8Array<ArrayBuffer>[] = [];
  let sawV1 = false;
  for (const part of header.split(",")) {
    const separator = part.indexOf("=");
    if (separator <= 0) {
      continue;
    }
    const key = part.slice(0, separator).trim();
    const value = part.slice(separator + 1).trim();
    if (key === "t") {
      if (!DIGITS.test(value)) {
        return null;
      }
      timestamp = Number(value);
    } else if (key === "v1") {
      sawV1 = true;
      const bytes = hexToBytes(value);
      if (bytes) {
        signatures.push(bytes);
      }
    }
  }
  if (timestamp === null || !sawV1) {
    return null;
  }
  return { signatures, timestamp };
}

const encoder = new TextEncoder();

async function hmacKey(secret: string): Promise<CryptoKey> {
  return await crypto.subtle.importKey(
    "raw",
    encoder.encode(secret),
    { hash: "SHA-256", name: "HMAC" },
    false,
    ["sign", "verify"]
  );
}

/** The body as received: bytes (the Worker) or a string (tests). */
type RawBody = string | Uint8Array<ArrayBuffer>;

function bodyBytes(rawBody: RawBody): Uint8Array<ArrayBuffer> {
  return typeof rawBody === "string" ? encoder.encode(rawBody) : rawBody;
}

/** `<t>.` and the body's own bytes: what Mux signs (never re-encoded). */
function signedPayload(
  timestamp: number,
  body: Uint8Array<ArrayBuffer>
): Uint8Array<ArrayBuffer> {
  const prefix = encoder.encode(`${timestamp}.`);
  const payload = new Uint8Array(prefix.byteLength + body.byteLength);
  payload.set(prefix);
  payload.set(body, prefix.byteLength);
  return payload;
}

/** HMAC-SHA256 of `<t>.<body>`, hex: what Mux puts in `v1`. */
export async function muxSignature(
  rawBody: RawBody,
  secret: string,
  timestamp: number
): Promise<string> {
  const key = await hmacKey(secret);
  const mac = await crypto.subtle.sign(
    "HMAC",
    key,
    signedPayload(timestamp, bodyBytes(rawBody))
  );
  return Array.from(new Uint8Array(mac), (byte) =>
    byte.toString(16).padStart(2, "0")
  ).join("");
}

/**
 * Verifies a Mux webhook and returns its event, or throws
 * `MuxSignatureError`. The comparison is Web Crypto's
 * `subtle.verify("HMAC", …)`, which is constant-time, over the raw bytes
 * received; the body is decoded (strict UTF-8) and parsed only after the
 * signature matched, so an unsigned body is never read.
 *
 * @param now milliseconds since the epoch (`Date.now()`)
 */
export async function verifyMuxWebhook(
  rawBody: RawBody,
  headers: Headers,
  secret: string | undefined,
  now: number
): Promise<MuxEvent> {
  if (!secret) {
    throw new MuxSignatureError("no-secret");
  }
  const header = headers.get(MUX_SIGNATURE_HEADER);
  if (!header) {
    throw new MuxSignatureError("missing");
  }
  const parsed = parseSignature(header);
  if (!parsed) {
    throw new MuxSignatureError("malformed");
  }
  const age = Math.abs(Math.floor(now / 1000) - parsed.timestamp);
  if (age > MUX_SIGNATURE_TOLERANCE_SECONDS) {
    throw new MuxSignatureError("expired");
  }
  const key = await hmacKey(secret);
  const body = bodyBytes(rawBody);
  const signed = signedPayload(parsed.timestamp, body);
  let valid = false;
  for (const signature of parsed.signatures) {
    // Every candidate is checked (no early exit), each in constant time.
    // biome-ignore lint/performance/noAwaitInLoops: at most a couple of signatures.
    const matches = await crypto.subtle.verify("HMAC", key, signature, signed);
    valid ||= matches;
  }
  if (!valid) {
    throw new MuxSignatureError("mismatch");
  }
  let json: unknown;
  try {
    json = JSON.parse(new TextDecoder("utf-8", { fatal: true }).decode(body));
  } catch (error) {
    throw new MuxSignatureError("invalid-event", { cause: error });
  }
  const event = muxEventSchema.safeParse(json);
  if (!event.success) {
    throw new MuxSignatureError("invalid-event");
  }
  return event.data;
}
