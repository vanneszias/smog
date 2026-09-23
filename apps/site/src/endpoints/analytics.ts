import type { AnalyticsEventMap } from "@smog/shared";
import type { Endpoint, PayloadHandler, PayloadRequest } from "payload";
import { readBody } from "@/endpoints/auth";
import { guardOrigin } from "@/lib/formPost";
import { type RateLimitVerdict, takeRateLimit } from "@/lib/rateLimit";

/**
 * `POST /api/analytics/track` — the browser's only way to reach OpenPanel.
 *
 * ## What it is for
 *
 * The client secret. OpenPanel's ingest is authenticated by
 * `openpanel-client-id` and `openpanel-client-secret`, and a browser that held
 * the secret would be handing it to everyone who opened the page — anybody
 * could then write whatever they liked into this project's analytics, for as
 * long as it took someone to notice and rotate it. So the page posts here, and
 * this handler — running on the server, holding the secret from the
 * environment — posts onward. Ported from `apps/server/src/index.ts:414-454`
 * and `:159-200`, which exists for exactly this reason.
 *
 * ## What it refuses, stated precisely, because it is less than it looks
 *
 * A **cross-site post** (403), an **event the allowlist does not name** (400),
 * anything **over the rate limit** (429), and — **only when the request
 * carries a session** — an event whose account's most recent `user-consents`
 * row says `analyticsConsent: false` (403).
 *
 * **This handler does not verify consent**, and a comment claiming it did
 * would be worth less than none. Consent in this stage lives in the visitor's
 * browser: a guest has no account, so there is no row to look up and nothing
 * server-side to check — for a guest this endpoint verifies origin, vocabulary
 * and rate, and nothing else. The gate that decides whether a guest is tracked
 * at all is the client-side consent store from Tasks 2-4, which is what
 * decides whether a request is made in the first place.
 *
 * Requiring a session instead was considered and is the wrong shape: it would
 * track nobody who is not signed in, which is most visitors, and so would
 * defeat the port. The signed-in check is kept because it is cheap — one
 * indexed read — and closes the one case the client cannot: a signed-in
 * visitor whose browser state disagrees with what they told the server.
 *
 * ## An unconfigured vendor is a no-op, not an error
 *
 * Missing credentials mean nothing is forwarded and the caller still gets
 * `202`, transcribed from `index.ts:163-166`. A site whose analytics vendor is
 * not configured — every local checkout, and CI — must still serve pages, and
 * a browser that got a 500 from the analytics beacon would log an error on
 * every page view for a fault that is nobody's problem.
 */

/** Where OpenPanel is, and who this application is to it. */
const DEFAULT_API_URL = "https://analytics.zias.be/api";
const SDK_NAME = "smog-site-relay";
const SDK_VERSION = "2.0.0";

/**
 * How long one call to OpenPanel may take before it is abandoned.
 *
 * Workers `fetch` has no default timeout, and a call that never answers holds
 * the browser's beacon request open — `track` awaits the relay before it
 * answers `202` — until the client or the platform gives up on it. No job
 * calls OpenPanel. Ten seconds is the value `endpoints/oauth.ts` already uses
 * for the same reason.
 */
const REQUEST_TIMEOUT_MS = 10_000;

/** Transcribed from `rateLimit({ namespace: "analytics", limit: 120, windowSeconds: 60 })`. */
const NAMESPACE = "analytics";
export const ANALYTICS_LIMIT = 120;
const WINDOW_SECONDS = 60;

/** The longest string this handler will pass on, from `index.ts`'s `isString`. */
const MAX_VALUE_LENGTH = 512;

/**
 * Every event name this relay will forward.
 *
 * `ANALYTICS_TRACK_EVENTS` (`apps/server/src/index.ts:132-138`) is a
 * hand-maintained second copy of the vocabulary, and it has already drifted
 * from the first: `screen_view` is not in `AnalyticsEventMap`
 * (`packages/shared/src/analytics.ts`) at all, which has four members. So this
 * is a `Record` keyed on the type rather than a `Set` of literals — adding a
 * member to `AnalyticsEventMap` without adding it here stops the typecheck,
 * and removing one leaves a key with nothing to match.
 *
 * The type import erases, so nothing from `@smog/shared` reaches the Worker
 * bundle.
 */
