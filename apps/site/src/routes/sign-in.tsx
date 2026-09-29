import { createFileRoute } from "@tanstack/react-router";
import type { ReactNode } from "react";
import { AuthForm } from "@/components/auth/auth-form";
import { pageMeta } from "@/lib/head";
import { validateAuthSearch } from "@/lib/redirect";

export const Route = createFileRoute("/sign-in")({
  component: SignIn,
  head: ({ matches }) => pageMeta(matches, "nav.signIn"),
  validateSearch: validateAuthSearch,
});

function SignIn(): ReactNode {
  const { error, redirect } = Route.useSearch();
  return <AuthForm error={error} mode="signIn" redirect={redirect ?? "/"} />;
}
