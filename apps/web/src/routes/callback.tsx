import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { Loader2 } from "lucide-react";
import { useEffect } from "react";
import { useTranslation } from "react-i18next";
import { useAuth } from "@/lib/auth";

export const Route = createFileRoute("/callback")({
  component: AuthCallback,
});

/**
 * OAuth Callback Handler
 *
 * This route handles the OAuth callback from WorkOS.
 * The AuthKitProvider automatically handles the token exchange.
 * We just need to wait for authentication to complete and redirect.
 */
function AuthCallback() {
  const navigate = useNavigate();
  const { t } = useTranslation();
  const { isLoading, isAuthenticated } = useAuth();

  useEffect(() => {
    // Wait for auth to finish loading
    if (isLoading) {
      return;
    }

    navigate({ to: isAuthenticated ? "/" : "/login" });
  }, [isAuthenticated, isLoading, navigate]);

  return (
    <output
      aria-live="polite"
      className="flex h-full items-center justify-center"
    >
      <div className="text-center">
        <Loader2 className="mx-auto mb-4 h-8 w-8 animate-spin text-primary" />
        <h1 className="mb-2 font-semibold text-2xl">
          {t("web.auth.signingIn")}
        </h1>
        <p className="text-muted-foreground">
          {t("web.auth.authenticationWait")}
        </p>
      </div>
    </output>
  );
}
