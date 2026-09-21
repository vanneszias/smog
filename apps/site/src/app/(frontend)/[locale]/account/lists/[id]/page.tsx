import { Button, Card, EmptyState, Field, Input, Textarea } from "@smog/ui-web";
import type { Metadata } from "next";
import { notFound, redirect } from "next/navigation";
import { resolveRelationshipId } from "@/collections/Lists";
import { fetchGestures } from "@/lib/gestureQuery";
import { isLocale, type Locale, resolveLocale } from "@/lib/locale";
import { fetchOwnedList, MAX_LIST_ITEMS } from "@/lib/ownedLists";
import { getPayloadClient } from "@/lib/payloadClient";
import { searchGestureIds } from "@/lib/search";
import { readSession } from "@/lib/session";
import type { Gesture, List } from "@/payload-types";

export const metadata: Metadata = {
  description: "Beheer een van je eigen lijsten.",
  title: "Lijst",
  robots: { follow: true, index: false },
};

/**
 * Rendered per request, never prerendered — same reasoning as the index one
 * segment up, plus that this route has no `generateStaticParams` of its own
 * while its grandparent layout does.
 */
export const dynamic = "force-dynamic";

/** How many search results the "add a gesture" box offers at once. */
const SEARCH_RESULTS = 12;

const ERRORS: Record<string, string> = {
  confirm:
    "De ingetypte naam komt niet overeen met die van de lijst. Er is niets verwijderd.",
  description: "Die omschrijving is te lang.",
  full: `Deze lijst zit vol: er passen ${MAX_LIST_ITEMS} gebaren op. Haal er eerst een af.`,
  gesture: "Dat gebaar bestaat niet meer, of is niet beschikbaar.",
  name: "Geef je lijst een naam van hoogstens 120 tekens.",
  unknown: "Die lijst bestaat niet, of is niet van jou.",
  visibility: "Dat is geen geldige zichtbaarheid.",
};

const NOTICES: Record<string, string> = {
  added: "Het gebaar staat op je lijst.",
  created: "Je lijst is gemaakt. Zet er nu gebaren op.",
  removed: "Het gebaar staat niet meer op je lijst.",
  renamed: "Je lijst is aangepast.",
  shared: "Je lijst is gedeeld. Iedereen met de link kan hem bekijken.",
  unshared:
    "Je lijst staat weer op prive. De oude link werkt niet meer, ook niet voor wie hem al had.",
};

/** The gesture ids on a list, whether or not each one populated. */
function listGestureIds(list: List): string[] {
  return (list.items ?? []).map((item) =>
    String(resolveRelationshipId(item.gesture))
  );
}

/**
 * The gestures the "add" box offers for a query.
 *
 * Read anonymously, exactly as `/{locale}/gestures` reads them, so what can
 * be offered here is what `endpoints/lists.ts` will accept: both run
 * `overrideAccess: false`, so `publicReadActive` keeps a deactivated gesture
 * out of the results and out of the list. Offering something the write would
 * refuse is the failure this symmetry avoids.
 */
async function searchForAdding(
  query: string,
  locale: Locale
): Promise<Gesture[]> {
  const trimmed = query.trim();

  /*
   * No query, no database. `?q=` is what a cleared search box leaves behind,
   * and `searchGestureIds` answers `[]` for it — which as a `searchIds` would
   * mean "matched nothing" rather than "was not asked".
   */
  if (trimmed === "") {
    return [];
  }

  const searchIds = await searchGestureIds(trimmed, locale);
  const { gestures } = await fetchGestures({
    locale,
    page: 1,
    q: trimmed,
    searchIds,
  });

  return gestures.slice(0, SEARCH_RESULTS);
}

/**
 * One of the owner's own lists, with everything they can do to it.
 *
 * Every control is a `<form method="post">` at a `next.config.ts` rewrite, so
 * the page ships no client JavaScript and each action survives a reload and a
 * script blocker. The authorisation is `lib/ownedLists.ts`'s, which is the
 * same resolve the endpoints use — a list this page will not show is a list
 * they will not write.
 *
 * **A list that is not yours is a 404, not a redirect and not a 403.** The
 * page cannot say "this belongs to someone else" without confirming that the
 * id names a real list, and list ids are consecutive integers.
 */
