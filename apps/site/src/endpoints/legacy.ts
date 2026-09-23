import type { Endpoint, PayloadHandler, PayloadRequest } from "payload";
import { parseGestureListParams } from "@/lib/gestureListParams";
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

/**
 * More `category` values than any real filter carries. The rest are dropped
 * rather than looked up, which keeps both lookups below well inside D1's
 * limit on bound parameters.
 */
const MAX_CATEGORIES = 20;

/**
 * Each of `values` as the id of the active category it names, in order and
 * without duplicates; a value that names none is left out, and `dropped`
 * says whether any was.
 *
 * A numeric value that is an active category's own id stays as it is, since
 * that is what the site's own filter links carry. Otherwise the value is
 * tried as a category's `legacyId`, the previous backend's id, as the
 * gesture lookup above does. Both reads are anonymous (`overrideAccess:
 * false`, no user), so `publicReadActive` limits them to active categories
 * exactly as the list's own filter would, and neither selects more than the
 * id and, for the second, the `legacyId` it matched on.
 */
async function translateCategories(
  req: PayloadRequest,
  values: string[]
): Promise<{ dropped: boolean; ids: string[] }> {
  const numeric = values.filter((value) => NUMERIC_ID.test(value));
  const legacy = values.filter((value) => LEGACY_ID.test(value));

  const byId =
    numeric.length === 0
      ? []
      : (
          await req.payload.find({
            collection: "categories",
            depth: 0,
            limit: numeric.length,
            overrideAccess: false,
            select: {},
            where: { id: { in: numeric.map(Number) } },
          })
        ).docs;

  const byLegacyId =
    legacy.length === 0
      ? []
      : (
          await req.payload.find({
            collection: "categories",
            depth: 0,
            limit: legacy.length,
            overrideAccess: false,
            select: { legacyId: true },
            where: { legacyId: { in: legacy } },
          })
        ).docs;

  const active = new Set(byId.map((doc) => String(doc.id)));
  const fromLegacy = new Map(
    byLegacyId.map((doc) => [doc.legacyId ?? "", String(doc.id)])
  );

  const translated = values.map((value) =>
    active.has(value) ? value : fromLegacy.get(value)
  );
  const ids = translated.filter((id): id is string => id !== undefined);

  return {
    dropped: ids.length < translated.length,
    ids: [...new Set(ids)],
  };
}

/**
 * `GET /api/legacy/gestures` (and `HEAD`), reached at `/gestures` through a
 * rewrite in `next.config.ts` — the previous website's gesture list, whose
 * `category` filter carried the previous backend's category ids (imported
 * as `legacyId`), so a static redirect would keep the filter and land on an
 * empty list.
 *
 * Every `category` value, repeated or comma-separated as the list itself
 * accepts (`parseGestureListParams`), becomes the id of the active category
 * it names; every other parameter (`q`, `page`, anything else) is kept as it
 * came. Then:
 *
 * - every value translated → a 308 to `/nl/gestures` with the translated
 *   filter. The mapping is fixed, so the answer is permanent and may be
 *   cached for a day;
 * - any value dropped (unknown, inactive, malformed, over the limit) → a
 *   307, `no-store`, with the values that did translate. Temporary for the
 *   reason the gesture redirect gives: a category inactive today may be
 *   published tomorrow, and a cached permanent answer would lose it for good.
 */
const redirectLegacyGestureList: PayloadHandler = async (req) => {
  const { searchParams } = new URL(req.url ?? "", "http://legacy.invalid");
  const values = [...new Set(parseGestureListParams(searchParams).categories)];
  const { dropped, ids } = await translateCategories(
    req,
    values.slice(0, MAX_CATEGORIES)
  );

  const query = new URLSearchParams(searchParams);
  query.delete("category");
  if (ids.length > 0) {
    // The comma form, as `gestureListHref` writes it.
    query.set("category", ids.join(","));
  }

  const rest = query.toString();
  const search = rest === "" ? "" : `?${rest}`;

  return dropped || values.length > MAX_CATEGORIES
    ? redirect(307, `${GESTURES}${search}`, "no-store")
    : redirect(308, `${GESTURES}${search}`, "public, max-age=86400");
};

/*
 * `head` as well as `get`, because these are exactly the URLs link checkers
 * probe. Next answers a `HEAD` by calling the route's `GET` with the method
 * unchanged, and Payload matches endpoints by method, so without the second
 * entry a `HEAD` of a working old link is a 404.
 */
export const legacyEndpoints: Endpoint[] = (["get", "head"] as const).flatMap(
  (method) => [
    { handler: redirectLegacyGestureList, method, path: "/legacy/gestures" },
    {
      handler: redirectLegacyGesture,
      method,
      path: "/legacy/gestures/:id",
    },
  ]
);
