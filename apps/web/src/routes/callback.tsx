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
  const { isLoading, isAuthenticated } = useConvexAuth();

  useEffect(() => {
    // Wait for auth to finish loading
    if (isLoading) {
      return;
    }

    // Redirect based on authentication status
    if (isAuthenticated) {
      navigate({ to: "/dashboard" });
    } else {
      // If auth failed, redirect to home
      navigate({ to: "/" });
    }
  }, [isLoading, isAuthenticated, navigate]);

  return (
    <div className="flex h-screen items-center justify-center">
      <div className="text-center">
        <Loader2 className="mx-auto mb-4 h-8 w-8 animate-spin text-primary" />
        <h2 className="mb-2 font-semibold text-2xl">Signing you in...</h2>
        <p className="text-gray-600">
          Please wait while we complete authentication
        </p>
      </div>
    </div>
  );
}
