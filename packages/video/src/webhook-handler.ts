import {
  applyMuxEvent,
  eventUploadId,
  type MuxKv,
  muxEventKey,
  readUploadState,
  UPLOAD_STATE_TTL_SECONDS,
  writeUploadState,
} from "./upload-state";
import { type MuxEvent, MuxSignatureError, verifyMuxWebhook } from "./webhooks";

/** Mux events are a few KiB; anything past 1 MiB is not one. */
export const MUX_WEBHOOK_MAX_BYTES = 1024 * 1024;

export interface MuxWebhookOptions {
  kv: MuxKv;
  /**
   * The per-IP rate limit (`checkRateLimit` on `RL_API`); `false` when
   * over it. Mux retries a 429 with backoff for up to 24 h.
   */
  limit: (key: string) => Promise<boolean>;
  /** `Date.now()` unless a test pins it. */
  now?: () => number;
  /** `MUX_WEBHOOK_SECRET`; without it every delivery is a 503 (Mux retries). */
  secret: string | undefined;
}

const DIGITS = /^\d+$/;

function answer(status: number, code: string): Response {
  return Response.json(
    { code },
    { headers: { "cache-control": "no-store" }, status }
  );
}

/**
 * Reads at most `MUX_WEBHOOK_MAX_BYTES`: a larger `content-length` is
 * refused before any read, and a chunked body is cancelled once past the
 * cap.
 */
async function readCapped(
  request: Request
): Promise<Uint8Array<ArrayBuffer> | 400 | 413> {
  const declared = request.headers.get("content-length");
  if (declared !== null) {
    if (!DIGITS.test(declared)) {
      return 400;
    }
    if (Number(declared) > MUX_WEBHOOK_MAX_BYTES) {
      return 413;
    }
  }
  if (!request.body) {
    return new Uint8Array(0);
  }
  const reader = request.body.getReader();
  const chunks: Uint8Array[] = [];
  let size = 0;
  for (;;) {
    let chunk: Awaited<ReturnType<typeof reader.read>>;
    try {
      // biome-ignore lint/performance/noAwaitInLoops: a stream is read chunk by chunk.
      chunk = await reader.read();
    } catch {
      return 400;
    }
    if (chunk.done) {
      break;
    }
    size += chunk.value.byteLength;
    if (size > MUX_WEBHOOK_MAX_BYTES) {
      await reader.cancel();
      return 413;
    }
    chunks.push(chunk.value);
  }
  const bytes = new Uint8Array(size);
  let offset = 0;
  for (const chunk of chunks) {
    bytes.set(chunk, offset);
    offset += chunk.byteLength;
  }
  // The bytes as received: the signature covers exactly these.
  return bytes;
}

/**
 * Merges a gesture upload's event into its KV record. A read-modify-write:
 * two events of one upload landing at once (`asset_created` and
 * `asset.ready`) can leave `preparing` over `ready`. That is harmless, since
 * a non-final record makes `admin.mux.uploadStatus` ask the Mux API; key the
 * asset state separately (`mux:asset:<id>`) if a reader ever trusts KV alone.
 */
async function record(kv: MuxKv, event: MuxEvent, now: number): Promise<void> {
  const uploadId = eventUploadId(event);
  const previous = uploadId ? await readUploadState(kv, uploadId) : null;
  const next = applyMuxEvent(previous, event, now);
  if (next) {
    await writeUploadState(kv, next);
  }
}

/**
 * `POST /api/webhooks/mux`. In order: the secret (503 without one; Mux
 * retries), the capped raw body (413), the signature over those bytes and
 * its 5-minute window (400, logged without the body). Only a rejected
 * delivery counts against the per-IP limit (429 past it), so genuine Mux
 * traffic is never throttled. A verified event that is not about a gesture
 * upload is a 200 and touches no KV (phase 7 adds the render
 * passthroughs); a gesture upload's event is applied once per event id
 * (`mux:event:<id>`, 24 h) to KV `mux:upload:<uploadId>`. There is no
 * cookie, so no origin check: the signature is the authentication.
 */
export async function handleMuxWebhook(
  request: Request,
  { kv, limit, now = Date.now, secret }: MuxWebhookOptions
): Promise<Response> {
  if (!secret) {
    console.warn(
      "[video] A Mux webhook arrived but MUX_WEBHOOK_SECRET is not set"
    );
    return answer(503, "NOT_CONFIGURED");
  }
  const ip = request.headers.get("cf-connecting-ip") ?? "unknown";
  const reject = async (status: 400 | 413, code: string): Promise<Response> =>
    (await limit(`mux-webhook:${ip}`))
      ? answer(status, code)
      : answer(429, "RATE_LIMITED");
  const body = await readCapped(request);
  if (body === 400 || body === 413) {
    console.warn(`[video] Refused a Mux webhook body (${body})`);
    return await reject(body, body === 413 ? "TOO_LARGE" : "BAD_REQUEST");
  }
  let event: MuxEvent;
  try {
    event = await verifyMuxWebhook(body, request.headers, secret, now());
  } catch (error) {
    if (error instanceof MuxSignatureError) {
      console.warn(`[video] Rejected a Mux webhook: ${error.reason}`);
      return await reject(400, "INVALID_SIGNATURE");
    }
    throw error;
  }
  if (!applyMuxEvent(null, event, 0)) {
    // Not a gesture upload's event: nothing to store, so nothing to dedupe.
    console.log(`[video] Mux event ${event.id} (${event.type}): ignored`);
    return answer(200, "IGNORED");
  }
  try {
    const seen = muxEventKey(event.id);
    if ((await kv.get(seen)) !== null) {
      console.log(
        `[video] Mux event ${event.id} (${event.type}) was handled already`
      );
      return answer(200, "DUPLICATE");
    }
    await record(kv, event, now());
    await kv.put(seen, "1", { expirationTtl: UPLOAD_STATE_TTL_SECONDS });
    console.log(`[video] Mux event ${event.id} (${event.type}): stored`);
    return answer(200, "OK");
  } catch (error) {
    console.error(`[video] Failed to handle Mux event ${event.id}:`, error);
    throw error;
  }
}
