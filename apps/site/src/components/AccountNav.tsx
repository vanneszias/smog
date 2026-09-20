import { Button } from "@smog/ui-web";
import type { Locale } from "@/lib/locale";
import type { User } from "@/payload-types";

/**
 * The header's account corner: who you are, or how to become somebody.
 *
 * **It takes the user as a prop rather than reading the session itself.**
 * The layout does the reading, once, so this component is a pure function of
 * its arguments and `AccountNav.test.tsx` can render both states without a
 * database, a request or a mock of `next/headers`.
 *
 * **Sign-out is a form and not a link.** A `GET /auth/sign-out` is a URL any
 * page can embed in an `<img>`, which signs the visitor out from anywhere on
 * the internet; it is also something a link prefetcher or a crawler will
 * follow on its own. A POST is neither, and Payload's `SameSite=Lax` cookie
 * is not sent on a cross-site POST, so the session cookie the endpoint needs
 * simply is not there for an attacker's form.
 *
 * Stage 4 Task 4 owns this component's fuller version — an account menu, the
 * signed-in favorites path. It exists already because Review Focus item 1 is
 * Task 2's to prove: "a session established under /nl is honoured under /en"
 * needs something on the page that changes when the session is lost.
 */
export function AccountNav({
  locale,
  user,
}: {
  locale: Locale;
  user: null | User;
}) {
  if (user === null) {
    return (
      <nav aria-label="Account" data-testid="account-nav">
        <ul className="flex items-center gap-4">
          <li>
            <a
              className="text-foreground-muted text-sm hover:text-foreground"
              data-testid="sign-in-link"
              href={`/${locale}/sign-in`}
            >
              Aanmelden
            </a>
          </li>
          <li>
            <a
              className="text-foreground-muted text-sm hover:text-foreground"
              data-testid="sign-up-link"
              href={`/${locale}/sign-up`}
            >
              Registreren
            </a>
          </li>
        </ul>
      </nav>
    );
  }

  return (
    <nav aria-label="Account" data-testid="account-nav">
      <div className="flex items-center gap-3">
        <span className="text-foreground text-sm" data-testid="account-email">
          {user.email}
        </span>
        {/*
         * The locale travels in the body rather than in the action URL so the
         * endpoint has one path, and so the value cannot be smuggled in by a
         * link. `resolveLocale` clamps whatever arrives to one of the three
         * known locales, which is what keeps this out of open-redirect
         * territory.
         */}
        <form action="/auth/sign-out" method="post">
          <input name="locale" type="hidden" value={locale} />
          <Button
            data-testid="sign-out"
            size="sm"
            type="submit"
            variant="secondary"
          >
            Afmelden
          </Button>
        </form>
      </div>
    </nav>
  );
}
