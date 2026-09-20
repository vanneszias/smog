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
 * **Task 4 kept it a nav and not a menu, on purpose.** The plan's Step 1 asks
 * for an account menu, and a menu needs somewhere to go: the account page is
 * Task 5's, and a disclosure widget wrapping one address and one button is
 * two keyboard interactions and an `aria-expanded` bought for nothing. What
 * Task 4 did add is the signed-in favorites path — which turned out to live
 * entirely in `FavoriteButton`, `FavoritesList` and `endpoints/favorites.ts`,
 * because the header's only input is still who you are. When Task 5 lands
 * `/{locale}/account`, this is where its link goes, and that is the point at
 * which a menu starts paying for itself.
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
        {/*
         * Truncated, with the whole address on `title`. Addresses run to
         * sixty characters and this sits in a `flex-wrap` header beside the
         * locale switcher; an untruncated one pushes the switcher onto a
         * second row. `max-w-*` plus `truncate` rather than a substring, so
         * the DOM still carries the real value — `tests/e2e/auth.spec.ts`
         * asserts on it, and a server-side ellipsis would mean asserting on
         * the ellipsis.
         *
         * `xs` is a *container*-scale name, not a spacing step, and that is
         * deliberate: a numeric max-width step the theme does not declare
         * compiles to `calc(var(--spacing) * n)` against Tailwind's own
         * multiplier rather than against a token this design system chose.
         * The first draft of this line used one, and the only thing that
         * caught it was `kitchen-sink.e2e.spec.ts`'s check of the compiled
         * stylesheet — the class-name guard beside it scans the kitchen-sink
         * route and nothing else.
         *
         * Note that naming the offending class in this comment is enough to
         * bring it back: Tailwind v4 scans source files as **text** and does
         * not skip comments, so a class written in prose is a class in the
         * stylesheet. That is how this comment failed the very test it is
         * describing.
         */}
        <span
          className="max-w-xs truncate text-foreground text-sm"
          data-testid="account-email"
          title={user.email}
        >
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
