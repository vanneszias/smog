import { MAX_GESTURES_PER_SPONSORSHIP } from "@smog/config/constants";
import { Button, GestureGrid, Input } from "@smog/ui-web";
import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { SponsorGestureSelection } from "@/components/SponsorGestureSelection";
import {
  parseGestureListParams,
  type RawSearchParams,
  toSearchParams,
} from "@/lib/gestureListParams";
import {
  fetchCategoryOptions,
  fetchGestures,
  toGestureSummary,
} from "@/lib/gestureQuery";
import { isLocale, localeAlternates, resolveLocale } from "@/lib/locale";
import { getPayloadClient } from "@/lib/payloadClient";
import { formatEuro, sponsorshipAmountCents } from "@/lib/pricing";
import { searchGestureIds } from "@/lib/search";
import { sponsoredGestureIds } from "@/lib/sponsorSelection";

export async function generateMetadata({
  params,
}: {
  params: Promise<{ locale: string }>;
}): Promise<Metadata> {
  const { locale } = await params;
  const base = {
    description: "Kies de gebaren die je wil sponsoren.",
    title: "Sponsor een gebaar",
  };

  if (!isLocale(locale)) {
    return base;
  }

  return {
    ...base,
    alternates: {
      canonical: `/${locale}/sponsor`,
      languages: localeAlternates("/sponsor"),
    },
  };
}

/**
 * Rendered per request, never prerendered — the same reason the gestures list
 * gives: this page reads `searchParams` and queries Payload, and at build
 * time `payload.config.ts` hands the D1 adapter an inert placeholder, so a
 * prerender would fail the build rather than the request.
 */
export const dynamic = "force-dynamic";

/**
 * What each refusal is allowed to say.
 *
 * Codes, never free text out of the URL: a `?error=` carrying a sentence is a
 * phishing surface even when React escapes it. Only the four the selection
 * itself can be refused with are here — the details and preview steps report
 * their own on their own pages.
 */
const ERRORS: Record<string, string> = {
  empty: "Kies minstens een gebaar om te sponsoren.",
  gesture:
    "Een van de gekozen gebaren bestaat niet meer, of is niet beschikbaar.",
  sold: "Een van de gekozen gebaren is intussen al gesponsord.",
  "too-many": `Je kan hoogstens ${MAX_GESTURES_PER_SPONSORSHIP} gebaren tegelijk sponsoren.`,
};

/**
 * Step 1 of the sponsor wizard: choose the gestures.
 *
 * **One form, two submit buttons, no client JavaScript.** Filtering, paging
 * and continuing are all submissions of the *same* form: the "continue"
 * button posts it to `/sponsor/start`, and the filter and page buttons
 * re-submit it as a GET to this page. That is what makes a tick survive a
 * search or a page turn with scripting off — the ticked boxes travel with the
 * query, come back as `?gestureId=…`, and are re-ticked below. A second form
 * for the filters would throw the selection away on every keystroke, which is
 * what the shipped React wizard uses component state to avoid.
 *
 * `fetchGestures`, `searchGestureIds` and `fetchCategoryOptions` are Stage
 * 3's and are not reimplemented here; the overshoot clamping in particular is
 * mutation-proven and this page would only get it wrong differently.
 */
