import {
  exportFileName,
  serializeExport,
  useAccount,
  useDeleteAccountForm,
  useExport,
} from "@smog/account/client";
import { DELETE_CONFIRMATION } from "@smog/account/schema";
import { useAuthState } from "@smog/auth/react";
import { useTranslation } from "@smog/i18n/react";
import {
  AlertDialog,
  Avatar,
  Button,
  ErrorState,
  Field,
  Input,
  ListItem,
  Skeleton,
  Text,
  TextLink,
  useToast,
} from "@smog/ui-native";
import { useRouter } from "expo-router";
import { type ReactElement, useCallback } from "react";
import { ScrollView, View } from "react-native";
import { AnalyticsSwitch, openPrivacy } from "@/components/consent-sheet";
import { PreferencesFields } from "@/components/preferences-fields";
import { useAuthClient } from "@/lib/auth-client";
import { shareJsonFile, sweepExportFiles } from "@/lib/export-file";
import {
  ProfileSection,
  Section,
  SignInMethodsSection,
} from "./profile-methods";
import { useSignInAgain } from "./use-action-toast";

/** Back to settings, or home when the screen was opened without a stack. */
function leave(router: ReturnType<typeof useRouter>): void {
  if (router.canGoBack()) {
    router.back();
  } else {
    router.replace("/");
  }
}

function PrivacySection({ signedIn }: { signedIn: boolean }): ReactElement {
  const { t } = useTranslation();
  const { toast } = useToast();
  const { exportAccount, status } = useExport();
  const share = useCallback(async () => {
    try {
      await shareJsonFile(
        serializeExport(await exportAccount()),
        exportFileName(),
        t("account.privacy.shareTitle")
      );
    } catch {
      // Logged by `useExport` or `shareJsonFile`.
      toast({ title: t("account.privacy.exportFailed"), variant: "danger" });
    }
  }, [exportAccount, t, toast]);
  return (
    <Section title={t("account.privacy.title")}>
      <AnalyticsSwitch />
      <TextLink className="self-start" onPress={openPrivacy}>
        {t("account.privacy.policy")}
      </TextLink>
      {signedIn ? (
        <View className="gap-2">
          <Text size="body-sm" tone="muted">
            {t("account.privacy.exportDescription")}
          </Text>
          <Text size="body-sm" tone="warning">
            {t("account.export.sensitive")}
          </Text>
          <Button
            loading={status === "exporting"}
            onPress={share}
            variant="secondary"
          >
            {t("account.privacy.export")}
          </Button>
        </View>
      ) : null}
    </Section>
  );
}

/** Deletion: type DELETE (and the password), from `useDeleteAccountForm`. */
function DeleteSection({
  needsPassword,
}: {
  needsPassword: boolean;
}): ReactElement {
  const { t } = useTranslation();
  const { toast } = useToast();
  const client = useAuthClient();
  const router = useRouter();
  const signInAgain = useSignInAgain();
  // Any export file left on the device goes with the account.
  const signOut = useCallback(async () => {
    try {
      return await client.signOut();
    } finally {
      sweepExportFiles();
    }
  }, [client]);
  const form = useDeleteAccountForm({ needsPassword, signOut });
  const { confirm } = form;
  // Leave once deleted (the session then reads signed out).
  const onConfirm = useCallback(async () => {
    if (await confirm()) {
      toast({ title: t("account.delete.deleted"), variant: "success" });
      leave(router);
    }
  }, [confirm, router, t, toast]);

  return (
    <Section
      description={t("account.delete.description")}
      title={t("account.delete.title")}
    >
      <AlertDialog
        body={
          <>
            <Field
              label={t("account.delete.confirmLabel", {
                word: DELETE_CONFIRMATION,
              })}
            >
              <Input
                autoCapitalize="characters"
                autoComplete="off"
                autoCorrect={false}
                onChangeText={form.setTyped}
                value={form.typed}
              />
            </Field>
            {needsPassword ? (
              <Field label={t("account.delete.password")}>
                <Input
                  autoComplete="current-password"
                  onChangeText={form.setPassword}
                  secureTextEntry
                  value={form.password}
                />
              </Field>
            ) : null}
            {form.failureMessage ? (
              <View accessibilityRole="alert" className="gap-2">
                <Text size="body-sm" tone="danger">
                  {form.failureMessage}
                </Text>
                {form.failure === "SESSION_NOT_FRESH" ? (
                  <Button onPress={signInAgain} size="sm" variant="secondary">
                    {t("account.delete.signInAgain")}
                  </Button>
                ) : null}
              </View>
            ) : null}
          </>
        }
        confirmDisabled={!form.ready}
        confirmLabel={t("account.delete.action")}
        description={t("account.delete.dialogDescription")}
        loading={form.deleting}
        onConfirm={onConfirm}
        onOpenChange={form.onOpenChange}
        open={form.open}
        title={t("account.delete.dialogTitle")}
        tone="danger"
      >
        <Button variant="danger">{t("account.delete.action")}</Button>
      </AlertDialog>
    </Section>
  );
}

