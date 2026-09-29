import { useAuthState } from "@smog/auth/react";
import { useTranslation } from "@smog/i18n/react";
import { Button, Text } from "@smog/ui-web";
import { createFileRoute, Link } from "@tanstack/react-router";
import type { ReactNode } from "react";
import { AuthCard } from "@/components/auth/auth-card";
import { pageMeta } from "@/lib/head";
import { validateAuthSearch } from "@/lib/redirect";

export const Route = createFileRoute("/verify-email")({
  component: VerifyEmail,
  head: ({ matches }) => pageMeta(matches, "auth.verifyEmail.title"),
  validateSearch: validateAuthSearch,
});

/**
 * Where the verification link lands: Better Auth has verified the address
 * and signed the user in (or appended `?error=` when the link was bad).
 */
function VerifyEmail(): ReactNode {
  const { t } = useTranslation();
  const { error, redirect } = Route.useSearch();
  const auth = useAuthState();

  if (error) {
    return (
      <AuthCard title={t("auth.verifyEmail.title")}>
        <Text role="alert" tone="danger">
          {t("auth.verifyEmail.invalid")}
        </Text>
        <Button asChild>
          <Link search={{}} to="/sign-in">
            {t("nav.signIn")}
          </Link>
        </Button>
      </AuthCard>
    );
  }
  return (
    <AuthCard title={t("auth.verifyEmail.title")}>
      <Text role="status">{t("auth.verifyEmail.success")}</Text>
      {auth.status === "signedIn" ? (
        <Button asChild>
          <a href={redirect ?? "/"}>{t("common.continue")}</a>
        </Button>
      ) : (
        <Button asChild>
          <Link search={redirect ? { redirect } : {}} to="/sign-in">
            {t("nav.signIn")}
          </Link>
        </Button>
      )}
    </AuthCard>
  );
}
