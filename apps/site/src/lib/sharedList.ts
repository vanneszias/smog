import type { List } from "@/payload-types";
import type { Locale } from "./locale";
import { getPayloadClient } from "./payloadClient";

/**
 * One list, resolved from the view-share token in its URL.
 *
 * Four things here are decisions rather than defaults, and none of them is
 * obvious from the call:
 *
 * **`req.searchParams` is the only way the token reaches the access filter.**
 * `listReadAccess` reads `req.searchParams.get("shareToken")`, which on a
 * REST request Payload fills in from the URL. A Local API call has no URL:
 * `payload/dist/utilities/createLocalReq.js` (3.89.0) synthesises a fake one
 * (`http://localhost`) and — the important part — assigns
 * `req.searchParams` from it *only when the caller has not supplied one*
 * (`if (!req.searchParams)`). So passing a `URLSearchParams` in survives, and
 * omitting it would hand the access function an empty one, which is exactly
 * the tokenless case it denies. This is the page path, not the REST path, and
 * it is not the same plumbing.
 *
 * **`overrideAccess: false` and the explicit `where` are belt and braces,
 * deliberately.** Each on its own already narrows the answer to the one list
 * the token names — the access filter for an anonymous read *is*
 * `{ viewShareToken: { equals: token } }` — so removing either alone changes
 * no answer, and a mutation sweep confirmed exactly that. Removing **both**
 * is caught, loudly, by every resolution test in
 * `shareTokens.int.test.ts`. This is the same pairing the gestures list uses
 * for `isActive`, kept for the same reason: the query stays correct the day
 * someone loosens the access rule for an unrelated reason, and it costs one
 * term in a query that was being built anyway. `sharedList.test.ts` pins each
 * half by name so neither can be dropped as "redundant".
 *
 * **`disableErrors: true`** so a denied read is `docs: []` rather than a
 * thrown `Forbidden` —
 * `payload/dist/collections/operations/find.js` throws from `executeAccess`
 * when access returns `false` and errors are enabled, and a share page whose
 * job is to say "this link is no longer valid" must not answer 500 to a bad
 * link. The blank-token guard below means that path is not normally reached;
 * this is what keeps it from being reached by accident.
 *
 * `depth: 2` because the page draws each item's gesture *and* its category
 * names: `depth: 1` populates `items.gesture` and leaves `gesture.categories`
 * as bare ids with nothing to render.
 *
 * **The read is anonymous even when the reader is signed in**, and that is a
 * decision rather than an omission. `listReadAccess` widens a signed-in
 * reader's filter with their token rather than replacing it, so passing the
 * viewer through would work — but it would answer identically, because the
 * token is the whole capability and the `where` pins it either way. A mutation
 * sweep proved it: ignoring the viewer argument failed no test at all, which is
 * what an extra `payload.auth` per request with no observable effect looks
 * like. The widened branch is still needed, and still proven, for the path
 * where the user genuinely arrives on their own — a signed-in browser hitting
 * Payload's REST `/api/lists? shareToken=...`, which `shareTokens.int.test.ts`
 * covers directly.
 */
export async function fetchSharedList({
  locale,
  token,
}: {
  locale: Locale;
  token: string;
}): Promise<List | null> {
  const trimmed = token.trim();

  /*
   * Not merely an optimisation, though it is one — a page hit with a blank
   * segment asks the database nothing. It is also the guard that keeps
   * `{ viewShareToken: { equals: "" } }` and `{ equals: " " }` out of the
   * `where`, which would match a list whose token genuinely is that string.
   * `shareToken()` normalises the same two cases on the access side; this is
   * the query side of the same rule, and `sharedList.test.ts` pins it by
   * asserting no query is issued.
   */
  if (trimmed === "") {
    return null;
  }

  const payload = await getPayloadClient();

  const { docs } = await payload.find({
    collection: "lists",
    depth: 2,
    disableErrors: true,
    limit: 1,
    locale,
    overrideAccess: false,
    req: { searchParams: new URLSearchParams({ shareToken: trimmed }) },
    where: { viewShareToken: { equals: trimmed } },
  });

  return docs[0] ?? null;
}
