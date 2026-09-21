import { Button, Field, Input } from "@smog/ui-web";
import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { resolveProvider } from "@/auth/oauthProvider";
import { isLocale, resolveLocale } from "@/lib/locale";

export const metadata: Metadata = {
  description: "Meld je aan op je SMOG-account.",
  title: "Aanmelden",
  // A sign-in form has nothing to index and every reason not to be a search
  // result; `follow` stays on so the links out of it still count.
  robots: { follow: true, index: false },
};

/**
 * The one thing a failed sign-in is allowed to say.
 *
 * It is one sentence for four different refusals — unknown address, wrong
 * password, locked account with the wrong password, and locked account with
 * the correct one — because `endpoints/auth.ts` deliberately cannot tell
 * them apart by the time it answers. See the comment there: Payload's
 * `LockedAuth` message proves an address is registered, since an address that
 * was never registered can never lock.
 *
 * **The second sentence is the price of that, paid in public.** Flattening
 * the message means a genuinely locked visitor is told only "that is wrong",
 * with nothing to suggest that waiting fixes it — they would keep trying,
 * extending the lock, and conclude the site is broken. So the lockout rule is
 * stated to *everybody* who fails, which is true for the locked visitor,
 * harmless for the one who mistyped, and worth nothing to somebody probing
 * for valid addresses, because it is shown for every failure whether or not
 * the address exists. The alternative — a "your account is locked" state —
 * is the leak itself.
 */
const SIGN_IN_ERROR =
  "E-mailadres of wachtwoord klopt niet. Na vijf mislukte pogingen wordt aanmelden voor dit account tien minuten geblokkeerd — probeer het dan later opnieuw.";

/**
 * What each OAuth refusal is allowed to say.
 *
 * `oauth` is one sentence for every way the flow can fail — a forged,
 * missing or replayed `state`, a provider error, an unverifiable ID token, a
 * mismatched nonce — for the same reason the password error is one sentence:
 * none of those distinctions helps the visitor and some of them help a
 * prober.
 *
 * `oauth-unverified` is the exception, and it is safe to be specific about
 * because it is a fact about the visitor's **Google** account, not about this
 * site. `endpoints/oauth.ts` returns it identically whether or not an account
 * exists here — there is no database query on that path at all — so it
 * cannot be used to ask whether an address is registered.
 */
const OAUTH_ERRORS: Record<string, string> = {
  oauth:
    "Aanmelden met Google is niet gelukt. Probeer het opnieuw of meld je aan met een wachtwoord.",
  "oauth-unavailable":
    "Aanmelden met Google is op dit moment niet beschikbaar. Meld je aan met een wachtwoord.",
  "oauth-unverified":
    "Google heeft dit e-mailadres niet bevestigd. Bevestig het bij Google en probeer het opnieuw, of meld je aan met een wachtwoord.",
};

/**
 * The notices this page can be sent back with.
 *
 * Three of the four arrive from the account endpoints, which land here rather
 * than on the account page because every one of them ends the session or
 * changes the address it is held under — so the account page would have
 * bounced the visitor straight here anyway, with the message lost on the way.
 */
const NOTICES: Record<string, string> = {
  deleted:
    "Je account en je lijsten zijn verwijderd. Bedankt voor het gebruiken van SMOG.",
  "email-changed":
    "Je e-mailadres is gewijzigd. Meld je hieronder aan met je nieuwe adres.",
  "password-changed":
    "Je wachtwoord is gewijzigd en je bent op al je apparaten afgemeld. Meld je hieronder opnieuw aan.",
  /*
   * "If that address was still free" is not coyness; it is the requirement.
   * `endpoints/auth.ts` answers a taken address and a fresh one with the same
   * bytes, and a page that said "your account has been created" would undo
   * that in the only place the visitor actually reads.
   */
  registered:
    "Als dat e-mailadres nog vrij was, staat je account klaar. Meld je hieronder aan.",
};

export default async function SignInPage({
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

  const { error, notice } = await searchParams;
  const current = resolveLocale(locale);
  const message =
    error === undefined ? null : (OAUTH_ERRORS[error] ?? SIGN_IN_ERROR);
  const noticeMessage = notice === undefined ? undefined : NOTICES[notice];

  /*
   * The button is shown only when the provider is actually configured.
   * `resolveProvider` reads the environment and nothing else — no Payload,
   * no database — so asking here costs a property lookup, and it means a
   * deployment without Google credentials does not offer a button that can
   * only answer `?error=oauth-unavailable`.
   */
  const googleConfigured = resolveProvider("google") !== null;

  return (
    <div className="mx-auto flex w-full max-w-sm flex-col gap-6">
      <h1 className="font-bold text-foreground text-xxl">Aanmelden</h1>

      {noticeMessage === undefined ? null : (
        <p
          className="rounded-md border border-border bg-surface px-4 py-3 text-foreground text-sm"
          data-testid="sign-in-notice"
        >
          {noticeMessage}
        </p>
      )}

      {message === null ? null : (
        /*
         * `role="alert"` so the message is announced when the visitor is
         * bounced back here, and not only seen. This page is a fresh
         * navigation rather than a live region update, so the role is what
         * carries it.
         */
        <p
          className="rounded-md border border-danger bg-surface px-4 py-3 font-medium text-danger text-sm"
          data-testid="sign-in-error"
          role="alert"
        >
          {message}
        </p>
      )}

      {googleConfigured ? (
        /*
         * A link, not a form. The start endpoint is a `GET` because it has
         * no side effect the visitor can be tricked into: it mints a fresh
         * `state`, writes it to the visitor's own cookie and redirects. The
         * worst a third party can do by pointing a browser at it is discard
         * a flow that visitor had not started.
         */
        <a
          className="flex items-center justify-center rounded-md border border-border bg-surface px-4 py-2 font-medium text-foreground text-sm hover:bg-surface-hover"
          data-testid="sign-in-google"
          href={`/auth/google?locale=${current}`}
          rel="nofollow"
        >
          Aanmelden met Google
        </a>
      ) : null}

      {/*
       * A plain form post to a Payload endpoint. No `"use client"`, no
       * hydration, no Server Action — see `endpoints/auth.ts` for why, and
       * the task report for the bundle measurement that settled it.
       */}
      <form
        action="/auth/sign-in"
        className="flex flex-col gap-4"
        method="post"
      >
        <input name="locale" type="hidden" value={current} />
        <Field label="E-mailadres">
          <Input
            autoComplete="email"
            data-testid="email"
            name="email"
            required
            type="email"
          />
        </Field>
        <Field label="Wachtwoord">
          <Input
            autoComplete="current-password"
            data-testid="password"
            name="password"
            required
            type="password"
          />
        </Field>
        <Button data-testid="submit" type="submit">
          Aanmelden
        </Button>
      </form>

      <p className="text-foreground-muted text-sm">
        Nog geen account?{" "}
        <a
          className="underline hover:no-underline"
          href={`/${current}/sign-up`}
        >
          Registreren
        </a>
      </p>
    </div>
  );
}
