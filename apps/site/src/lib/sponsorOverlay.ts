import { getPayloadClient } from "./payloadClient";

/*
 * Not exported, for the reason spelled out in `gestureQuery.ts`: knip fails
 * `bun release:check` on an exported symbol nothing imports, and the only
 * caller — the detail page — reads the fields off the result rather than
 * naming the type. It is still the module's contract; it is just spelled out
 * in the return type instead of re-exported.
 */
interface GestureOverlay {
  overlayText: string;
  sponsoredVideoPlaybackId: string | null;
  hasLogo: boolean;
  overlayImage: { url: string; alt: string } | null;
}

/**
 * The four display fields a sponsored gesture page needs, and nothing else.
 *
 * **This is a narrow read path, not a widened one.** `sponsorships.read` is
 * `isAdmin` and stays that way: a row carries the sponsor's email, contact
 * name, VAT number, invoice details and re-edit token, and every one of
 * those is personal data that has no business leaving the server. So the
 * privileged query runs here, with `overrideAccess: true`, and only the
 * projection below crosses into the render.
 *
 * Two defences, because they fail differently:
 *
 * - `select` keeps the other columns out of the row the database returns, so
 *   the PII is never in memory to be leaked by a later `JSON.stringify`.
 * - the returned object is built field by field, so a `select` that a future
 *   Payload release interprets more loosely still cannot widen what escapes.
 *
 * Returning the document itself — even the selected one — would be the easy
 * mistake, and `never returns the sponsor's contact details` exists to fail
 * on it: Payload always returns `id`, and `select` is not a guarantee about
 * what a *relationship* drags along with it.
 *
 * **"Active" is not enough; the term has to be checked too.** Stage 1 shipped
 * no status-transition enforcement and no expiry job, so a row with
 * `status: "active"` and an `endDate` in the past genuinely exists in the
 * data. Rendering it would put a sponsorship nobody is paying for on a public
 * page. All three conditions are therefore in the `where`, where the database
 * applies them to the row it is already reading rather than in a filter over
 * a result the query was free to get wrong.
 *
 * The dates are compared as ISO-8601 strings, which is what the D1 adapter
 * stores and what sorts identically lexically and chronologically. `now` is
 * read once so the two bounds cannot straddle a tick.
 *
 * Sorted by `-startDate` and limited to one: overlapping sponsorships on one
 * gesture are not prevented anywhere, and "the one that started most
 * recently" is at least a rule, where "whichever the database happened to
 * return" is not.
 */
export async function fetchGestureOverlay(
  gestureId: number | string
): Promise<GestureOverlay | null> {
  const payload = await getPayloadClient();
  const now = new Date().toISOString();

  const result = await payload.find({
    collection: "sponsorships",
    // Populates `overlayImage` into a `media` document, which is where the
    // url and the alt text come from. `media` is public; the sponsorship is
    // not.
    depth: 1,
    limit: 1,
    /*
     * Deliberate, and the reason this function exists. It runs only on the
     * server, and only the four fields below leave it.
     */
    overrideAccess: true,
    select: {
      hasLogo: true,
      overlayImage: true,
      overlayText: true,
      sponsoredVideoPlaybackId: true,
    },
    sort: "-startDate",
    where: {
      and: [
        { gesture: { equals: gestureId } },
        { status: { equals: "active" } },
        { startDate: { less_than_equal: now } },
        { endDate: { greater_than_equal: now } },
      ],
    },
  });

  const sponsorship = result.docs[0];

  if (!sponsorship) {
    return null;
  }

  const image = sponsorship.overlayImage;
  const hasImage =
    typeof image === "object" &&
    image !== null &&
    typeof image.url === "string";

  return {
    // `hasLogo` is a nullable checkbox in the schema, so `=== true` rather
    // than a cast: the page branches on it and `null` is not a branch.
    hasLogo: sponsorship.hasLogo === true,
    overlayImage: hasImage
      ? { alt: image.alt, url: image.url as string }
      : null,
    overlayText: sponsorship.overlayText,
    sponsoredVideoPlaybackId: sponsorship.sponsoredVideoPlaybackId ?? null,
  };
}

/**
 * The sponsor's logo, when the sponsor paid for one.
 *
 * Both halves matter, which is why this is a named rule and not an `&&` in
 * the middle of some JSX. `hasLogo` records whether the logo option was part
 * of the package — `packages/convex/convex/schema.ts` says so in as many
 * words ("whether user paid for logo"), and
 * `apps/server/src/services/sponsorship.ts` gates the old renderer on exactly
 * this pair — so an image uploaded against a package that did not include one
 * must not be rendered. An overlay with `hasLogo` set and no image is the
 * other way round: nothing to draw.
 */
export function sponsorLogo(
  overlay: GestureOverlay
): { url: string; alt: string } | null {
  return overlay.hasLogo ? overlay.overlayImage : null;
}
