import type { Endpoint, PayloadHandler, PayloadRequest } from "payload";
import { DEFAULT_LOCALE } from "@/lib/locale";

const GESTURES = `/${DEFAULT_LOCALE}/gestures`;

/** A primary key, as the site's own gesture URLs carry it. */
const NUMERIC_ID = /^\d{1,15}$/;

/**
 * Anything an imported `legacyId` can be: the previous backend's document
 * ids are short alphanumeric strings. Anything else is a URL nobody ever
 * generated, and goes straight to the list without a lookup.
 */
const LEGACY_ID = /^[A-Za-z0-9_-]{1,64}$/;

/**
 * The active gesture a legacy URL's id names, or `null`.
 *
 * Read as an anonymous visitor would (`overrideAccess: false`, no user), so
 * `publicReadActive` adds `isActive: true` and an inactive gesture is `null`
 * exactly like a missing one. No `overrideAccess` is needed: `legacyId` has
 * no field-level access of its own, and `admin.hidden` only hides it in the
 * admin. `select: {}` returns the id and nothing else.
 *
 * `disableErrors` on the primary-key read for the reason `lib/gestureDetail.ts`
 * gives: a missing or denied row is `null` rather than a thrown `NotFound` or
 * `Forbidden`, while a database failure still throws.
 *
 * A numeric id is tried as a primary key first, because that is the URL the
 * site itself builds; only when no active gesture has that id is it tried as
 * a `legacyId`.
 */
async function findActiveGestureId(
  req: PayloadRequest,
  id: string
): Promise<null | number> {
  if (NUMERIC_ID.test(id)) {
    const byId = await req.payload.findByID({
      collection: "gestures",
      depth: 0,
      disableErrors: true,
      id: Number(id),
      overrideAccess: false,
      select: {},
    });

    if (byId) {
      return byId.id;
    }
  }

  if (!LEGACY_ID.test(id)) {
    return null;
  }

  const byLegacyId = await req.payload.find({
    collection: "gestures",
    depth: 0,
    limit: 1,
    overrideAccess: false,
    select: {},
    where: { legacyId: { equals: id } },
  });

  return byLegacyId.docs[0]?.id ?? null;
}

function redirect(
  status: 307 | 308,
  location: string,
  cacheControl: string
): Response {
  return new Response(null, {
    headers: { "Cache-Control": cacheControl, Location: location },
    status,
  });
}

/**
 * `GET /api/legacy/gestures/:id` (and `HEAD`), reached at `/gestures/:id`
 * through a rewrite in `next.config.ts` — the previous website's gesture
 * URL, whose id was the previous backend's document id (imported as
 * `legacyId`).
 *
 * A Payload endpoint rather than a `route.ts` under `app/`, for the bundle
 * reason `endpoints/crawler.ts` measured: a route handler that queries
 * Payload is its own bundle entry carrying a second copy of the whole
 * Payload graph, while a handler here rides on the REST entry that already
 * carries it.
 *
 * Every answer is a redirect with the request's query string kept:
 *
 * - an active gesture → a 308 to its page in the default locale. The mapping
 *   from an old id to a new one never changes, so the answer is permanent
 *   and may be cached for a day;
 * - anything else — unknown, inactive, malformed → a 307 to the gesture
 *   list, `no-store`. Temporary on purpose: a gesture that is inactive today
 *   (an imported one still waiting for an editor, say) may be published
 *   tomorrow, and a permanent redirect to the list would be cached by
 *   browsers and taken by search engines as the old URL's new home, so the
 *   gesture would never be found there again.
 *
 * Nothing here throws for an id it does not recognise; a database failure
 * still does, and surfaces as Payload's own error response.
 */
const redirectLegacyGesture: PayloadHandler = async (req) => {
  const requested = req.routeParams?.id;
  const id = typeof requested === "string" ? requested : "";
  const { search } = new URL(req.url ?? "", "http://legacy.invalid");

  const gestureId = id === "" ? null : await findActiveGestureId(req, id);

  if (gestureId === null) {
    return redirect(307, `${GESTURES}${search}`, "no-store");
  }

  return redirect(
    308,
    `${GESTURES}/${gestureId}${search}`,
    "public, max-age=86400"
  );
};

/*
 * `head` as well as `get`, because these are exactly the URLs link checkers
 * probe. Next answers a `HEAD` by calling the route's `GET` with the method
 * unchanged, and Payload matches endpoints by method, so without the second
 * entry a `HEAD` of a working old link is a 404.
 */
export const legacyEndpoints: Endpoint[] = (["get", "head"] as const).map(
  (method) => ({
    handler: redirectLegacyGesture,
    method,
    path: "/legacy/gestures/:id",
  })
);
