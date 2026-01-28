import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useConvexAuth } from "convex/react";
import { Loader2 } from "lucide-react";
import { useEffect } from "react";

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
  const { isLoading } = useConvexAuth();

  useEffect(() => {
    // Wait for auth to finish loading
    if (isLoading) {
      return;
    }

    navigate({ to: "/" });
  }, [isLoading, navigate]);

  return (
    <div className="flex h-screen items-center justify-center">
      <div className="text-center">
        <Loader2 className="mx-auto mb-4 h-8 w-8 animate-spin text-primary" />
        <h2 className="mb-2 font-semibold text-2xl">Even wachten...</h2>
        <p className="text-gray-600">
          We zijn bijna klaar met je in te loggen.
        </p>
      </div>
    </div>
  );
}
