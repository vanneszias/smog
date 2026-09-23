import { Button } from "@smog/ui-web";
import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { isLocale, resolveLocale } from "@/lib/locale";

export const metadata: Metadata = {
  description: "Bevestig de wijziging van je e-mailadres.",
  title: "E-mailadres bevestigen",
  /*
   * `index: false` **and** `follow: false`, which no other page in this app
   * sets. The URL a visitor reaches this at carries a confirmation token in
   * its query string; a crawler that indexed it would publish the token, and
   * one that followed links from it would carry it in a `Referer`. It is the
   * one page here where following is as harmful as indexing.
   */
  robots: { follow: false, index: false },
};

/**
 * The page a confirmation link lands on.
 *
 * ## Why a page and a button, and not the link itself
 *
 * Moving an address is a state change, and a GET that changes state is a
 * state change anything can trigger: a link prefetcher, a browser's
 * speculative load, an `<img src>` on a page the visitor has open — and,
 * most concretely, the corporate mail scanners that visit every URL in every
 * message before the recipient sees it. The mail links here; the page posts
 * to `/account/confirm-email`, which is behind the same `Origin` check as
 * every other write in this app.
 *
 * ## Why it does not require a session
 *
 * The token is the capability, and the person holding it is the person who
 * read the mail at the new address — which is exactly the fact being proved.
 * Requiring a session as well would mean the link only worked in the browser
 * the change was started from, which is not usually where mail is read.
 *
 * ## Why it shows nothing about the account
 *
 * Not the address, not who asked, not whether the token is any good. The
 * page is reachable by anybody who has a URL, and every one of those would
 * be something the URL's holder learns for free. The token is checked when
 * the button is pressed, and the endpoint answers in one of exactly two
 * ways.
 */
export default async function ConfirmEmailPage({
  params,
  searchParams,
}: {
  params: Promise<{ locale: string }>;
  searchParams: Promise<{ error?: string; token?: string }>;
}) {
  const { locale } = await params;

  if (!isLocale(locale)) {
    notFound();
  }

  const current = resolveLocale(locale);
  const { error, token } = await searchParams;

  return (
    <div className="mx-auto flex w-full max-w-sm flex-col gap-6">
      <h1 className="font-bold text-foreground text-xxl">
        E-mailadres bevestigen
      </h1>

      {error === undefined ? null : (
        <p
          className="rounded-md border border-danger bg-surface px-4 py-3 font-medium text-danger text-sm"
          data-testid="confirm-email-error"
          role="alert"
        >
          Deze link werkt niet meer. Vraag de wijziging opnieuw aan vanaf je
          accountpagina.
        </p>
      )}

      {token === undefined || token === "" ? null : (
        <form
          action="/account/confirm-email"
          className="flex flex-col gap-4"
          method="post"
        >
          <input name="locale" type="hidden" value={current} />
          {/*
           * The token travels in the body rather than staying in the URL of
           * the POST, so it is not written into a server access log or an
           * analytics path the way a query string is.
           */}
          <input name="token" type="hidden" value={token} />
          <p className="text-foreground-muted text-sm">
            Bevestig hieronder dat dit e-mailadres van jou is. Daarna meld je je
            met het nieuwe adres aan.
          </p>
          <Button data-testid="confirm-email" type="submit">
            Bevestigen
          </Button>
        </form>
      )}

      <p className="text-foreground-muted text-sm">
        <a
          className="underline hover:no-underline"
          href={`/${current}/account`}
        >
          Naar je account
        </a>
      </p>
    </div>
  );
}