export default async function AccountListPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string; locale: string }>;
  searchParams: Promise<{ error?: string; notice?: string; q?: string }>;
}) {
  const { id, locale } = await params;

  if (!isLocale(locale)) {
    notFound();
  }

  const current = resolveLocale(locale);
  const user = await readSession();

  if (user === null) {
    redirect(`/${current}/sign-in`);
  }

  const list = await fetchOwnedList({
    depth: 1,
    id,
    locale: current,
    payload: await getPayloadClient(),
    user,
  });

  if (list === null) {
    notFound();
  }

  const { error, notice, q } = await searchParams;
  const message = error === undefined ? undefined : ERRORS[error];
  const noticeMessage = notice === undefined ? undefined : NOTICES[notice];
  const query = q ?? "";
  const results = await searchForAdding(query, current);
  const onList = new Set(listGestureIds(list));
  const items = list.items ?? [];
  const shared = list.visibility === "shared";

  return (
    <div className="mx-auto flex w-full max-w-2xl flex-col gap-8">
      <div className="flex flex-col gap-2">
        <p className="text-foreground-muted text-sm">
          <a
            className="underline underline-offset-2 hover:no-underline"
            href={`/${current}/account/lists`}
          >
            Mijn lijsten
          </a>
        </p>
        <h1
          className="font-bold text-foreground text-xxl"
          data-testid="list-title"
        >
          {list.name}
        </h1>
        <p className="text-foreground-muted text-sm" data-testid="list-count">
          {items.length} gebaren — {shared ? "gedeeld" : "prive"}
        </p>
      </div>

      {noticeMessage === undefined ? null : (
        <p
          className="rounded-md border border-border bg-surface px-4 py-3 text-foreground text-sm"
          data-testid="list-notice"
        >
          {noticeMessage}
        </p>
      )}

      {message === undefined ? null : (
        <p
          className="rounded-md border border-danger bg-surface px-4 py-3 font-medium text-danger text-sm"
          data-testid="list-error"
          role="alert"
        >
          {message}
        </p>
      )}

      <section className="flex flex-col gap-4">
        <h2 className="font-semibold text-foreground text-lg">
          Gebaren op deze lijst
        </h2>
        {items.length === 0 ? (
          <EmptyState
            data-testid="list-empty"
            description="Zoek hieronder een gebaar en zet het erop."
            title="Deze lijst is nog leeg"
          />
        ) : (
          <ul className="flex flex-col gap-2" data-testid="list-items">
            {items.map((item) => {
              const gestureId = String(resolveRelationshipId(item.gesture));
              const gesture =
                typeof item.gesture === "object" ? item.gesture : null;

              return (
                <li key={item.id ?? gestureId}>
                  <Card className="flex items-center justify-between gap-4 p-3">
                    {/*
                     * A row whose gesture did not populate is rendered rather
                     * than dropped. At `depth: 1` that means `publicReadActive`
                     * refused it — an editor deactivated the gesture after it
                     * was put on the list — and the owner is exactly the person
                     * who needs to see that the row is there and be able to
                     * take it off. The public share page drops such rows; this
                     * one cannot, or they would be unremovable.
                     */}
                    {gesture === null ? (
                      <span
                        className="text-foreground-muted text-sm"
                        data-testid="list-item-unavailable"
                      >
                        Dit gebaar is niet meer beschikbaar.
                      </span>
                    ) : (
                      <a
                        className="text-foreground text-md underline underline-offset-2 hover:no-underline"
                        data-testid="list-item"
                        href={`/${current}/gestures/${gesture.id}`}
                      >
                        {gesture.name ?? ""}
                      </a>
                    )}
                    <form action="/account/lists/remove" method="post">
                      <input name="locale" type="hidden" value={current} />
                      <input name="id" type="hidden" value={list.id} />
                      <input name="gestureId" type="hidden" value={gestureId} />
                      <Button
                        data-testid="remove-gesture"
                        size="sm"
                        type="submit"
                        variant="secondary"
                      >
                        Verwijderen
                      </Button>
                    </form>
                  </Card>
                </li>
              );
            })}
          </ul>
        )}
      </section>

      <section className="flex flex-col gap-4">
        <h2 className="font-semibold text-foreground text-lg">
          Gebaar toevoegen
        </h2>
        {/*
         * A GET form, so the search is a URL: it can be reloaded, shared and
         * gone back to, and it changes nothing on the server. Only the add
         * buttons below are POSTs.
         */}
        <form className="flex items-end gap-3" method="get">
          <Field className="flex-1" label="Zoek een gebaar">
            <Input
              data-testid="list-search"
              defaultValue={query}
              name="q"
              type="search"
            />
          </Field>
          <Button
            data-testid="list-search-submit"
            type="submit"
            variant="secondary"
          >
            Zoeken
          </Button>
        </form>

        {query.trim() === "" ? null : (
          <ul className="flex flex-col gap-2" data-testid="list-search-results">
            {results.length === 0 ? (
              <li
                className="text-foreground-muted text-sm"
                data-testid="list-search-empty"
              >
                Geen gebaren gevonden voor "{query}".
              </li>
            ) : null}
            {results.map((gesture) => (
              <li key={gesture.id}>
                <Card className="flex items-center justify-between gap-4 p-3">
                  <span className="text-foreground text-md">
                    {gesture.name ?? ""}
                  </span>
                  {onList.has(String(gesture.id)) ? (
                    <span
                      className="text-foreground-muted text-sm"
                      data-testid="already-on-list"
                    >
                      Staat er al op
                    </span>
                  ) : (
                    <form action="/account/lists/add" method="post">
                      <input name="locale" type="hidden" value={current} />
                      <input name="id" type="hidden" value={list.id} />
                      <input
                        name="gestureId"
                        type="hidden"
                        value={gesture.id}
                      />
                      <Button data-testid="add-gesture" size="sm" type="submit">
                        Toevoegen
                      </Button>
                    </form>
                  )}
                </Card>
              </li>
            ))}
          </ul>
        )}
      </section>

      <section className="flex flex-col gap-4">
        <h2 className="font-semibold text-foreground text-lg">
          Naam en omschrijving
        </h2>
        <form
          action="/account/lists/rename"
          className="flex flex-col gap-4"
          method="post"
        >
          <input name="locale" type="hidden" value={current} />
          <input name="id" type="hidden" value={list.id} />
          <Field label="Naam">
            <Input
              data-testid="rename-name"
              defaultValue={list.name}
              maxLength={120}
              name="name"
              required
              type="text"
            />
          </Field>
          <Field label="Omschrijving (optioneel)">
            <Textarea
              data-testid="rename-description"
              defaultValue={list.description ?? ""}
              maxLength={2000}
              name="description"
            />
          </Field>
          <Button data-testid="rename-list" type="submit" variant="secondary">
            Opslaan
          </Button>
        </form>
      </section>

      <section className="flex flex-col gap-4">
        <h2 className="font-semibold text-foreground text-lg">Delen</h2>
        {shared ? (
          <>
            <p className="text-foreground-muted text-sm">
              Iedereen met deze link kan de lijst bekijken, zolang hij gedeeld
              staat.
            </p>
            {/*
             * The link is shown as text rather than only as an anchor: it has
             * to be copyable, and there is no JavaScript here to copy it with.
             */}
            <p
              className="break-all rounded-md border border-border bg-surface px-4 py-3 text-foreground text-sm"
              data-testid="share-link"
            >
              /{current}/lists/{list.viewShareToken}
            </p>
            <form action="/account/lists/share" method="post">
              <input name="locale" type="hidden" value={current} />
              <input name="id" type="hidden" value={list.id} />
              <input name="visibility" type="hidden" value="private" />
              <Button
                data-testid="unshare-list"
                type="submit"
                variant="secondary"
              >
                Niet meer delen
              </Button>
            </form>
          </>
        ) : (
          <>
            <p className="text-foreground-muted text-sm">
              Deze lijst is prive. Deel hem en je krijgt een link die je kunt
              doorsturen.
            </p>
            <form action="/account/lists/share" method="post">
              <input name="locale" type="hidden" value={current} />
              <input name="id" type="hidden" value={list.id} />
              <input name="visibility" type="hidden" value="shared" />
              <Button data-testid="share-list" type="submit">
                Lijst delen
              </Button>
            </form>
          </>
        )}
      </section>

      <section className="flex flex-col gap-4">
        <h2 className="font-semibold text-danger text-lg">Lijst verwijderen</h2>
        <p className="text-foreground-muted text-sm">
          De lijst en alles wat erop staat verdwijnen. Dit kan niet ongedaan
          gemaakt worden.
        </p>
        {/*
         * Typing the name, not a `confirm()` — the same control and the same
         * reasoning as the account page's delete box, and it is checked on the
         * server, so a page with the input removed is refused just the same.
         */}
        <form
          action="/account/lists/delete"
          className="flex flex-col gap-4"
          method="post"
        >
          <input name="locale" type="hidden" value={current} />
          <input name="id" type="hidden" value={list.id} />
          <Field
            help={`Typ ${list.name} om te bevestigen.`}
            label="Bevestig met de naam van de lijst"
          >
            <Input
              autoComplete="off"
              data-testid="delete-confirm-name"
              name="confirmName"
              required
              type="text"
            />
          </Field>
          <Button data-testid="delete-list" type="submit" variant="danger">
            Lijst definitief verwijderen
          </Button>
        </form>
      </section>
    </div>
  );
}
