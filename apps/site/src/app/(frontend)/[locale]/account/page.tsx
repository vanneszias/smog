import { Button, Field, Input } from "@smog/ui-web";
import type { Metadata } from "next";
import { notFound, redirect } from "next/navigation";
import { isLocale, resolveLocale } from "@/lib/locale";
import { readSession } from "@/lib/session";

export const metadata: Metadata = {
  description: "Beheer je SMOG-account.",
  title: "Account",
  /*
   * Nothing here belongs in an index, and a crawler that reached it would be
   * signed out anyway and index the sign-in page under this URL. `follow`
   * stays on so the links out of it still count, exactly as on `/sign-in`.
   */
  robots: { follow: true, index: false },
};

/**
 * What each refusal is allowed to say.
 *
 * `credentials` is one sentence for two outcomes — the password was wrong,
 * and the account is locked — because `endpoints/account.ts` deliberately
 * cannot tell them apart by the time it answers, for the same reason
 * `/sign-in` cannot. The second half of the sentence states the lockout rule
 * to everybody, which is the only way a genuinely locked visitor learns that
 * waiting fixes it without the page having a "you are locked" state to leak.
 */
const ERRORS: Record<string, string> = {
  confirm:
    "Het ingetypte e-mailadres komt niet overeen met dat van je account. Je account is niet verwijderd.",
  credentials:
    "Je huidige wachtwoord klopt niet. Na vijf mislukte pogingen wordt dit account tien minuten geblokkeerd — probeer het dan later opnieuw.",
  delete:
    "Je account kon niet verwijderd worden. Probeer het later opnieuw of neem contact op.",
  email: "Dat is geen geldig e-mailadres.",
  "email-unchanged": "Dat is het e-mailadres dat je al gebruikt.",
  password:
    "Je nieuwe wachtwoord is niet geaccepteerd: gebruik minstens 12 tekens en iets dat niet makkelijk te raden is.",
};

/**
 * The one notice this page shows, worded so it promises nothing it cannot
 * keep.
 *
 * It says a link *was made*, not that it *arrived*: no email adapter is
 * configured yet (Stage 7 does that), so today the link is written to the
 * server log and nothing lands in the inbox. Telling the visitor "check your
 * inbox" would be a lie the page cannot currently make true.
 */
const NOTICES: Record<string, string> = {
  "email-pending":
    "Je aanvraag staat klaar. Het e-mailadres verandert pas zodra de bevestigingslink op het nieuwe adres gebruikt is.",
};

