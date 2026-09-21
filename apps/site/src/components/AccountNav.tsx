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
 * **Still a nav and not a menu, now that there is somewhere to go.** Task 4
 * deferred the plan's "account menu" on the grounds that a disclosure widget
 * wrapping one address and one button buys nothing, and said Task 5's
 * `/{locale}/account` would be the point at which a menu starts paying for
 * itself. It is not: the account page arrived, and the link to it is the
 * address, so the header still holds exactly two tab stops. A menu would add
 * an `aria-expanded`, an escape handler and a `"use client"` boundary to the
 * layout of every page in order to hide one of them. Revisit when there are
 * three or more destinations.
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
         *
         * The address *is* the link to the account page, rather than a
         * separate "Account" item beside it — so the header gains a
         * destination without gaining a tab stop.
         *
         * `inline-block` is load-bearing rather than decoration: `truncate`
         * sets `overflow: hidden` and a `max-width`, neither of which an
         * inline box obeys, so the same classes that truncated the old
         * `<span>` would let an `<a>` run the header onto a second row.
         */}
        <a
          className="inline-block max-w-xs truncate text-foreground text-sm underline hover:no-underline"
          data-testid="account-email"
          href={`/${locale}/account`}
          title={user.email}
        >
          {user.email}
        </a>
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
