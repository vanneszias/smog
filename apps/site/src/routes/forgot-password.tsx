import { createFileRoute } from "@tanstack/react-router";
import type { ReactNode } from "react";
import { AuthForm } from "@/components/auth/auth-form";
import { pageMeta } from "@/lib/head";
import { validateAuthSearch } from "@/lib/redirect";

export const Route = createFileRoute("/forgot-password")({
  component: ForgotPassword,
  head: ({ matches }) => pageMeta(matches, "auth.forgotPassword.title"),
  validateSearch: validateAuthSearch,
});

function ForgotPassword(): ReactNode {
  const { redirect } = Route.useSearch();
  return <AuthForm mode="forgotPassword" redirect={redirect ?? "/"} />;
}