export default async function AccountPage({
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
   * A redirect and not a 404. The page exists; the visitor is not signed in
   * — and `next/navigation`'s `redirect` throws, so nothing below runs for a
   * signed-out reader. The endpoints answer the same way for a POST without
   * a session, so the two halves of this page agree.
   */
  if (user === null) {
    redirect(`/${current}/sign-in`);
  }

  const { error, notice } = await searchParams;
  const message = error === undefined ? undefined : ERRORS[error];
  const noticeMessage = notice === undefined ? undefined : NOTICES[notice];
  const pendingEmail = user.pendingEmail;

  return (
    <div className="mx-auto flex w-full max-w-lg flex-col gap-8">
      <div className="flex flex-col gap-2">
        <h1 className="font-bold text-foreground text-xxl">Account</h1>
        {/*
         * `account-identity`, not `account-email`: the header's link to this
         * page already carries that test id, and two elements answering the
         * same `getByTestId` on the same page is a Playwright strict-mode
         * failure in every spec that lands here.
         */}
        <p
          className="text-foreground-muted text-sm"
          data-testid="account-identity"
        >
          Je bent aangemeld als {user.email}.
        </p>
      </div>

      {noticeMessage === undefined ? null : (
        <p
          className="rounded-md border border-border bg-surface px-4 py-3 text-foreground text-sm"
          data-testid="account-notice"
        >
          {noticeMessage}
        </p>
      )}

      {message === undefined ? null : (
        /*
         * `role="alert"` because the visitor arrives here by redirect after a
         * form post: this is a fresh navigation, not a live region update, so
         * the role is what gets the message announced rather than only seen.
         */
        <p
          className="rounded-md border border-danger bg-surface px-4 py-3 font-medium text-danger text-sm"
          data-testid="account-error"
          role="alert"
        >
          {message}
        </p>
      )}

      <section className="flex flex-col gap-4">
        <h2 className="font-semibold text-foreground text-lg">
          Wachtwoord wijzigen
        </h2>
        <p className="text-foreground-muted text-sm">
          Je wordt hierna op al je apparaten afgemeld en moet je opnieuw
          aanmelden.
        </p>
        {/*
         * A plain form post, like every other write on this site. No
         * `"use client"`, no hydration, and it works with scripting off —
         * see `endpoints/auth.ts` for the measurement behind that choice.
         */}
        <form
          action="/account/password"
          className="flex flex-col gap-4"
          method="post"
        >
          <input name="locale" type="hidden" value={current} />
          <Field label="Huidig wachtwoord">
            <Input
              autoComplete="current-password"
              data-testid="current-password"
              name="current"
              required
              type="password"
            />
          </Field>
          <Field help="Minstens 12 tekens." label="Nieuw wachtwoord">
            <Input
              autoComplete="new-password"
              data-testid="new-password"
              name="next"
              required
              type="password"
            />
          </Field>
          <Button data-testid="change-password" type="submit">
            Wachtwoord wijzigen
          </Button>
        </form>
      </section>

      <section className="flex flex-col gap-4">
        <h2 className="font-semibold text-foreground text-lg">
          E-mailadres wijzigen
        </h2>
        {pendingEmail ? (
          /*
           * Shown because a change that is waiting somewhere invisible is a
           * change the visitor cannot reason about — "did I do that?" is the
           * question a pending address change has to be able to answer.
           */
          <p
            className="rounded-md border border-border bg-surface px-4 py-3 text-foreground text-sm"
            data-testid="pending-email"
          >
            Er staat een wijziging klaar naar {pendingEmail}. Die gaat pas in
            zodra de bevestigingslink op dat adres gebruikt is.
          </p>
        ) : null}
        <p className="text-foreground-muted text-sm">
          Je adres verandert pas nadat je de wijziging op het nieuwe adres
          bevestigd hebt.
        </p>
        <form
          action="/account/email"
          className="flex flex-col gap-4"
          method="post"
        >
          <input name="locale" type="hidden" value={current} />
          <Field label="Nieuw e-mailadres">
            <Input
              autoComplete="email"
              data-testid="new-email"
              name="email"
              required
              type="email"
            />
          </Field>
          <Field label="Huidig wachtwoord">
            <Input
              autoComplete="current-password"
              data-testid="email-current-password"
              name="current"
              required
              type="password"
            />
          </Field>
          <Button data-testid="change-email" type="submit" variant="secondary">
            Wijziging aanvragen
          </Button>
        </form>
      </section>

      <section className="flex flex-col gap-4">
        <h2 className="font-semibold text-danger text-lg">
          Account verwijderen
        </h2>
        <p className="text-foreground-muted text-sm">
          Je account en je lijsten worden verwijderd. Dit kan niet ongedaan
          gemaakt worden.
        </p>
        {/*
         * Typing the address, not a `confirm()`. A modal dialog needs
         * JavaScript, disappears on a reload, is skipped by anybody who
         * clicks through dialogs by reflex, and is invisible to a keyboard
         * user who has already pressed Enter. A text input that has to match
         * the account's own address is none of those things — and the check
         * is on the server, so a page with the input removed is refused just
         * the same.
         */}
        <form
          action="/account/delete"
          className="flex flex-col gap-4"
          method="post"
        >
          <input name="locale" type="hidden" value={current} />
          <Field
            help={`Typ ${user.email} om te bevestigen.`}
            label="Bevestig met je e-mailadres"
          >
            <Input
              autoComplete="off"
              data-testid="delete-confirm"
              name="confirmEmail"
              required
              type="email"
            />
          </Field>
          <Button data-testid="delete-account" type="submit" variant="danger">
            Account definitief verwijderen
          </Button>
        </form>
      </section>
    </div>
  );
}
