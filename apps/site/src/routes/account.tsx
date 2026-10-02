import { useAccount } from "@smog/account/client";
import { useAuthState } from "@smog/auth/react";
import { useTranslation } from "@smog/i18n/react";
import {
  Avatar,
  Button,
  Card,
  CardContent,
  CardDescription,
  CardFooter,
  CardTitle,
  ErrorState,
  Heading,
  Skeleton,
  Text,
  useToast,
} from "@smog/ui-web";
import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { LogIn, LogOut } from "lucide-react";
import { type ReactNode, useEffect } from "react";
import { PreferencesSection } from "@/components/account/preferences-section";
import {
  DeleteAccountSection,
  PrivacySection,
} from "@/components/account/privacy-section";
import { ProfileSection } from "@/components/account/profile-section";
import { SignInMethodsSection } from "@/components/account/sign-in-methods-section";
import { useSignOut } from "@/components/app-shell/user-menu";
import { pageMeta } from "@/lib/head";

export interface AccountSearch {
  /** Set by Better Auth when linking Google or Apple failed. */
  error?: string;
}

export const Route = createFileRoute("/account")({
  component: AccountPage,
  head: ({ matches }) => pageMeta(matches, "account.title"),
  validateSearch: (search: Record<string, unknown>): AccountSearch =>
    typeof search.error === "string" ? { error: search.error } : {},
});

/** A failed provider link comes back as `?error=`: say so once. */
function useLinkError(): void {
  const { t } = useTranslation();
  const { toast } = useToast();
  const { error } = Route.useSearch();
  const navigate = useNavigate();
  useEffect(() => {
    if (!error) {
      return;
    }
    toast({ title: t("auth.errors.generic"), variant: "danger" });
    navigate({ replace: true, search: {}, to: "/account" });
  }, [error, navigate, t, toast]);
}

/** A guest: what an account adds, and the device's own preferences. */
function GuestAccount(): ReactNode {
  const { t } = useTranslation();
  return (
    <>
      <Card variant="raised">
        <CardContent>
          <CardTitle level={2}>{t("account.guest.title")}</CardTitle>
          <CardDescription className="max-w-reading text-body">
            {t("account.guest.description")}
          </CardDescription>
        </CardContent>
        <CardFooter>
          <Button asChild icon={<LogIn />}>
            <Link search={{ redirect: "/account" }} to="/sign-in">
              {t("nav.signIn")}
            </Link>
          </Button>
        </CardFooter>
      </Card>
      <PreferencesSection />
      <PrivacySection signedIn={false} />
    </>
  );
}

function SignedInAccount(): ReactNode {
  const { t } = useTranslation();
  const auth = useAuthState();
  const account = useAccount();
  const signOut = useSignOut();
  useLinkError();
  const { user } = auth;
  if (!user) {
    return null;
  }
  return (
    <>
      <div className="flex min-w-0 flex-wrap items-center gap-4">
        <Avatar name={user.name} size="lg" src={user.image ?? undefined} />
        <div className="flex min-w-0 flex-1 flex-col">
          {/* A nameless user's name is their email: say it once. */}
          {user.name === user.email ? null : (
            <Text className="truncate" weight="semibold">
              {user.name}
            </Text>
          )}
          <Text className="truncate" size="body-sm" tone="muted">
            {t("account.signedInAs", { email: user.email })}
          </Text>
        </div>
        <Button icon={<LogOut />} onClick={signOut} variant="ghost">
          {t("nav.signOut")}
        </Button>
      </div>
      {account.status === "error" ? (
        <ErrorState level={2} onRetry={account.refetch} />
      ) : null}
      {account.status === "loading" ? (
        <Skeleton className="h-64 w-full" />
      ) : null}
      {account.status === "ready" ? (
        <>
          <ProfileSection account={account} />
          <SignInMethodsSection account={account} />
          <PrivacySection signedIn />
          <PreferencesSection />
          <DeleteAccountSection account={account} />
        </>
      ) : null}
    </>
  );
}

/**
 * `/account` (spec §9, §16 flow 3): profile, sign-in methods, privacy
 * (consent, export), preferences and deletion. Guests get a sign-in
 * prompt and their device preferences.
 */
function AccountPage(): ReactNode {
  const { t } = useTranslation();
  const auth = useAuthState();
  return (
    <section className="mx-auto flex w-full max-w-reading flex-col gap-6 px-4 py-10 md:px-6 lg:px-8">
      <Heading level={1}>{t("account.title")}</Heading>
      {auth.status === "signedIn" ? <SignedInAccount /> : null}
      {auth.status === "signedOut" ? <GuestAccount /> : null}
      {auth.status === "loading" ? <Skeleton className="h-64 w-full" /> : null}
    </section>
  );
}
