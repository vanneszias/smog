import { Button, Card, EmptyState, Field, Input, Textarea } from "@smog/ui-web";
import type { Metadata } from "next";
import { notFound, redirect } from "next/navigation";
import { isLocale, resolveLocale } from "@/lib/locale";
import { fetchOwnedLists } from "@/lib/ownedLists";
import { getPayloadClient } from "@/lib/payloadClient";
import { readSession } from "@/lib/session";

export const metadata: Metadata = {
  description: "Beheer je eigen lijsten met gebaren.",
  title: "Mijn lijsten",
  /*
   * Nothing here belongs in an index, and a crawler that reached it would be
   * signed out anyway and index the sign-in page under this URL. `follow`
   * stays on so the links out of it still count, exactly as on `/account`.
   */
  robots: { follow: true, index: false },
};

/**
 * Rendered per request, never prerendered.
 *
 * `readSession` reads request headers, which already opts this page out —
 * but the parent layout's `generateStaticParams` makes Next *attempt* the
 * route during `next build`, and at build time `payload.config.ts` hands the
 * D1 adapter an inert placeholder, so a query from a prerender fails the
 * build rather than the request. Saying so is cheaper than rediscovering it.
 */
export const dynamic = "force-dynamic";

/** What each refusal is allowed to say. */
const ERRORS: Record<string, string> = {
  confirm:
    "De ingetypte naam komt niet overeen met die van de lijst. Er is niets verwijderd.",
  description: "Die omschrijving is te lang.",
  full: "Deze lijst zit vol. Haal er eerst een gebaar af.",
  gesture: "Dat gebaar bestaat niet meer, of is niet beschikbaar.",
  name: "Geef je lijst een naam van hoogstens 120 tekens.",
  /*
   * One sentence for "no such list" and "that list is not yours", because
   * `endpoints/lists.ts` produces both with one query and cannot tell them
   * apart by the time it answers. List ids are consecutive integers, so a
   * page that named the difference would be an id-existence oracle.
   */
  unknown: "Die lijst bestaat niet, of is niet van jou.",
  visibility: "Dat is geen geldige zichtbaarheid.",
};

const NOTICES: Record<string, string> = {
  added: "Het gebaar staat op je lijst.",
  created: "Je lijst is gemaakt.",
  deleted: "Je lijst is verwijderd.",
  removed: "Het gebaar staat niet meer op je lijst.",
  renamed: "Je lijst is aangepast.",
  shared: "Je lijst is gedeeld. Iedereen met de link kan hem bekijken.",
  unshared:
    "Je lijst staat weer op prive. De oude link werkt niet meer, ook niet voor wie hem al had.",
};

/**
 * The owner's index of their own lists.
 *
 * A Server Component reading Payload's Local API directly, like every other
 * page here. What keeps it honest is in `lib/ownedLists.ts`: the owner filter
 * is in the query and not left to `listReadAccess`, which returns `true` for
 * an administrator and would otherwise put every list in the database under
 * this heading.
 *
 * The locale check is repeated from the layout because `notFound()` in a
 * layout is caught by the boundary *above* it, so the two render different
 * pages.
 */
export default async function AccountListsPage({
  params,
  searchParams,
}: {
  params: Promise<{ locale: string }>;
  searchParams: Promise<{ error?: string; notice?: string }>;
}) {
  const { locale } = await params;

  if (!isLocale(locale)) {
    notFound();
  }

  const current = resolveLocale(locale);
  const user = await readSession();

  /*
   * A redirect and not a 404. The page exists; the visitor is not signed in —
   * and `next/navigation`'s `redirect` throws, so nothing below runs for a
   * signed-out reader. The endpoints answer a POST without a session the same
   * way, so the two halves of this surface agree.
   */
  if (user === null) {
    redirect(`/${current}/sign-in`);
  }

  const { error, notice } = await searchParams;
  const message = error === undefined ? undefined : ERRORS[error];
  const noticeMessage = notice === undefined ? undefined : NOTICES[notice];

  const lists = await fetchOwnedLists({
    locale: current,
    payload: await getPayloadClient(),
    user,
  });

  return (
    <div className="mx-auto flex w-full max-w-2xl flex-col gap-8">
      <div className="flex flex-col gap-2">
        <h1 className="font-bold text-foreground text-xxl">Mijn lijsten</h1>
        <p className="text-foreground-muted text-sm" data-testid="lists-count">
          {lists.length} lijsten
        </p>
      </div>

      {noticeMessage === undefined ? null : (
        <p
          className="rounded-md border border-border bg-surface px-4 py-3 text-foreground text-sm"
          data-testid="lists-notice"
        >
          {noticeMessage}
        </p>
      )}

      {message === undefined ? null : (
        /*
         * `role="alert"` because the visitor arrives here by redirect after a
         * form post: a fresh navigation, not a live-region update, so the
         * role is what gets the message announced rather than only seen.
         */
        <p
          className="rounded-md border border-danger bg-surface px-4 py-3 font-medium text-danger text-sm"
          data-testid="lists-error"
          role="alert"
        >
          {message}
        </p>
      )}

      <section className="flex flex-col gap-4">
        <h2 className="font-semibold text-foreground text-lg">
          Nieuwe lijst maken
        </h2>
        {/*
         * A plain form post, like every other write on this site. No
         * `"use client"`, no hydration, and it works with scripting off.
         */}
        <form
          action="/account/lists/create"
          className="flex flex-col gap-4"
          method="post"
        >
          <input name="locale" type="hidden" value={current} />
          <Field label="Naam">
            <Input
              data-testid="list-name"
              maxLength={120}
              name="name"
              required
              type="text"
            />
          </Field>
          <Field label="Omschrijving (optioneel)">
            <Textarea
              data-testid="list-description"
              maxLength={2000}
              name="description"
            />
          </Field>
          <Button data-testid="create-list" type="submit">
            Lijst maken
          </Button>
        </form>
      </section>

      <section className="flex flex-col gap-4">
        <h2 className="font-semibold text-foreground text-lg">Je lijsten</h2>
        {lists.length === 0 ? (
          <EmptyState
            data-testid="lists-empty"
            description="Maak er hierboven een en zet er gebaren op."
            title="Je hebt nog geen lijsten"
          />
        ) : (
          <ul className="flex flex-col gap-3" data-testid="lists">
            {lists.map((list) => (
              <li key={list.id}>
                <Card className="flex flex-col gap-1 p-4">
                  <a
                    className="font-medium text-foreground text-md underline underline-offset-2 hover:no-underline"
                    data-testid="list-link"
                    href={`/${current}/account/lists/${list.id}`}
                  >
                    {list.name}
                  </a>
                  <p className="text-foreground-muted text-sm">
                    {(list.items ?? []).length} gebaren —{" "}
                    {list.visibility === "shared" ? "gedeeld" : "prive"}
                  </p>
                </Card>
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}
