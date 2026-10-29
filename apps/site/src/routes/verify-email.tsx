import { useAuthState } from "@smog/auth/react";
import { useTranslation } from "@smog/i18n/react";
import { Button, Text } from "@smog/ui-web";
import { createFileRoute, Link, useRouter } from "@tanstack/react-router";
import { CircleCheck, Link2Off } from "lucide-react";
import { type ReactNode, useCallback } from "react";
import { AuthPage } from "@/components/auth/auth-page";
import { pageMeta } from "@/lib/head";
import { validateAuthSearch } from "@/lib/redirect";

export const Route = createFileRoute("/verify-email")({
  component: VerifyEmail,
  head: ({ matches }) => pageMeta(matches, "auth.verifyEmail.title"),
  staticData: { authShell: true },
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
  const router = useRouter();
  // The router navigates same-site only (a second layer to safeRedirect).
  const continueOn = useCallback(() => {
    router.navigate({ href: redirect ?? "/" });
  }, [redirect, router]);

  if (error) {
    return (
      <AuthPage
        icon={<Link2Off />}
        title={t("auth.verifyEmail.title")}
        tone="danger"
      >
        <Text role="alert" tone="danger">
          {t("auth.verifyEmail.invalid")}
        </Text>
        <Button asChild>
          <Link search={{}} to="/sign-in">
            {t("nav.signIn")}
          </Link>
        </Button>
      </AuthPage>
    );
  }
  return (
    <AuthPage
      icon={<CircleCheck />}
      title={t("auth.verifyEmail.title")}
      tone="success"
    >
      <Text role="status">{t("auth.verifyEmail.success")}</Text>
      {auth.status === "signedIn" ? (
        <Button onClick={continueOn}>{t("common.continue")}</Button>
      ) : (
        <Button asChild>
          <Link search={redirect ? { redirect } : {}} to="/sign-in">
            {t("nav.signIn")}
          </Link>
        </Button>
      )}
    </AuthPage>
  );
}
