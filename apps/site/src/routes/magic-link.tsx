import { useTranslation } from "@smog/i18n/react";
import { Button, Text } from "@smog/ui-web";
import { createFileRoute, Link, redirect } from "@tanstack/react-router";
import { Link2Off } from "lucide-react";
import type { ReactNode } from "react";
import { AuthPage } from "@/components/auth/auth-page";
import { pageMeta } from "@/lib/head";
import { validateAuthSearch } from "@/lib/redirect";

export const Route = createFileRoute("/magic-link")({
  // A good link lands on its callback URL; only a failed one comes here.
  beforeLoad: ({ search }) => {
    if (!search.error) {
      throw redirect({ href: search.redirect ?? "/" });
    }
  },
  component: MagicLink,
  head: ({ matches }) => pageMeta(matches, "auth.magicLink.title"),
  staticData: { authShell: true },
  validateSearch: validateAuthSearch,
});

function MagicLink(): ReactNode {
  const { t } = useTranslation();
  const { redirect: target } = Route.useSearch();
  return (
    <AuthPage
      icon={<Link2Off />}
      title={t("auth.magicLink.title")}
      tone="danger"
    >
      <Text role="alert" tone="danger">
        {t("auth.errors.linkInvalid")}
      </Text>
      <Button asChild>
        <Link search={target ? { redirect: target } : {}} to="/sign-in">
          {t("auth.magicLink.resend")}
        </Link>
      </Button>
    </AuthPage>
  );
}
