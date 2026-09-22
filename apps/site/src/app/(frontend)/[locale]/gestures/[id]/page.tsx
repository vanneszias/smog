import { Badge, Card, VideoPlayer } from "@smog/ui-web";
import type { Metadata } from "next";
import { headers } from "next/headers";
import { notFound } from "next/navigation";
import { cache } from "react";
import { FavoriteButton } from "@/components/FavoriteButton";
import { GestureViewTracker } from "@/components/GestureViewTracker";
import { isAccountFavorite } from "@/lib/accountFavorites";
import { fetchGesture, fetchViewer } from "@/lib/gestureDetail";
import { isLocale, type Locale, localeAlternates } from "@/lib/locale";
import { fetchGestureOverlay, sponsorLogo } from "@/lib/sponsorOverlay";
import type { Category } from "@/payload-types";

/**
 * Rendered per request, never prerendered — same two reasons as the list
 * page, plus a third of its own.
 *
 * The parent layout's `generateStaticParams` makes Next attempt this route
 * during `next build`, and at build time `payload.config.ts` hands the D1
 * adapter an inert placeholder (see `BUILD_PHASE_BINDINGS` there), so a query
 * from a prerender fails the build rather than the request. The third reason
 * is `headers()`: this page's answer depends on who is asking, because an
 * admin sees an inactive gesture that an anonymous visitor may not. A cached
 * copy of either answer served to the other is a bug, and for the admin
 * direction it is a disclosure.
 */
export const dynamic = "force-dynamic";

/**
 * What the `<h1>` and the `<title>` say when a gesture has no name at all.
 *
 * Not the same case as an untranslated one: Payload's `fallback: true` already
 * serves the Dutch name to a French visitor (pinned in
 * `gestureDetail.int.test.ts`), so this only covers a row whose Dutch name is
 * missing too — which `defaultLocaleRequired` prevents on write but which
 * Stage 9's import could still produce.
 */
const UNNAMED = "Gebaar";

/**
 * Loaded once per request, not once per caller.
 *
 * `generateMetadata` and the component below both need the same gesture and
 * the same viewer, and Next runs them in the same request scope, so React's
 * `cache` collapses the four queries that would otherwise be two pairs into
 * two. The arguments are primitives, which is what makes the memo key work —
 * passing the viewer *object* in would miss on every call.
 */
const loadViewer = cache(async () => await fetchViewer(await headers()));

const loadGesture = cache(
  async (id: string, locale: Locale) =>
    await fetchGesture({ id, locale, user: await loadViewer() })
);

export async function generateMetadata({
  params,
}: {
  params: Promise<{ id: string; locale: string }>;
}): Promise<Metadata> {
  const { id, locale } = await params;

  if (!isLocale(locale)) {
    return {};
  }

  const gesture = await loadGesture(id, locale);

  if (!gesture) {
    // The page 404s this, and Next renders the not-found boundary's own
    // metadata. Returning a title here would title a page that does not
    // exist.
    return {};
  }

  return {
    alternates: {
      canonical: `/${locale}/gestures/${gesture.id}`,
      /*
       * The gesture's own id rather than the raw segment, so
       * `/nl/gestures/007` does not advertise `/fr/gestures/007` as an
       * alternate of `/fr/gestures/7`.
       */
      languages: localeAlternates(`/gestures/${gesture.id}`),
    },
    /*
     * `info` is localized and optional, so this is frequently absent — and an
     * absent description is better than an invented one. `undefined` makes
     * Next omit the tag; `""` would emit an empty one.
     */
    description: gesture.info ?? undefined,
    title: gesture.name ?? UNNAMED,
  };
}

/**
 * One gesture: its video, its categories and whatever a sponsor paid to put
 * beside it.
 *
 * A Server Component reading Payload's Local API directly. Three things are
 * load-bearing and none of them is visible in the markup:
 *
 * - the read goes through `publicReadActive` (`overrideAccess: false`), so an
 *   inactive gesture 404s for an anonymous visitor and renders for an admin;
 * - the sponsorship is read through a projection that never hands this
 *   component the sponsor's contact details, only the four display fields;
 * - the locale check is repeated from the layout, because `notFound()` in a
 *   layout is caught by the boundary *above* it and the two render different
 *   pages.
 *
 * `params` is a Promise in Next 16 — verified against the generated
 * `.next/types/validator.ts` rather than assumed from the old API.
 */