function SignedIn(): ReactElement | null {
  const { t } = useTranslation();
  const auth = useAuthState();
  const account = useAccount();
  const client = useAuthClient();
  const router = useRouter();
  const { toast } = useToast();
  const signOut = useCallback(async () => {
    try {
      const { error } = await client.signOut();
      if (error) {
        throw new Error(error.message ?? error.statusText);
      }
      toast({ title: t("auth.signedOut"), variant: "success" });
      leave(router);
    } catch (error) {
      console.error("[account] Failed to sign out:", error);
      toast({ title: t("auth.errors.generic"), variant: "danger" });
    }
  }, [client, router, t, toast]);
  const retry = useCallback(() => {
    account.refetch();
  }, [account]);
  const { user } = auth;
  if (!user) {
    return null;
  }
  return (
    <>
      <ListItem
        description={t("account.signedInAs", { email: user.email })}
        leading={<Avatar name={user.name} size="md" />}
        title={user.name}
      />
      {account.status === "loading" ? <Skeleton className="h-16" /> : null}
      {account.status === "error" ? <ErrorState onRetry={retry} /> : null}
      {account.status === "ready" ? (
        <>
          <ProfileSection account={account} />
          <SignInMethodsSection account={account} />
          <PrivacySection signedIn />
          <Section title={t("settings.preferences")}>
            <PreferencesFields />
          </Section>
          <Button onPress={signOut} variant="secondary">
            {t("nav.signOut")}
          </Button>
          <DeleteSection
            needsPassword={account.me?.methods.password ?? false}
          />
        </>
      ) : null}
    </>
  );
}

function Guest(): ReactElement {
  const { t } = useTranslation();
  const router = useRouter();
  const signIn = useCallback(() => router.push("/sign-in"), [router]);
  return (
    <>
      <Section
        description={t("account.guest.description")}
        title={t("account.guest.title")}
      >
        <Button onPress={signIn}>{t("nav.signIn")}</Button>
      </Section>
      <Section title={t("settings.preferences")}>
        <PreferencesFields />
      </Section>
      <PrivacySection signedIn={false} />
    </>
  );
}

/**
 * `settings/account` (spec §10, §16 flow 3): profile, sign-in methods,
 * privacy (consent, export through the share sheet), preferences and
 * deletion. Guests get a sign-in prompt and their device preferences.
 */
export function AccountScreen(): ReactElement {
  const auth = useAuthState();
  return (
    <ScrollView
      contentContainerClassName="gap-8 px-4 py-6"
      keyboardShouldPersistTaps="handled"
      testID="account-screen"
    >
      {auth.status === "signedIn" ? <SignedIn /> : null}
      {auth.status === "signedOut" ? <Guest /> : null}
      {auth.status === "loading" ? <Skeleton className="h-16" /> : null}
    </ScrollView>
  );
}
