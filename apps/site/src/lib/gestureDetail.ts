import type { TypedUser } from "payload";
import type { Gesture } from "@/payload-types";
import type { Locale } from "./locale";
import { getPayloadClient } from "./payloadClient";

/**
 * One gesture, read the way an anonymous visitor reads it.
 *
 * `overrideAccess: false` is the whole point: `publicReadActive` turns an
 * anonymous read into `{ isActive: { equals: true } }`, so an inactive
 * gesture comes back as `null` and the page 404s it. A detail page is the
 * obvious place for an `overrideAccess: true` to slip in — it is the one
 * query on the public site that already knows exactly which row it wants —
 * so the pair of tests in `gestureDetail.int.test.ts` pins both halves: an
 * anonymous visitor cannot see an inactive gesture, and an admin can.
 *
 * `disableErrors: true` rather than a try/catch, checked against
 * `node_modules/payload/dist/collections/operations/findByID.js` (3.89.0)
 * rather than assumed. Without it the operation throws `NotFound` for a
 * missing row and `Forbidden` from `executeAccess` for a denied one, so the
 * two cases would need catching and distinguishing by error class; with it
 * both return `null`, which is the single thing this caller wants to know.
 * Nothing else is swallowed — a database failure still throws.
 *
 * `depth: 1` populates `categories`, which the page renders by name. At
 * `depth: 0` they are bare ids with nothing to show.
 *
 * The id arrives from the URL, so it can be anything at all. Payload coerces
 * it for the numeric primary key and a `NaN` matches no row (verified in
 * `@payloadcms/drizzle/dist/queries/sanitizeQueryValue.js`), so `banana`
 * 404s rather than 500s; that is pinned by a test rather than trusted.
 */
export async function fetchGesture({
  id,
  locale,
  user,
}: {
  id: string;
  locale: Locale;
  user?: TypedUser | null;
}): Promise<Gesture | null> {
  const payload = await getPayloadClient();

  return await payload.findByID({
    collection: "gestures",
    depth: 1,
    disableErrors: true,
    id,
    locale,
    overrideAccess: false,
    user: user ?? undefined,
  });
}

/**
 * The signed-in user behind a request, or `null`.
 *
 * Takes the headers rather than calling `next/headers` itself, for two
 * reasons: `headers()` is only callable inside a request scope, so importing
 * this module from a test or a script would otherwise be a landmine, and
 * passing them in is what makes the cookie path testable at all.
 *
 * **Deliberately not wrapped in a try/catch**, which is the opposite of what
 * `AGENTS.md` asks for by default and so is worth saying why. A bad cookie
 * does not throw: `payload/dist/auth/strategies/jwt.js` (3.89.0) catches
 * every failure of `jwtVerify` itself and returns `{ user: null }`, which is
 * exactly the anonymous page a forged, tampered or expired token should get
 * — and `fetchViewer resolves a forged token to null` pins that, so a future
 * Payload that starts throwing is caught rather than discovered in
 * production. What is left for a catch here is a boot or database failure,
 * and swallowing one of those would render the site as anonymous while it is
 * broken: an admin would get a 404 for their own inactive gesture with
 * nothing in the logs. That belongs in the error boundary, not here.
 */
export async function fetchViewer(
  requestHeaders: Headers
): Promise<TypedUser | null> {
  const payload = await getPayloadClient();
  const { user } = await payload.auth({ headers: requestHeaders });

  return user;
}