export default async function GestureDetailPage({
  params,
}: {
  params: Promise<{ id: string; locale: string }>;
}) {
  const { id, locale } = await params;

  if (!isLocale(locale)) {
    notFound();
  }

  const gesture = await loadGesture(id, locale);

  if (!gesture) {
    notFound();
  }

  /*
   * The same `payload.auth` the access check above already paid for —
   * `loadViewer` is `cache`d, so asking again inside one request is free.
   * This is the whole of Task 4's cost on this route: the page was already
   * `force-dynamic` and already resolving the viewer, so the signed-in
   * favourite path costs it no prerendering and no extra query. The routes
   * where that was *not* true are the ones whose account state is resolved
   * in the browser instead; the reasoning is in the Task 4 report.
   */
  const viewer = await loadViewer();
  const gestureId = String(gesture.id);

  /*
   * Keyed on the document's own id rather than on the URL segment: the
   * segment is unvalidated input, and `/nl/gestures/7abc` must not be able to
   * address a different row here than it did above.
   */
  const overlay = await fetchGestureOverlay(gesture.id);

  const name = gesture.name ?? UNNAMED;
  const categories = (gesture.categories ?? []).filter(
    (category): category is Category => typeof category === "object"
  );
  const concepts = gesture.concepts ?? [];

  /*
   * A sponsored gesture has its own cut of the video, with the sponsor's
   * branding rendered into it. When one exists it replaces the original —
   * showing both, or showing the original beside a sponsor credit, is not
   * what was sold.
   */
  const playbackId = overlay?.sponsoredVideoPlaybackId ?? gesture.playbackId;

  /*
   * A named rule rather than an `&&` in the markup: `hasLogo` is "whether the
   * sponsor paid for a logo", not "whether a file was uploaded", and the two
   * come apart. See `sponsorLogo`.
   */
  const logo = overlay === null ? null : sponsorLogo(overlay);

  return (
    <article className="flex flex-col gap-6">
      <GestureViewTracker gestureId={gestureId} />

      <nav aria-label="Kruimelpad">
        <a
          className="text-primary text-sm underline underline-offset-2"
          href={`/${locale}/gestures`}
        >
          Terug naar alle gebaren
        </a>
      </nav>

      <header className="flex flex-col gap-3">
        <div className="flex items-start justify-between gap-4">
          <h1 className="font-bold text-foreground text-xxl">{name}</h1>
          {/*
           * A client island, and the only one on this page. For a guest it
           * reads `localStorage` after hydration, so the heart fills a tick
           * late rather than being server-rendered wrong; for a signed-in
           * reader the server already knows and it is correct on the first
           * paint — see `FavoriteButton`. Keyed on the document's id for the
           * same reason the overlay is: the URL segment is unvalidated
           * input.
           */}
          <FavoriteButton
            className="shrink-0"
            gestureId={gestureId}
            initialFavorite={isAccountFavorite(viewer, gestureId)}
            locale={locale}
            signedIn={viewer !== null}
          />
        </div>

        {categories.length > 0 ? (
          <ul aria-label="Categorieën" className="flex flex-wrap gap-2">
            {categories.map((category) => (
              <li key={category.id}>
                <Badge size="sm">{category.name ?? ""}</Badge>
              </li>
            ))}
          </ul>
        ) : null}
      </header>

      {/*
       * `data-playback-id` is not decoration: Stage 2 established that
       * `@mux/mux-player-react` server-renders no `playback-id` and only sets
       * it after hydration, and that the element removes itself into an error
       * state when it cannot reach Mux — so "the player was given the right
       * id" is not reliably observable on the element itself. This is.
       */}
      <div data-playback-id={playbackId} data-testid="gesture-video">
        <VideoPlayer playbackId={playbackId} title={name} />
      </div>

      {overlay === null ? null : (
        <Card className="flex flex-col gap-3 p-6" data-testid="sponsor-overlay">
          <p className="font-medium text-foreground text-sm">
            {overlay.overlayText}
          </p>

          {/*
           * `width`/`height` are a reserved box rather than a measurement:
           * the projection carries the url and the alt text and nothing else,
           * on purpose, so the intrinsic size is not available here. The CSS
           * decides the rendered size; the attributes exist so the box is
           * reserved before the image arrives.
           */}
          {logo === null ? null : (
            // biome-ignore lint/performance/noImgElement: `next/image` routes through the image optimizer, which needs sharp and does not run on workerd. The logo is a small file served straight from R2 through Payload's media route.
            <img
              alt={logo.alt}
              className="max-h-12 max-w-24 object-contain"
              data-testid="sponsor-logo"
              height={48}
              src={logo.url}
              width={96}
            />
          )}
        </Card>
      )}

      {gesture.info ? (
        <section className="flex flex-col gap-2">
          <h2 className="font-semibold text-foreground text-lg">Uitleg</h2>
          <p className="max-w-3xl whitespace-pre-line text-foreground text-md">
            {gesture.info}
          </p>
        </section>
      ) : null}

      {concepts.length > 0 ? (
        <section className="flex flex-col gap-2">
          <h2 className="font-semibold text-foreground text-lg">
            Andere woorden
          </h2>
          <ul aria-label="Andere woorden" className="flex flex-wrap gap-2">
            {concepts.map((concept) => (
              <li key={concept}>
                <Badge size="sm" variant="outline">
                  {concept}
                </Badge>
              </li>
            ))}
          </ul>
        </section>
      ) : null}
    </article>
  );
}