const TRACK_EVENTS: Record<keyof AnalyticsEventMap | "screen_view", true> = {
  gesture_collection_changed: true,
  gesture_viewed: true,
  /*
   * The one name that is **not** in `AnalyticsEventMap`, listed separately so
   * the gap is deliberate rather than a copy that fell behind. The native app
   * and the web app both send it; typing it is Stage 10's job, when the two
   * analytics clients become one.
   */
  screen_view: true,
  search_performed: true,
  video_playback_completed: true,
};

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function isString(value: unknown): value is string {
  return (
    typeof value === "string" &&
    value.length > 0 &&
    value.length <= MAX_VALUE_LENGTH
  );
}

/**
 * The address OpenPanel should geolocate, which is **not** the address the
 * limiter counts.
 *
 * Transcribed from `getClientIp` (`index.ts:148-157`), which prefers
 * `cf-connecting-ip` and falls back through three headers a client can set
 * for itself. That is right for a geolocation hint — the worst a spoofer
 * achieves is wrong geography on their own events — and it is exactly wrong
 * for a budget key: see {@link rateLimitKey}.
 */
function clientIpForGeolocation(headers: Headers): null | string {
  const forwardedFor = headers.get("x-forwarded-for")?.split(",")[0]?.trim();

  return (
    headers.get("cf-connecting-ip") ||
    headers.get("true-client-ip") ||
    forwardedFor ||
    headers.get("x-real-ip") ||
    null
  );
}

/**
 * What the limiter counts: `cf-connecting-ip`, and nothing else.
 *
 * On Cloudflare this header is set by the edge on every request and cannot be
 * overridden by the client. The other three in {@link clientIpForGeolocation}
 * can: a limiter keyed on `x-forwarded-for` gives a fresh budget to every
 * request that invents a new value, which is a one-line mistake that leaves an
 * endpoint looking rate-limited and being unlimited.
 *
 * A request without it falls into one shared `"unknown"` bucket. That is the
 * safe direction — a caller the edge could not identify shares a budget with
 * every other such caller rather than getting their own.
 */
function rateLimitKey(headers: Headers): string {
  return headers.get("cf-connecting-ip") ?? "unknown";
}

/** 429, carrying the seconds until the window this caller filled turns over. */
function tooManyRequests(
  verdict: Extract<RateLimitVerdict, { allowed: false }>
): Response {
  return Response.json(
    { error: "Too many requests" },
    {
      headers: {
        "Cache-Control": "no-store",
        "Retry-After": String(verdict.retryAfterSeconds),
      },
      status: 429,
    }
  );
}

function refused(error: string, status: number): Response {
  return Response.json(
    { error },
    { headers: { "Cache-Control": "no-store" }, status }
  );
}

/** Accepted. The same body the shipped relay answers with. */
function accepted(): Response {
  return Response.json(
    { success: true },
    { headers: { "Cache-Control": "no-store" }, status: 202 }
  );
}

/**
 * Whether this account has told the server, on the record, not to be tracked.
 *
 * Only reached for a request that carries a session. `user-consents` is
 * append-only, so "what they last said" is the newest row — which is why this
 * sorts rather than assuming one row per account.
 *
 * A guest never gets here and that is the architecture, not an oversight: see
 * the module note.
 */
async function withdrewConsent(req: PayloadRequest): Promise<boolean> {
  if (!req.user) {
    return false;
  }

  const { docs } = await req.payload.find({
    collection: "user-consents",
    depth: 0,
    limit: 1,
    overrideAccess: true,
    sort: "-createdAt",
    where: { user: { equals: req.user.id } },
  });

  return docs[0]?.analyticsConsent === false;
}

