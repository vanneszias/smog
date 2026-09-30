import { type RelayBody, relayBodySchema } from "../schema";

/** The relay's part of the worker env (`@smog/config/env/worker`). */
export interface RelayEnv {
  OPENPANEL_API_URL: string;
  OPENPANEL_CLIENT_ID?: string | undefined;
  OPENPANEL_CLIENT_SECRET?: string | undefined;
}

export interface RelayOptions {
  env: RelayEnv;
  /** Tests inject one; the Worker's `fetch` otherwise. */
  fetch?: typeof fetch;
  /** `isForeignRequest` from `@smog/rpc` (the analytics package cannot import it). */
  isForeign: (request: Request) => boolean;
  /** The `RL_ANALYTICS` check (`checkRateLimit`); `false` when over the limit. */
  limit: (key: string) => Promise<boolean>;
  /** Forwards after answering, when given (`ctx.waitUntil`). */
  waitUntil?: (promise: Promise<unknown>) => void;
}

/** Bigger bodies are not events of the taxonomy. */
const MAX_BODY_BYTES = 4096;
const SDK_NAME = "smog-relay";
const SDK_VERSION = "3.0.0";
const TRAILING_SLASHES = /\/+$/;

function status(code: string, statusCode: number, headers = {}): Response {
  return Response.json({ code }, { headers, status: statusCode });
}

const accepted = (): Response => new Response(null, { status: 202 });

const DIGITS = /^\d+$/;

/** `cf-connecting-ip`; always set on Cloudflare, absent in local tools. */
function clientIp(request: Request): string | null {
  return request.headers.get("cf-connecting-ip");
}

type ReadResult = { body: RelayBody } | { status: 400 | 413 };

/**
 * Reads at most `MAX_BODY_BYTES`: a declared `content-length` over the cap
 * is refused before any read, and a chunked body is read with a running
 * count and cancelled once past the cap, so a large upload is never
 * buffered.
 */
async function readCapped(request: Request): Promise<string | 400 | 413> {
  const declared = request.headers.get("content-length");
  if (declared !== null) {
    if (!DIGITS.test(declared)) {
      return 400;
    }
    if (Number(declared) > MAX_BODY_BYTES) {
      return 413;
    }
  }
  if (!request.body) {
    return "";
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
      // The client went away mid-upload: a bad request, never a 500.
      return 400;
    }
    const { done, value } = chunk;
    if (done) {
      break;
    }
    size += value.byteLength;
    if (size > MAX_BODY_BYTES) {
      await reader.cancel();
      return 413;
    }
    chunks.push(value);
  }
  const bytes = new Uint8Array(size);
  let offset = 0;
  for (const chunk of chunks) {
    bytes.set(chunk, offset);
    offset += chunk.byteLength;
  }
  return new TextDecoder().decode(bytes);
}

async function readBody(request: Request): Promise<ReadResult> {
  const text = await readCapped(request);
  if (typeof text === "number") {
    return { status: text };
  }
  let json: unknown;
  try {
    json = JSON.parse(text);
  } catch {
    return { status: 400 };
  }
  const parsed = relayBodySchema.safeParse(json);
  return parsed.success ? { body: parsed.data } : { status: 400 };
}

/** The OpenPanel `/track` body: a screen's path goes in `__path`. */
function toOpenPanel(body: RelayBody): unknown {
  if (body.type === "track" && body.payload.name === "screen_view") {
    const { path, ...properties } = body.payload.properties;
    return {
      ...body,
      payload: { ...body.payload, properties: { ...properties, __path: path } },
    };
  }
  return body;
}

let warned = false;
let warnedIp = false;

async function forward(
  request: Request,
  body: RelayBody,
  options: RelayOptions & { clientId: string; clientSecret: string }
): Promise<void> {
  try {
    const doFetch = options.fetch ?? globalThis.fetch;
    const headers: Record<string, string> = {
      "content-type": "application/json",
      "openpanel-client-id": options.clientId,
      "openpanel-client-secret": options.clientSecret,
      "openpanel-sdk-name": SDK_NAME,
      "openpanel-sdk-version": SDK_VERSION,
    };
    const ip = clientIp(request);
    if (ip) {
      headers["x-client-ip"] = ip;
    }
    const userAgent = request.headers.get("user-agent");
    if (userAgent) {
      headers["user-agent"] = userAgent;
    }
    const response = await doFetch(
      `${options.env.OPENPANEL_API_URL.replace(TRAILING_SLASHES, "")}/track`,
      { body: JSON.stringify(toOpenPanel(body)), headers, method: "POST" }
    );
    if (!response.ok) {
      console.error(
        `[analytics] Failed to forward an event: OpenPanel answered ${response.status}`
      );
    }
  } catch (error) {
    console.error("[analytics] Failed to forward an event:", error);
  }
}

/**
 * `POST /api/analytics` (spec §12): the first-party relay to OpenPanel.
 *
 * 1. A foreign origin gets 403 (`isForeignRequest`, as `/api/rpc`).
 * 2. Over `RL_ANALYTICS` (120/min per IP) gets 429.
 * 3. A body over 4 KB gets 413 (never buffered); one outside the taxonomy 400.
 * 4. Everything else is forwarded to `${OPENPANEL_API_URL}/track` with the
 *    server-only credentials, the client IP and the user agent, and gets
 *    202 whatever OpenPanel answers: analytics never fails a product
 *    action. Without credentials it warns once and forwards nothing.
 */
export async function handleAnalyticsRelay(
  request: Request,
  options: RelayOptions
): Promise<Response> {
  if (options.isForeign(request)) {
    return status("FORBIDDEN", 403);
  }
  const ip = clientIp(request);
  if (ip === null && !warnedIp) {
    warnedIp = true;
    console.warn(
      "[analytics] No cf-connecting-ip: one shared rate-limit bucket, no x-client-ip"
    );
  }
  try {
    if (!(await options.limit(`analytics:${ip ?? "unknown"}`))) {
      return status("RATE_LIMITED", 429, { "retry-after": "60" });
    }
  } catch (error) {
    console.error("[analytics] Failed to check the rate limit:", error);
    return accepted();
  }
  const read = await readBody(request);
  if ("status" in read) {
    return read.status === 413
      ? status("PAYLOAD_TOO_LARGE", 413)
      : status("BAD_REQUEST", 400);
  }
  const { body } = read;
  const {
    OPENPANEL_CLIENT_ID: clientId,
    OPENPANEL_CLIENT_SECRET: clientSecret,
  } = options.env;
  if (!(clientId && clientSecret)) {
    if (!warned) {
      warned = true;
      console.warn(
        "[analytics] OPENPANEL_CLIENT_ID or OPENPANEL_CLIENT_SECRET is unset: events are not forwarded"
      );
    }
    return accepted();
  }
  const sending = forward(request, body, {
    ...options,
    clientId,
    clientSecret,
  });
  if (options.waitUntil) {
    options.waitUntil(sending);
  } else {
    await sending;
  }
  return accepted();
}
