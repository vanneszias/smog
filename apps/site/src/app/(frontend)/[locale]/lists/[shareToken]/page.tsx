import { Card } from "@smog/ui-web";
import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { cache } from "react";
import { GestureResults } from "@/components/GestureResults";
import { toGestureSummary } from "@/lib/gestureQuery";
import { isLocale, type Locale } from "@/lib/locale";
import { fetchSharedList } from "@/lib/sharedList";
import type { Gesture } from "@/payload-types";

/**
 * Rendered per request, never prerendered — the same two reasons as every
 * other page in this group, plus one of its own.
 *
 * The parent layout's `generateStaticParams` makes Next attempt this route
 * during `next build`, and at build time `payload.config.ts` hands the D1
 * adapter an inert placeholder, so a query from a prerender fails the build
 * rather than the request. The reason of its own is that the answer depends
 * on a secret in the URL and changes the moment the owner revokes it; a
 * cached copy would keep answering after the link was rotated away.
 */
export const dynamic = "force-dynamic";

/** What the page says when the token names nothing. */
const GONE_TITLE = "Deze link werkt niet meer";

/**
 * Loaded once per request rather than once per caller.
 *
 * `generateMetadata` and the component below want the same list, and Next
 * runs them in one request scope, so React's `cache` collapses two queries
 * into one. The arguments are primitives, which is what makes the memo key
 * work — passing an object in would miss on every call.
 */
const loadList = cache(
  async (token: string, locale: Locale) =>
    await fetchSharedList({ locale, token })
);

/**
 * A share link is a secret in a URL, so nothing about this page may be
 * indexed — `follow: false` too, because the gestures it links to are already
 * reachable from the public list and a crawler here adds nothing but a record
 * that the link exists.
 */
export async function generateMetadata({
  params,
}: {
  params: Promise<{ locale: string; shareToken: string }>;
}): Promise<Metadata> {
  const { locale, shareToken } = await params;
  const robots = { follow: false, index: false };

  if (!isLocale(locale)) {
    return { robots };
  }

  const list = await loadList(shareToken, locale);

  return { robots, title: list === null ? GONE_TITLE : list.name };
}

/**
 * Somebody else's list, opened from the link they sent.
 *
 * A Server Component reading Payload's Local API directly. What makes it
 * correct is entirely in `fetchSharedList` — the token reaching the access
 * filter through `req.searchParams`, which a Local API call is the one caller
 * that has to arrange for itself — and the two branches here are the only
 * product decisions:
 *
 * - **A token that names nothing renders, it does not 404 and it does not
 *   500.** A revoked link is the expected end of a share link's life, not an
 *   error: the reader did nothing wrong and the owner did something
 *   deliberate, and a 404 page tells them neither. Un-sharing works by
 *   rotating the tokens (see `Lists.ts`), so this is the page every revoked
 *   link lands on.
 * - **The reader's identity is not consulted, signed in or not.** The token
 *   is the whole capability, and `fetchSharedList` says why in detail: the
 *   answer is provably the same either way, so the page does not spend a
 *   `payload.auth` per request to arrive at it. A signed-in recipient
 *   seeing nothing is fixed in `listReadAccess`, and matters on the path
 *   where Payload sets `req.user` itself, which is the REST API.
 *
 * The locale check is repeated from the layout because `notFound()` in a
 * layout is caught by the boundary *above* it, so the two render different
 * pages.
 */
export default async function SharedListPage({
  params,
}: {
  params: Promise<{ locale: string; shareToken: string }>;
}) {
  const { locale, shareToken } = await params;

  if (!isLocale(locale)) {
    notFound();
  }

  const list = await loadList(shareToken, locale);

  if (list === null) {
    return (
      <div className="flex flex-col gap-4" data-testid="share-link-invalid">
        <h1 className="font-bold text-foreground text-xxl">{GONE_TITLE}</h1>
        <p className="max-w-2xl text-foreground-muted text-md">
          De eigenaar heeft deze lijst weer op prive gezet, of de link is
          verlopen. Vraag degene die hem deelde om een nieuwe link.
        </p>
        <p>
          <a
            className="text-primary text-sm underline underline-offset-2"
            href={`/${locale}/gestures`}
          >
            Bekijk alle gebaren
          </a>
        </p>
      </div>
    );
  }

  /*
   * An item whose gesture is still a bare id is dropped rather than rendered
   * as a blank card. At `depth: 2` that only happens when the row points at a
   * gesture the reader may not see — `publicReadActive` leaves a deactivated
   * one unpopulated — which is the same "a bookmark can go stale" rule the
   * favorites page follows, and not an error worth showing.
   */
  const gestures = (list.items ?? [])
    .map((item) => item.gesture)
    .filter((gesture): gesture is Gesture => typeof gesture === "object")
    .map(toGestureSummary);

  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-col gap-2">
        <h1 className="font-bold text-foreground text-xxl">{list.name}</h1>
        {list.description ? (
          <p className="max-w-2xl whitespace-pre-line text-foreground-muted text-md">
            {list.description}
          </p>
        ) : null}
        <p className="text-foreground-muted text-sm" data-testid="share-count">
          {gestures.length} gebaren
        </p>
      </div>

      {gestures.length === 0 ? (
        <Card className="p-6" data-testid="share-empty">
          <p className="text-foreground-muted text-md">
            Deze lijst is nog leeg.
          </p>
        </Card>
      ) : (
        <GestureResults gestures={gestures} locale={locale} />
      )}

      {/*
       * Said on the page, not only in a commit message. Anyone holding this
       * URL can read the list, and the owner can end that at any moment by
       * making the list private again — which rotates the token, so this
       * exact link stops working rather than merely being discouraged.
       */}
      <p className="text-foreground-muted text-sm">
        Je bekijkt een gedeelde lijst. Iedereen met deze link kan hem zien,
        totdat de eigenaar de lijst weer op prive zet.
      </p>
    </div>
  );
}