/**
 * Posts the event on, with the credentials the browser never sees.
 *
 * Never throws and never reports back. The caller has already answered `202`
 * on the strength of having accepted the event, and a beacon is not something
 * a page can act on: an error here is an operator's problem, so it goes to the
 * log and no further. Transcribed from `forwardToOpenPanel`
 * (`index.ts:159-200`), including the `x-client-ip` and `user-agent`
 * pass-through, without which OpenPanel geolocates the Worker rather than the
 * visitor.
 *
 * The environment is read per request rather than at module scope. On Workers
 * a secret is an environment input, and a module-scope read happens once per
 * isolate — which also makes the credentials untestable without reloading the
 * module.
 */
async function forwardToOpenPanel(
  req: PayloadRequest,
  body: Record<string, unknown>
): Promise<void> {
  const clientId = process.env.OPENPANEL_CLIENT_ID ?? "";
  const clientSecret = process.env.OPENPANEL_CLIENT_SECRET ?? "";

  if (!(clientId && clientSecret)) {
    req.payload.logger.warn(
      "[openpanel] Relay credentials are not configured; the event was accepted and dropped"
    );

    return;
  }

  const apiUrl = process.env.OPENPANEL_API_URL || DEFAULT_API_URL;
  const headers = new Headers({
    "Content-Type": "application/json",
    "openpanel-client-id": clientId,
    "openpanel-client-secret": clientSecret,
    "openpanel-sdk-name": SDK_NAME,
    "openpanel-sdk-version": SDK_VERSION,
  });

  const clientIp = clientIpForGeolocation(req.headers);
  const userAgent = req.headers.get("user-agent");

  if (clientIp) {
    headers.set("x-client-ip", clientIp);
  }

  if (userAgent) {
    headers.set("user-agent", userAgent);
  }

  try {
    const response = await fetch(`${apiUrl}/track`, {
      body: JSON.stringify(body),
      headers,
      method: "POST",
      signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
    });

    if (!(response.status === 200 || response.status === 202)) {
      req.payload.logger.error(
        `[openpanel] Relay failed with status ${response.status}: ${await response.text()}`
      );
    }
  } catch (error) {
    req.payload.logger.error(
      { err: error },
      "[openpanel] Relay request failed"
    );
  }
}

/**
 * The two payload shapes OpenPanel takes, checked before anything is
 * forwarded.
 *
 * `track` is checked against the allowlist; `identify` only has to carry a
 * profile id. Anything else is refused rather than passed through, because
 * "whatever the client sent" reaching a vendor's ingest with this
 * application's credentials on it is the thing the relay exists to prevent.
 */
function isForwardable(body: Record<string, unknown>): boolean {
  if (!(isString(body.type) && isRecord(body.payload))) {
    return false;
  }

  if (body.type === "track") {
    const { name } = body.payload;

    return isString(name) && Object.hasOwn(TRACK_EVENTS, name);
  }

  if (body.type === "identify") {
    return isString(body.payload.profileId);
  }

  return false;
}

const track: PayloadHandler = async (req) => {
  const crossSite = guardOrigin(req);

  if (crossSite) {
    return crossSite;
  }

  /*
   * Before the body is read, deliberately. A limiter that only counted
   * well-formed requests would be a limiter a flood could walk past by
   * sending nonsense.
   */
  const verdict = await takeRateLimit({
    key: rateLimitKey(req.headers),
    limit: ANALYTICS_LIMIT,
    namespace: NAMESPACE,
    payload: req.payload,
    windowSeconds: WINDOW_SECONDS,
  });

  if (verdict.allowed === false) {
    return tooManyRequests(verdict);
  }

  const body = await readBody(req);

  if (!isForwardable(body)) {
    return refused("Unknown analytics payload", 400);
  }

  if (await withdrewConsent(req)) {
    return refused("Analytics consent was withdrawn", 403);
  }

  await forwardToOpenPanel(req, {
    payload: body.payload,
    type: body.type,
  });

  return accepted();
};

export const analyticsEndpoints: Endpoint[] = [
  { handler: track, method: "post", path: "/analytics/track" },
];