export default async function SponsorPage({
  params,
  searchParams,
}: {
  params: Promise<{ locale: string }>;
  searchParams: Promise<RawSearchParams>;
}) {
  const { locale } = await params;

  if (!isLocale(locale)) {
    notFound();
  }

  const current = resolveLocale(locale);
  const raw = toSearchParams(await searchParams);
  const query = parseGestureListParams(raw);
  const error = raw.get("error");
  const message = error === null ? undefined : ERRORS[error];

  /*
   * The selection as the *previous* submission left it. Nothing else carries
   * it: there is no draft row, no cookie and no client state at this step,
   * which means a shared link to this page is a shared selection and a reload
   * loses nothing.
   */
  const selectedIds = [...new Set(raw.getAll("gestureId"))];

  const [searchIds, categories] = await Promise.all([
    query.q.trim() === "" ? undefined : searchGestureIds(query.q, current),
    fetchCategoryOptions(current),
  ]);

  const result = await fetchGestures({
    categories: query.categories,
    locale: current,
    page: query.page,
    q: query.q,
    searchIds,
  });

  const payload = await getPayloadClient();
  const sold = await sponsoredGestureIds(
    payload,
    result.gestures.map((gesture) => gesture.id)
  );

  const available = result.gestures.filter((gesture) => !sold.has(gesture.id));
  const taken = result.gestures.filter((gesture) => sold.has(gesture.id));

  /*
   * A gesture chosen on another page of the list, or under another filter.
   * It has no checkbox here, so it needs a hidden field or turning to page
   * two would silently empty the order. Ids that *are* on this page are left
   * to their checkbox — two fields with one name would reach the endpoint as
   * a duplicate and be refused by the row-count comparison.
   */
  const rendered = new Set(
    result.gestures.map((gesture) => String(gesture.id))
  );
  const offPage = selectedIds.filter((id) => !rendered.has(id));

  const count = selectedIds.length;
  const priceable = count >= 1 && count <= MAX_GESTURES_PER_SPONSORSHIP;

  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-col gap-2">
        <h1 className="font-bold text-foreground text-xxl">
          Sponsor een gebaar
        </h1>
        <p className="text-foreground-muted text-sm">
          {formatEuro(sponsorshipAmountCents(1, false))} per gebaar per jaar,
          met logo {formatEuro(sponsorshipAmountCents(1, true))}. Je kan
          hoogstens {MAX_GESTURES_PER_SPONSORSHIP} gebaren tegelijk kiezen.
        </p>
      </div>

      {message === undefined ? null : (
        <p
          className="rounded-md border border-danger bg-surface px-4 py-3 font-medium text-danger text-sm"
          data-testid="sponsor-error"
          role="alert"
        >
          {message}
        </p>
      )}

      <form
        action={`/${current}/sponsor`}
        className="flex flex-col gap-6"
        method="get"
      >
        <div className="flex flex-col gap-3">
          <label
            className="font-medium text-foreground text-sm"
            htmlFor="sponsor-search"
          >
            Zoek een gebaar
          </label>
          <div className="flex gap-2">
            <Input
              data-testid="sponsor-search"
              defaultValue={query.q}
              id="sponsor-search"
              name="q"
              type="search"
            />
            {/*
             * `formMethod="get"` and nothing else: this button re-submits the
             * form to this page, taking the ticked boxes with it, which is
             * how the selection survives a filter change.
             */}
            <Button
              data-testid="sponsor-filter"
              formMethod="get"
              type="submit"
              variant="secondary"
            >
              Filter
            </Button>
          </div>
          <fieldset className="flex flex-wrap gap-3">
            <legend className="font-medium text-foreground text-sm">
              Categorieen
            </legend>
            {categories.map((category) => (
              <label
                className="flex items-center gap-2 text-foreground text-sm"
                key={category.id}
              >
                <input
                  className="size-4 accent-primary"
                  defaultChecked={query.categories.includes(category.id)}
                  name="category"
                  type="checkbox"
                  value={category.id}
                />
                {category.name}
              </label>
            ))}
          </fieldset>
        </div>

        {offPage.map((id) => (
          <input key={id} name="gestureId" type="hidden" value={id} />
        ))}
        <input name="locale" type="hidden" value={current} />

        <SponsorGestureSelection
          gestures={available.map(toGestureSummary)}
          label="Beschikbare gebaren"
          selectedIds={selectedIds}
        />

        <div className="flex flex-wrap items-center justify-between gap-4 rounded-md border border-border bg-surface px-4 py-3">
          <p className="text-foreground text-sm" data-testid="sponsor-total">
            {count} gebaren gekozen
            {priceable
              ? ` — ${formatEuro(sponsorshipAmountCents(count, false))}, met logo ${formatEuro(sponsorshipAmountCents(count, true))}`
              : ""}
          </p>
          <Button
            data-testid="sponsor-continue"
            formAction="/sponsor/start"
            formMethod="post"
            type="submit"
          >
            Verder naar je gegevens
          </Button>
        </div>

        {result.totalPages <= 1 ? null : (
          <nav aria-label="Paginas" className="flex flex-wrap gap-2">
            {Array.from(
              { length: result.totalPages },
              (_, index) => index + 1
            ).map((page) => (
              <Button
                aria-current={page === result.page ? "page" : undefined}
                formMethod="get"
                key={page}
                name="page"
                size="sm"
                type="submit"
                value={String(page)}
                variant={page === result.page ? "primary" : "ghost"}
              >
                {page}
              </Button>
            ))}
          </nav>
        )}
      </form>

      {taken.length === 0 ? null : (
        <section className="flex flex-col gap-3">
          <h2 className="font-semibold text-foreground text-lg">
            Al gesponsord
          </h2>
          <p className="text-foreground-muted text-sm">
            Deze gebaren zijn al vergeven of wachten op een betaling.
          </p>
          <GestureGrid
            data-testid="sponsor-taken"
            gestures={taken.map(toGestureSummary)}
            label="Al gesponsorde gebaren"
          />
        </section>
      )}
    </div>
  );
}
