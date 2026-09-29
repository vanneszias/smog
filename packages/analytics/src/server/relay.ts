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

function clientIp(request: Request): string {
  return request.headers.get("cf-connecting-ip") ?? "unknown";
}

async function readBody(request: Request): Promise<RelayBody | null> {
  const text = await request.text();
  if (new TextEncoder().encode(text).length > MAX_BODY_BYTES) {
    return null;
  }
  let json: unknown;
  try {
    json = JSON.parse(text);
  } catch {
    return null;
  }
  const parsed = relayBodySchema.safeParse(json);
  return parsed.success ? parsed.data : null;
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
      "x-client-ip": clientIp(request),
    };
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
 * 3. A body outside the taxonomy gets 400.
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
  try {
    if (!(await options.limit(`analytics:${clientIp(request)}`))) {
      return status("RATE_LIMITED", 429, { "retry-after": "60" });
    }
  } catch (error) {
    console.error("[analytics] Failed to check the rate limit:", error);
    return accepted();
  }
  const body = await readBody(request);
  if (!body) {
    return status("BAD_REQUEST", 400);
  }
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
