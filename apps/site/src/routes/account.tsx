import { useAuthState } from "@smog/auth/react";
import { useTranslation } from "@smog/i18n/react";
import {
  Avatar,
  Button,
  Card,
  CardContent,
  CardFooter,
  Heading,
  Text,
  useToast,
} from "@smog/ui-web";
import { createFileRoute, redirect, useNavigate } from "@tanstack/react-router";
import { Fingerprint, LogOut } from "lucide-react";
import { type ReactNode, useCallback, useEffect, useState } from "react";
import { useSignOut } from "@/components/app-shell/user-menu";
import { useAuthClient } from "@/lib/auth-client";
import { pageMeta } from "@/lib/head";
import { usePasskeySupport } from "@/lib/passkeys";
import { getSessionUser } from "@/server/shell.functions";

export const Route = createFileRoute("/account")({
  beforeLoad: async () => {
    const user = await getSessionUser();
    if (!user) {
      throw redirect({ search: { redirect: "/account" }, to: "/sign-in" });
    }
  },
  component: Account,
  head: ({ matches }) => pageMeta(matches, "account.title"),
});

/** The account placeholder: who you are, add a passkey, sign out (phase 4 adds the rest). */
function Account(): ReactNode {
  const { t } = useTranslation();
  const auth = useAuthState();
  const client = useAuthClient();
  const navigate = useNavigate();
  const signOut = useSignOut();
  const { toast } = useToast();
  const passkeys = usePasskeySupport();
  const [adding, setAdding] = useState(false);

  useEffect(() => {
    if (auth.status === "signedOut") {
      navigate({ replace: true, to: "/" });
    }
  }, [auth.status, navigate]);

  const addPasskey = useCallback(async (): Promise<void> => {
    setAdding(true);
    try {
      const result = await client.passkey.addPasskey();
      toast(
        result?.error
          ? { title: t("auth.errors.passkeyFailed"), variant: "danger" }
          : { title: t("auth.passkey.added"), variant: "success" }
      );
    } catch (error) {
      console.error("[account] Failed to add a passkey:", error);
      toast({ title: t("auth.errors.passkeyFailed"), variant: "danger" });
    } finally {
      setAdding(false);
    }
  }, [client, t, toast]);

  const { user } = auth;
  return (
    <section className="mx-auto flex w-full max-w-content flex-col gap-6 px-4 py-10 md:px-6 lg:px-8">
      <Heading level={1}>{t("account.title")}</Heading>
      {user ? (
        <Card className="max-w-reading" variant="raised">
          <CardContent className="min-w-0 flex-row items-center gap-4">
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
          </CardContent>
          <CardFooter className="flex flex-wrap gap-2">
            {passkeys ? (
              <Button
                icon={<Fingerprint />}
                loading={adding}
                onClick={addPasskey}
                variant="secondary"
              >
                {t("auth.passkey.add")}
              </Button>
            ) : null}
            <Button icon={<LogOut />} onClick={signOut} variant="ghost">
              {t("nav.signOut")}
            </Button>
          </CardFooter>
        </Card>
      ) : null}
      <Text className="max-w-reading" tone="muted">
        {t("account.comingSoon")}
      </Text>
    </section>
  );
}
