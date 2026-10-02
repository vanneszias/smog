import { MAGIC_LINK_TOKEN_PATTERN } from "@smog/auth/react";
import { useTranslation } from "@smog/i18n/react";
import { Button, Text } from "@smog/ui-web";
import { createFileRoute, Link } from "@tanstack/react-router";
import type { ReactNode } from "react";
import { AuthCard } from "@/components/auth/auth-card";
import { pageMeta } from "@/lib/head";

export interface AppLinkSearch {
  token: string | null;
}

/**
 * Only a well-formed token. `null` (not a missing key) for anything else:
 * the root route passes the raw params through, so an omitted key would
 * keep the raw value.
 */
function validateSearch(search: Record<string, unknown>): AppLinkSearch {
  const { token } = search;
  return {
    token:
      typeof token === "string" && MAGIC_LINK_TOKEN_PATTERN.test(token)
        ? token
        : null,
  };
}

/**
 * Better Auth's verify endpoint for this token, with fixed same-site
 * callbacks (home, or the invalid-link page), so the link redirects
 * nowhere else.
 */
function browserSignInHref(token: string): string {
  const query = new URLSearchParams({
    callbackURL: "/",
    errorCallbackURL: "/magic-link",
    token,
  });
  return `/api/auth/magic-link/verify?${query.toString()}`;
}

/**
 * `/magic-link/app?token=…`: the magic link the app asked for. With the
 * app installed, the OS opens it in the app (a universal / app link) and
 * the app exchanges the token. Here, in a browser, the page says so and
 * offers to sign in in this browser instead (the token is single-use).
 */
export const Route = createFileRoute("/magic-link_/app")({
  component: AppMagicLink,
  head: ({ matches }) => pageMeta(matches, "auth.magicLink.appTitle"),
  validateSearch,
});

function AppMagicLink(): ReactNode {
  const { t } = useTranslation();
  const { token } = Route.useSearch();
  if (!token) {
    return (
      <AuthCard title={t("auth.magicLink.appTitle")}>
        <Text role="alert" tone="danger">
          {t("auth.errors.linkInvalid")}
        </Text>
        <Button asChild>
          <Link to="/sign-in">{t("auth.magicLink.resend")}</Link>
        </Button>
      </AuthCard>
    );
  }
  return (
    <AuthCard
      description={t("auth.magicLink.appDescription")}
      title={t("auth.magicLink.appTitle")}
    >
      <Button asChild>
        {/* A full navigation: the endpoint sets the cookie and redirects. */}
        <a href={browserSignInHref(token)} rel="nofollow">
          {t("auth.magicLink.continueInBrowser")}
        </a>
      </Button>
    </AuthCard>
  );
}
