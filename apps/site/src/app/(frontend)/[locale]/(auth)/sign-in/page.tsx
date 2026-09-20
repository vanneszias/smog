import { Button, Field, Input } from "@smog/ui-web";
import type { Metadata } from "next";
import { notFound } from "next/navigation";
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
 * What sign-up redirects to, worded so it says nothing about the address.
 *
 * "If that address was still free" is not coyness; it is the requirement.
 * `endpoints/auth.ts` answers a taken address and a fresh one with the same
 * bytes, and a page that said "your account has been created" would undo that
 * in the only place the visitor actually reads.
 */
const REGISTERED_NOTICE =
  "Als dat e-mailadres nog vrij was, staat je account klaar. Meld je hieronder aan.";

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

  return (
    <div className="mx-auto flex w-full max-w-sm flex-col gap-6">
      <h1 className="font-bold text-foreground text-xxl">Aanmelden</h1>

      {notice === "registered" ? (
        <p
          className="rounded-md border border-border bg-surface px-4 py-3 text-foreground text-sm"
          data-testid="sign-in-notice"
        >
          {REGISTERED_NOTICE}
        </p>
      ) : null}

      {error === undefined ? null : (
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
          {SIGN_IN_ERROR}
        </p>
      )}

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
