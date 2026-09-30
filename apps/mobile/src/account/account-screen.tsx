import {
  deleteFailureMessage,
  exportFileName,
  serializeExport,
  useAccount,
  useDeleteAccount,
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
import { type ReactElement, useCallback, useRef, useState } from "react";
import { ScrollView, View } from "react-native";
import { AnalyticsSwitch, openPrivacy } from "@/components/consent-sheet";
import { PreferencesFields } from "@/components/preferences-fields";
import { useAuthClient } from "@/lib/auth-client";
import { shareJsonFile } from "@/lib/export-file";
import {
  ProfileSection,
  Section,
  SignInMethodsSection,
} from "./profile-methods";
import { useSignInAgain } from "./use-action-toast";

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

/** Deletion: type DELETE (and the password, when there is one). */
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
  // Leave the screen while signing out: `useDeleteAccount` then clears the
  // cache, and this screen's queries must not refetch for a deleted user.
  const signOut = useCallback(async () => {
    const result = await client.signOut();
    router.back();
    return result;
  }, [client, router]);
  const { deleteAccount, error, status } = useDeleteAccount({ signOut });
  const [open, setOpen] = useState(false);
  const [typed, setTyped] = useState("");
  const [password, setPassword] = useState("");
  const deleting = useRef(false);
  const ready =
    typed.trim() === DELETE_CONFIRMATION && (!needsPassword || password !== "");

  const onOpenChange = useCallback((next: boolean) => {
    // Confirming closes the dialog; it stays open while the call runs.
    if (next || !deleting.current) {
      setOpen(next);
    }
    if (!(next || deleting.current)) {
      setTyped("");
      setPassword("");
    }
  }, []);
  const confirm = useCallback(async () => {
    deleting.current = true;
    try {
      await deleteAccount({
        confirm: DELETE_CONFIRMATION,
        ...(needsPassword ? { password } : {}),
      });
    } catch {
      // The dialog shows `error`; `useDeleteAccount` logged it.
      return;
    } finally {
      deleting.current = false;
    }
    toast({ title: t("account.delete.deleted"), variant: "success" });
  }, [deleteAccount, needsPassword, password, t, toast]);

  const failure = status === "error" && error ? error : null;
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
                onChangeText={setTyped}
                value={typed}
              />
            </Field>
            {needsPassword ? (
              <Field label={t("account.delete.password")}>
                <Input
                  autoComplete="current-password"
                  onChangeText={setPassword}
                  secureTextEntry
                  value={password}
                />
              </Field>
            ) : null}
            {failure ? (
              <View accessibilityRole="alert" className="gap-2">
                <Text size="body-sm" tone="danger">
                  {t(deleteFailureMessage(failure))}
                </Text>
                {failure === "SESSION_NOT_FRESH" ? (
                  <Button onPress={signInAgain} size="sm" variant="secondary">
                    {t("account.delete.signInAgain")}
                  </Button>
                ) : null}
              </View>
            ) : null}
          </>
        }
        confirmDisabled={!ready}
        confirmLabel={t("account.delete.action")}
        description={t("account.delete.dialogDescription")}
        loading={status === "deleting"}
        onConfirm={confirm}
        onOpenChange={onOpenChange}
        open={open}
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
      router.back();
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
