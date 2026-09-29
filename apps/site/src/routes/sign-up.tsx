import { createFileRoute } from "@tanstack/react-router";
import type { ReactNode } from "react";
import { AuthForm } from "@/components/auth/auth-form";
import { pageMeta } from "@/lib/head";
import { validateAuthSearch } from "@/lib/redirect";

export const Route = createFileRoute("/sign-up")({
  component: SignUp,
  head: ({ matches }) => pageMeta(matches, "auth.signUpTitle"),
  validateSearch: validateAuthSearch,
});

function SignUp(): ReactNode {
  const { error, redirect } = Route.useSearch();
  return <AuthForm error={error} mode="signUp" redirect={redirect ?? "/"} />;
}
