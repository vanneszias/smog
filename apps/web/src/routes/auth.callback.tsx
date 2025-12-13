import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useEffect } from "react";
import { useTranslation } from "react-i18next";
import { toast } from "sonner";
import { setAuthData } from "@/lib/auth-context";

export const Route = createFileRoute("/auth/callback")({
  component: AuthCallback,
});

async function exchangeCodeForUser(code: string) {
  const redirectUri =
    import.meta.env.VITE_WORKOS_REDIRECT_URI ||
    `${window.location.origin}/auth/callback`;

  console.log("[Auth Callback] Redirect URI:", redirectUri);
  console.log("[Auth Callback] Server URL:", import.meta.env.VITE_SERVER_URL);

  const url = `${import.meta.env.VITE_SERVER_URL}/auth/workos/callback`;
  console.log("[Auth Callback] Calling:", url);

  const response = await fetch(url, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      code,
      redirectUri,
    }),
  });

  console.log("[Auth Callback] Response status:", response.status);

  if (!response.ok) {
    const errorData = await response
      .json()
      .catch(() => ({ error: "Unknown error" }));
    console.error("[Auth Callback] Error response:", errorData);
    throw new Error(errorData.error || "Failed to authenticate");
  }

  return response.json();
}

function AuthCallback() {
  const { t } = useTranslation();
  const navigate = useNavigate();

  useEffect(() => {
    const handleCallback = async () => {
      try {
        const params = new URLSearchParams(window.location.search);
        const code = params.get("code");

        console.log("[Auth Callback] Code received:", !!code);

        if (!code) {
          throw new Error(t("web.auth.noAuthCode"));
        }

        const data = await exchangeCodeForUser(code);
        console.log("[Auth Callback] User authenticated:", data.email);

        const user = {
          id: data.workosId,
          email: data.email,
          firstName: data.firstName,
          lastName: data.lastName,
        };

        setAuthData(user, data.workosId);
        toast.success(t("web.auth.signedInSuccess"));
        navigate({ to: "/dashboard" });
      } catch (error) {
        console.error("Authentication error:", error);
        const errorMessage =
          error instanceof Error ? error.message : "Unknown error";
        toast.error(t("web.auth.signInFailed", { error: errorMessage }));
        navigate({ to: "/login" });
      }
    };

    handleCallback();
  }, [navigate, t]);

  return (
    <div className="flex h-screen items-center justify-center">
      <div className="text-center">
        <h2 className="mb-4 font-semibold text-2xl">
          {t("web.auth.signingIn")}
        </h2>
        <p className="text-gray-600">{t("web.auth.authenticationWait")}</p>
      </div>
    </div>
  );
}
