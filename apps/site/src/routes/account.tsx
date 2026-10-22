import { type Account, useAccount } from "@smog/account/client";
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
import {
  ACCOUNT_SECTIONS,
  AccountNav,
  type AccountSectionId,
  GUEST_SECTIONS,
  isAccountSection,
} from "@/components/account/account-nav";
import {
  LanguageSection,
  PreferencesSection,
} from "@/components/account/preferences-section";
import {
  DeleteAccountSection,
  PrivacySection,
} from "@/components/account/privacy-section";
import { ProfileSection } from "@/components/account/profile-section";
import { SignInMethodsSection } from "@/components/account/sign-in-methods-section";
import { useSignOut } from "@/components/app-shell/user-menu";
import { Page } from "@/components/learning/page";
import { pageMeta } from "@/lib/head";

export interface AccountSearch {
  /** Set by Better Auth when linking Google or Apple failed. */
  error?: string;
  /** The settings section; the first one of the audience when absent. */
  section?: AccountSectionId;
}

export const Route = createFileRoute("/account")({
  component: AccountPage,
  head: ({ matches }) => pageMeta(matches, "account.title"),
  validateSearch: (search: Record<string, unknown>): AccountSearch => ({
    ...(typeof search.error === "string" ? { error: search.error } : {}),
    ...(isAccountSection(search.section) ? { section: search.section } : {}),
  }),
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
    navigate({
      replace: true,
      search: { section: "sign-in" },
      to: "/account",
    });
  }, [error, navigate, t, toast]);
}

/** The settings layout: the side navigation and the open section. */
function Layout({
  children,
  current,
  sections,
}: {
  children: ReactNode;
  current: AccountSectionId;
  sections: readonly AccountSectionId[];
}): ReactNode {
  return (
    <div className="flex flex-col gap-6 md:flex-row md:gap-8">
      <AccountNav current={current} sections={sections} />
      <div className="flex min-w-0 flex-1 flex-col gap-6">{children}</div>
    </div>
  );
}

/** The sections that are this browser's own: no account needed. */
function DeviceSection({
  section,
  signedIn,
}: {
  section: AccountSectionId;
  signedIn: boolean;
}): ReactNode {
  if (section === "language") {
    return <LanguageSection />;
  }
  if (section === "privacy") {
    return <PrivacySection signedIn={signedIn} />;
  }
  return <PreferencesSection />;
}

/** A guest: what an account adds, and the device's own settings. */
function GuestAccount({ section }: { section: AccountSectionId }): ReactNode {
  const { t } = useTranslation();
  const current = GUEST_SECTIONS.includes(section) ? section : "preferences";
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
      <Layout current={current} sections={GUEST_SECTIONS}>
        <DeviceSection section={current} signedIn={false} />
      </Layout>
    </>
  );
}

/** A section that needs the account read (profile, methods, deletion). */
function AccountSections({
  account,
  section,
}: {
  account: Account;
  section: AccountSectionId;
}): ReactNode {
  if (section === "sign-in") {
    return <SignInMethodsSection account={account} />;
  }
  if (section === "privacy") {
    return (
      <>
        <PrivacySection signedIn />
        <DeleteAccountSection account={account} />
      </>
    );
  }
  return <ProfileSection account={account} />;
}

function SignedInAccount({
  section,
}: {
  section: AccountSectionId;
}): ReactNode {
  const { t } = useTranslation();
  const auth = useAuthState();
  const account = useAccount();
  const signOut = useSignOut();
  useLinkError();
  const { user } = auth;
  if (!user) {
    return null;
  }
  let content: ReactNode;
  if (section === "preferences" || section === "language") {
    content = <DeviceSection section={section} signedIn />;
  } else if (account.status === "error") {
    content = <ErrorState level={2} onRetry={account.refetch} />;
  } else if (account.status === "loading") {
    content = <Skeleton className="h-64 w-full" />;
  } else {
    content = <AccountSections account={account} section={section} />;
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
      <Layout current={section} sections={ACCOUNT_SECTIONS}>
        {content}
      </Layout>
    </>
  );
}

/**
 * `/account` (spec §9, §16 flow 3, phase 10a): a settings layout with a
 * side navigation (profile, sign-in methods, preferences, language, privacy
 * and data) and one section at a time (`?section=`). Guests get a sign-in
 * prompt and their device's settings.
 */
function AccountPage(): ReactNode {
  const { t } = useTranslation();
  const auth = useAuthState();
  const { section } = Route.useSearch();
  return (
    <Page>
      <Heading level={1}>{t("account.title")}</Heading>
      {auth.status === "signedIn" ? (
        <SignedInAccount section={section ?? "profile"} />
      ) : null}
      {auth.status === "signedOut" ? (
        <GuestAccount section={section ?? "preferences"} />
      ) : null}
      {auth.status === "loading" ? <Skeleton className="h-64 w-full" /> : null}
    </Page>
  );
}
